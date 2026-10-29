import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadgater as core, gates } from '../src/core/providers/downloadgater';
import { authorizationUrl, downloadgater } from '../src/extension/providers/downloadgater';
import type { ProviderContext } from '../src/core';

const broker = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../src/extension/platform/browser', () => ({
  extension: { runtime: { sendMessage: broker.sendMessage } },
}));

const id = 'artist-track-12345';
const pageUrl = new URL(`https://downloadgater.com/g/${id}`);
const token = 'authored-gate-receipt-value-123456789';
const docs: Document[] = [];
function fixture(
  options: {
    steps?: Record<string, string>;
    email?: boolean;
    paid?: boolean;
    protected?: boolean;
    hydrated?: boolean;
    id?: string;
  } = {},
) {
  const model = {
    kind: 'gate',
    link: {
      id: options.id ?? id,
      title: 'Original song',
      songTitle: 'Original song',
      gates: options.steps ?? { soundcloudFollow: 'required', soundcloudRepost: 'required' },
      emailCapture: options.email ? 'required' : 'not-required',
      hasProtectedDownload: options.protected ?? true,
      ...(options.paid ? { paidDownload: { amountCents: 500 } } : {}),
      audioPreviewUrl: 'https://files.example/preview.mp3',
      creatorContact: 'must-not-leak',
    },
  };
  const html = `<div id="root"><h1>Original song</h1></div><script type="module" src="/assets/index-authored.js"></script>${options.hydrated ? '' : `<script id="__GATE_DATA__" type="application/json">${JSON.stringify(model)}</script>`}`;
  const document = new DOMParser().parseFromString(html, 'text/html');
  docs.push(document);
  return document;
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function context(
  fetcher: typeof fetch = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 204 })),
): ProviderContext {
  return {
    pageUrl,
    fetch: fetcher,
    probePublicFile: async () => null,
    automate: true,
    parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
  };
}
afterEach(() => {
  for (const document of docs.splice(0)) downloadgater.cancelActions?.(document, pageUrl);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DownloadGater native download contract', () => {
  it.each([
    'https://downloadgater.com/g/artist-track-12345',
    'https://downloadgater.com/g/ABC_12-34/',
  ])('matches exact current gate route %s', (address) =>
    expect(core.matches(new URL(address))).toBe(true),
  );
  it.each([
    'http://downloadgater.com/g/artist-track-12345',
    'https://www.downloadgater.com/g/artist-track-12345',
    'https://downloadgater.com.evil.example/g/artist-track-12345',
    'https://user:secret@downloadgater.com/g/artist-track-12345',
    'https://downloadgater.com/g/x/more',
    'https://downloadgater.com/api/download/x',
    'https://downloadgater.com/g/x%2Fy',
  ])('rejects unsupported route %s', (address) =>
    expect(core.matches(new URL(address))).toBe(false),
  );
  it('inspects bounded metadata without exposing previews, file internals or creator values', () => {
    const document = fixture({ steps: { soundcloudComment: 'required' } }),
      gate = core.inspect(document, pageUrl)!;
    expect(gate).toMatchObject({
      provider: 'downloadgater',
      id,
      title: 'Original song',
      steps: ['soundcloudComment'],
      inputs: [{ kind: 'soundcloud-comment', required: true }],
      metadata: {},
    });
    expect(JSON.stringify(gate)).not.toMatch(/preview|must-not-leak/);
  });
  it('rejects mismatched IDs and native script decoys', () => {
    expect(core.inspect(fixture({ id: 'another-track' }), pageUrl)).toBeNull();
    const document = fixture();
    document
      .querySelector('script[src]')!
      .setAttribute('src', 'https://evil.example/assets/index-authored.js');
    expect(core.inspect(document, pageUrl)).toBeNull();
  });
  it('requires exact HTTP 204 preflight before releasing the original native file URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await core.resolve(core.inspect(fixture(), pageUrl)!, context(fetcher))).toEqual({
      ok: true,
      url: `https://downloadgater.com/api/download/${id}`,
      kind: 'file',
      method: 'provider-request',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(
      `https://downloadgater.com/api/download/${id}?preflight=1`,
    );
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  });
  it('never treats HTTP 200 JSON or audio as preflight approval', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ ok: true, url: 'https://files.example/preview.mp3' }));
    expect(await core.resolve(core.inspect(fixture(), pageUrl)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it('keeps required login as a refusal and exposes the correct sign-in action', async () => {
    const document = fixture(),
      gate = core.inspect(document, pageUrl)!;
    expect(
      await core.resolve(
        gate,
        context(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({ code: 'soundcloud_unlock_required' }, 403)),
        ),
      ),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(downloadgater.actions?.(document, pageUrl)).toMatchObject([
      { id: 'downloadgater-soundcloud', kind: 'sign-in', required: true },
    ]);
  });
  it('requires user-authored comment text before starting comment authorization', async () => {
    const document = fixture({ steps: { soundcloudComment: 'required' } }),
      gate = core.inspect(document, pageUrl)!;
    expect(
      await core.resolve(
        gate,
        context(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({ code: 'soundcloud_unlock_required' }, 403)),
        ),
      ),
    ).toMatchObject({ ok: false, code: 'input-required' });
    expect(downloadgater.actions?.(document, pageUrl)).toEqual([]);
  });
  it('submits only the fixed required email through the native endpoint', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const gate = core.inspect(fixture({ email: true }), pageUrl)!;
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({ ok: true });
    expect(fetcher.mock.calls[0]![0]).toBe(`https://downloadgater.com/api/links/${id}/email`);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      email: 'gatebreakeros@proton.me',
    });
  });
  it('never submits an email without explicit automation', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await core.resolve(core.inspect(fixture({ email: true }), pageUrl)!, {
        ...context(fetcher),
        automate: false,
      }),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ paid: true }, { protected: false }])(
    'does not fabricate paid or unsupported layout access %j',
    async (options) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(
        await core.resolve(core.inspect(fixture(options), pageUrl)!, context(fetcher)),
      ).toMatchObject({ ok: false, code: 'not-supported' });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('refetches only the exact inert gate HTML after bootstrap consumption', async () => {
    const source = fixture().documentElement.outerHTML;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(source, { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(
      await core.resolve(core.inspect(fixture({ hydrated: true }), pageUrl)!, context(fetcher)),
    ).toMatchObject({ ok: true });
    expect(fetcher.mock.calls[0]![0]).toBe(pageUrl.href);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error',
    });
  });
  it('includes only scoped opaque gate receipts and preserves the native SoundCloud alias', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const read = vi.fn((_provider, _id, driver) =>
      driver === 'soundcloud' ? token : 'authored-spotify-receipt-123456789',
    );
    const result = await core.resolve(core.inspect(fixture(), pageUrl)!, {
      ...context(fetcher),
      readNativeReceipt: read,
    });
    expect(result.ok).toBe(true);
    expect(read).toHaveBeenCalledWith('downloadgater', id, 'soundcloud');
    const query = new URL(String(fetcher.mock.calls[0]![0])).searchParams;
    expect(query.get('soundcloudToken')).toBe(token);
    expect(query.get('token')).toBe(token);
    expect(query.get('spotifyToken')).toBe('authored-spotify-receipt-123456789');
  });
  it('does not reuse a receipt rejected by the final server', async () => {
    const document = fixture(),
      gate = core.inspect(document, pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ code: 'expired_unlock' }, 403));
    await core.resolve(gate, { ...context(fetcher), readNativeReceipt: () => token });
    await core.resolve(gate, { ...context(fetcher), readNativeReceipt: () => token });
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.has('token')).toBe(false);
  });
  it.each([429, 404, 500])('reports HTTP %s without granting a file', async (status) => {
    expect(
      await core.resolve(
        core.inspect(fixture(), pageUrl)!,
        context(vi.fn<typeof fetch>().mockResolvedValue(response({}, status))),
      ),
    ).toMatchObject({
      ok: false,
      code: status === 429 ? 'rate-limited' : status === 404 ? 'not-supported' : 'network-error',
    });
  });
  it('rejects malformed JSON and honors cancellation', async () => {
    const gate = core.inspect(fixture(), pageUrl)!;
    expect(
      await core.resolve(
        gate,
        context(
          vi.fn<typeof fetch>().mockResolvedValue(
            new Response('{bad', {
              status: 403,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        ),
      ),
    ).toMatchObject({ ok: false, code: 'invalid-response' });
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      core.resolve(gate, { ...context(fetcher), signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('DownloadGater native authorization window', () => {
  function authUrl(driver = 'soundcloud') {
    const params = new URLSearchParams({
      client_id: 'authored-client',
      state: 'authored-state',
      response_type: 'code',
      redirect_uri: `https://downloadgater.com/api/${driver}/callback`,
    });
    return `https://${driver === 'soundcloud' ? 'secure.soundcloud.com' : 'accounts.spotify.com'}/authorize?${params}`;
  }
  function browserFixture(options: Parameters<typeof fixture>[0] = {}) {
    const document = fixture(options),
      storage = new Map<string, string>();
    broker.sendMessage.mockImplementation(async (value) =>
      value.type.endsWith('auth-open')
        ? { opened: true }
        : value.type.endsWith('auth-heartbeat')
          ? { active: true }
          : { cancelled: true },
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ authorizationUrl: authUrl() }));
    const open = vi.fn();
    const view = {
      open,
      fetch: fetcher,
      sessionStorage: { getItem: (key: string) => storage.get(key) ?? null },
      dispatchEvent: vi.fn(),
    };
    Object.defineProperty(document, 'defaultView', { value: view });
    const gate = downloadgater.inspect(document, pageUrl)!;
    const state = gates.get(gate)!;
    state.required.add('soundcloud');
    return { document, storage, fetcher, open, gate, state };
  }
  it('validates first-party authorization and exact callback ownership', () => {
    expect(authorizationUrl(authUrl(), 'soundcloud')).toBe(authUrl());
    expect(authorizationUrl(authUrl('spotify'), 'spotify')).toBe(authUrl('spotify'));
    for (const value of [
      authUrl().replace('secure.soundcloud.com', 'evil.example'),
      authUrl().replace(
        encodeURIComponent('https://downloadgater.com/api/soundcloud/callback'),
        encodeURIComponent('https://evil.example/callback'),
      ),
      authUrl() + '&state=duplicate',
    ])
      expect(authorizationUrl(value, 'soundcloud')).toBeNull();
  });
  it('starts native authorization without clicking original controls and accepts only its returned gate receipt', async () => {
    const test = browserFixture();
    expect(
      downloadgater.performAction?.('downloadgater-soundcloud', test.document, pageUrl, 'activate'),
    ).toMatchObject({ ok: true });
    await vi.waitFor(() =>
      expect(broker.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gatebreaker:downloadgater-auth-open',
          address: authUrl(),
          gateId: id,
        }),
      ),
    );
    expect(test.open).not.toHaveBeenCalled();
    expect(test.fetcher.mock.calls[0]![0]).toBe('https://downloadgater.com/api/soundcloud/start');
    expect(JSON.parse(String(test.fetcher.mock.calls[0]![1]?.body))).toEqual({ linkId: id });
    broker.sendMessage.mockImplementation(async (value) =>
      value.type.endsWith('auth-heartbeat')
        ? { active: true, receipt: token }
        : { cancelled: true },
    );
    downloadgater.actionProgress?.('downloadgater-soundcloud', test.document, pageUrl);
    await vi.waitFor(() => expect(test.state.receipts.soundcloud).toBe(token));
    expect(
      downloadgater.actionProgress?.('downloadgater-soundcloud', test.document, pageUrl),
    ).toMatchObject({ state: 'complete' });
    expect(test.storage.size).toBe(0);
  });
  it('submits only user-authored required comment text to native authorization', async () => {
    const test = browserFixture({ steps: { soundcloudComment: 'required' } });
    test.state.preferences = { soundcloudComment: '  Authored reusable comment.  ' };
    downloadgater.performAction?.('downloadgater-soundcloud', test.document, pageUrl, 'activate');
    await vi.waitFor(() => expect(test.fetcher).toHaveBeenCalledOnce());
    expect(JSON.parse(String(test.fetcher.mock.calls[0]![1]?.body))).toEqual({
      linkId: id,
      soundCloudComment: 'Authored reusable comment.',
    });
  });
  it('does not heartbeat or cancel while the native start request is pending', async () => {
    const test = browserFixture();
    let finish!: (value: Response) => void;
    test.fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    downloadgater.performAction?.('downloadgater-soundcloud', test.document, pageUrl, 'activate');
    expect(
      downloadgater.actionProgress?.('downloadgater-soundcloud', test.document, pageUrl),
    ).toMatchObject({ state: 'waiting' });
    expect(broker.sendMessage).not.toHaveBeenCalled();
    finish(response({ authorizationUrl: authUrl() }));
    await vi.waitFor(() =>
      expect(broker.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gatebreaker:downloadgater-auth-open' }),
      ),
    );
  });
  it('rejects wrong-gate and expired native receipts', () => {
    const test = browserFixture();
    test.storage.set(
      `downloadgater.soundcloudUnlock.other`,
      JSON.stringify({ token, createdAt: Date.now() }),
    );
    expect(
      downloadgater.actionProgress?.('downloadgater-soundcloud', test.document, pageUrl),
    ).toBeNull();
    test.storage.set(
      `downloadgater.soundcloudUnlock.${id}`,
      JSON.stringify({ token, createdAt: Date.now() - 15 * 60 * 1000 }),
    );
    expect(
      downloadgater.actionProgress?.('downloadgater-soundcloud', test.document, pageUrl),
    ).toBeNull();
  });
  it('cancels only the owned authorization window', async () => {
    const test = browserFixture();
    downloadgater.performAction?.('downloadgater-soundcloud', test.document, pageUrl, 'activate');
    await vi.waitFor(() =>
      expect(broker.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gatebreaker:downloadgater-auth-open' }),
      ),
    );
    downloadgater.cancelActions?.(test.document, pageUrl);
    expect(broker.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gatebreaker:downloadgater-auth-cancel' }),
    );
    expect(test.state.receipts).toEqual({});
  });
});
