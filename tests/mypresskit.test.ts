import { afterEach, describe, expect, it, vi } from 'vitest';
import { mypresskit as core, documents } from '../src/core/providers/mypresskit';
import { mypresskit } from '../src/extension/providers/mypresskit';
import type { ProviderContext } from '../src/core';

const pageUrl = new URL('https://www.mypresskit.info/gate/authored-track');
type Step = { index: number; type: string; required: boolean };
const action = (type: string, index = 0): Step => ({ index, type, required: true });
function fixture(
  steps: Step[] = [],
  extra: Record<string, unknown> = {},
  providers = { soundcloudOAuth: true, spotifyOAuth: true },
): Document {
  const gate = {
    id: '30',
    handle: 'authored-track',
    title: 'Authored MyPressKit track',
    gateSteps: steps,
    availability: { state: 'available' },
    combineSoundCloudSteps: false,
    ...extra,
  };
  const row = [
    '$',
    '$L1',
    null,
    {
      gate,
      providers,
      initialCompletedStepIndexes: [],
      initialCapturedEmail: null,
      initialUnlocked: false,
    },
  ];
  const flight = '5:' + JSON.stringify(row) + '\n';
  const html = `<h1>Authored MyPressKit track</h1><audio src="/api/download-gates/30/preview"></audio><script src="/_next/static/chunks/app/(frontend)/gate/%5Bhandle%5D/page-authored.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
  return new DOMParser().parseFromString(html, 'text/html');
}
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const verification = (
  remaining: number[],
  unlocked = false,
  token: string | null = null,
  completed: number[] = [],
) =>
  response({
    unlockState: { unlocked, remaining, total: remaining.length },
    completedStepIndexes: completed,
    downloadToken: token,
  });
function context(
  fetch: typeof globalThis.fetch,
  overrides: Partial<ProviderContext> = {},
): ProviderContext {
  return { pageUrl, fetch, probePublicFile: async () => null, automate: true, ...overrides };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('MyPressKit gate parsing', () => {
  it.each(['https://www.mypresskit.info/gate/a', 'https://mypresskit.info/gate/artist-track-12'])(
    'recognizes %s',
    (url) => expect(core.matches(new URL(url))).toBe(true),
  );
  it.each([
    'http://www.mypresskit.info/gate/a',
    'https://www.mypresskit.info.evil.test/gate/a',
    'https://www.mypresskit.info/login',
    'https://www.mypresskit.info/gate/a/other',
    'https://user:secret@www.mypresskit.info/gate/a',
    'https://www.mypresskit.info:8443/gate/a',
  ])('rejects %s', (url) => expect(core.matches(new URL(url))).toBe(false));
  it('parses only matching bounded native gate props without preview/account metadata', () => {
    const document = fixture([action('soundcloud-comment')], {
      owner: { email: 'not-for-summary@example.test' },
    });
    const gate = core.inspect(document, pageUrl)!;
    expect(gate).toMatchObject({
      provider: 'mypresskit',
      id: '30',
      title: 'Authored MyPressKit track',
      steps: ['soundcloud-comment'],
      inputs: [{ kind: 'soundcloud-comment', required: true }],
      metadata: {},
    });
    expect(JSON.stringify(gate)).not.toContain('preview');
    expect(JSON.stringify(gate)).not.toContain('not-for-summary');
    expect(core.inspect(fixture([], { handle: 'other-track' }), pageUrl)).toBeNull();
  });
  it('rejects script-base decoys, executable bootstrap, duplicate gates and duplicate step indexes', () => {
    const foreign = fixture();
    foreign
      .querySelector('script[src]')!
      .setAttribute(
        'src',
        'https://evil.test/_next/static/chunks/app/(frontend)/gate/[handle]/page-x.js',
      );
    expect(core.inspect(foreign, pageUrl)).toBeNull();
    const executable = fixture();
    executable.querySelector('script:not([src])')!.textContent += ';window.untrusted=true';
    expect(core.inspect(executable, pageUrl)).toBeNull();
    const duplicate = fixture();
    duplicate.body.append(duplicate.querySelector('script:not([src])')!.cloneNode(true));
    expect(core.inspect(duplicate, pageUrl)).toBeNull();
    expect(
      core.inspect(fixture([action('email-capture'), action('instagram-follow')]), pageUrl),
    ).toBeNull();
  });
});

describe('MyPressKit original download protocol', () => {
  it('requires both a server unlock and a bounded token, and returns only the fixed original endpoint', async () => {
    const document = fixture();
    const gate = core.inspect(document, pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(verification([], true, 'authored.token/+='));
    expect(await core.resolve(gate, context(fetcher))).toEqual({
      ok: true,
      kind: 'file',
      method: 'provider-request',
      url: 'https://www.mypresskit.info/api/download-gates/30/download?token=authored.token%2F%2B%3D',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://www.mypresskit.info/api/download-gates/30/verify-step',
    );
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: 'include', redirect: 'error' });
  });
  it.each([
    [false, 'authored-token'],
    [true, null],
  ] as const)('does not confuse token/approval alone with release', async (unlocked, token) => {
    const gate = core.inspect(fixture(), pageUrl)!;
    expect(
      await core.resolve(
        gate,
        context(vi.fn<typeof fetch>().mockResolvedValue(verification([], unlocked, token))),
      ),
    ).toMatchObject({ ok: false, code: 'server-required' });
  });
  it('acknowledges a declared ordinary action by HTTP, then verifies fresh server approval', async () => {
    const gate = core.inspect(fixture([action('instagram-follow')]), pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(verification([0]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(verification([], true, 'authored-grant', [0]));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({ ok: true });
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual([
      'verify-step',
      'track-step',
      'verify-step',
    ]);
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({ stepIndex: 0 });
  });
  it('submits only the configured email, never a fabricated comment', async () => {
    const gate = core.inspect(fixture([action('email-capture')]), pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(verification([0]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(verification([], true, 'authored-grant', [0]));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({ ok: true });
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({
      stepIndex: 0,
      email: 'gatebreakeros@proton.me',
    });
  });
  it('does not repeatedly submit an unconfirmed acknowledgment', async () => {
    const gate = core.inspect(fixture([action('youtube-subscribe')]), pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(verification([0]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(verification([0]));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('requires explicit automation before sending email or ordinary steps', async () => {
    const gate = core.inspect(fixture([action('email-capture')]), pageUrl)!;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(verification([0]));
    expect(await core.resolve(gate, context(fetcher, { automate: false }))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not turn a rate-limited step submission into a login request', async () => {
    const gate = core.inspect(fixture([action('instagram-follow')]), pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(verification([0]))
      .mockResolvedValueOnce(response({}, 429));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'rate-limited',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects control characters and oversized grant tokens', async () => {
    for (const token of ['authored\ninvalid', 'a'.repeat(8193)]) {
      const gate = core.inspect(fixture(), pageUrl)!;
      expect(
        await core.resolve(
          gate,
          context(vi.fn<typeof fetch>().mockResolvedValue(verification([], true, token))),
        ),
      ).toMatchObject({ ok: false, code: 'invalid-response' });
    }
  });
  it('does not acknowledge account/unknown requirements as generic clicks', async () => {
    for (const type of ['soundcloud-repost', 'spotify-save', 'future-paid-step']) {
      const gate = core.inspect(fixture([action(type)]), pageUrl)!;
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(verification([0]));
      expect(await core.resolve(gate, context(fetcher))).toMatchObject({
        ok: false,
        code: 'server-required',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('stops unavailable gates before requests', async () => {
    const gate = core.inspect(fixture([], { availability: { state: 'paused' } }), pageUrl)!;
    const fetcher = vi.fn<typeof fetch>();
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'session-expired'],
    [403, 'session-expired'],
    [429, 'rate-limited'],
    [404, 'not-supported'],
  ] as const)('preserves verification HTTP %s refusal', async (status, code) => {
    const gate = core.inspect(fixture(), pageUrl)!;
    expect(
      await core.resolve(
        gate,
        context(vi.fn<typeof fetch>().mockResolvedValue(response({}, status))),
      ),
    ).toMatchObject({ ok: false, code });
  });
  it('rejects malformed verification and indexes outside this exact gate', async () => {
    const gate = core.inspect(fixture(), pageUrl)!;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(verification([99], true, 'not-approved-for-this-model'));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it('honors cancellation before starting requests', async () => {
    const gate = core.inspect(fixture(), pageUrl)!;
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      core.resolve(gate, context(fetcher, { signal: AbortSignal.abort() })),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('MyPressKit native authorization host', () => {
  it('requires user comment text before starting a comment OAuth step', async () => {
    const document = fixture([action('soundcloud-comment')]);
    const gate = core.inspect(document, pageUrl)!;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(verification([0]));
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'input-required',
    });
    expect(mypresskit.actions!(document, pageUrl)).toEqual([]);
  });
  it('builds the source-derived native SoundCloud URL with only the configured comment', async () => {
    const document = fixture([action('soundcloud-comment')]);
    const gate = core.inspect(document, pageUrl)!;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(verification([0]));
    await core.resolve(
      gate,
      context(fetcher, { preferences: { soundcloudComment: 'My authored comment' } }),
    );
    const popup = { closed: false, close: vi.fn() };
    const open = vi.fn<(address: string, ...options: string[]) => typeof popup>(() => popup);
    Object.defineProperty(document, 'defaultView', { value: { open, fetch: fetcher } });
    const interaction = mypresskit.actions!(document, pageUrl)[0]!;
    expect(interaction).toMatchObject({ kind: 'sign-in', required: true });
    expect(mypresskit.performAction!(interaction.id, document, pageUrl, 'activate')).toMatchObject({
      ok: true,
    });
    const address = new URL(open.mock.calls[0]![0] as string);
    expect(address.origin + address.pathname).toBe(
      'https://www.mypresskit.info/api/download-gates/oauth/soundcloud/start',
    );
    expect(Object.fromEntries(address.searchParams)).toEqual({
      gate: '30',
      step: '0',
      popup: '1',
      comment: 'My authored comment',
    });
    mypresskit.cancelActions!(document, pageUrl);
    expect(popup.close).toHaveBeenCalledOnce();
  });
  it('supports combined SoundCloud authorization and Spotify without forging completion', async () => {
    for (const [steps, extra, service] of [
      [
        [action('soundcloud-follow'), action('soundcloud-repost', 1)],
        { combineSoundCloudSteps: true },
        'soundcloud',
      ],
      [[action('spotify-save')], {}, 'spotify'],
    ] as const) {
      const document = fixture([...steps], extra);
      const gate = core.inspect(document, pageUrl)!;
      await core.resolve(
        gate,
        context(vi.fn<typeof fetch>().mockResolvedValue(verification(steps.map((s) => s.index)))),
      );
      const current = documents.get(document)!;
      expect(current.pending!.service).toBe(service);
      expect(current.pending!.step).toBe(service === 'soundcloud' ? -1 : 0);
      expect(mypresskit.actionProgress!(current.pending!.id, document, pageUrl)).toBeNull();
      expect(
        mypresskit.performAction!(current.pending!.id, document, pageUrl, 'reveal'),
      ).toMatchObject({ ok: false });
    }
  });
  it('only marks authorization complete after fresh server verification', async () => {
    vi.useFakeTimers();
    const document = fixture([action('soundcloud-follow')]);
    const gate = core.inspect(document, pageUrl)!;
    await core.resolve(gate, context(vi.fn<typeof fetch>().mockResolvedValue(verification([0]))));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => verification([], true, 'authored-after-login', [0]));
    const popup = { closed: false, close: vi.fn() };
    Object.defineProperty(document, 'defaultView', {
      value: { open: vi.fn(() => popup), fetch: fetcher },
    });
    const interaction = mypresskit.actions!(document, pageUrl)[0]!;
    mypresskit.performAction!(interaction.id, document, pageUrl, 'activate');
    await vi.advanceTimersByTimeAsync(1);
    expect(mypresskit.actionProgress!(interaction.id, document, pageUrl)).toMatchObject({
      state: 'complete',
    });
    expect(popup.close).toHaveBeenCalledOnce();
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({ ok: true });
    mypresskit.cancelActions!(document, pageUrl);
  });
});
