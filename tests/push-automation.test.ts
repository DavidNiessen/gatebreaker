import { beforeEach, describe, expect, it, vi } from 'vitest';
import { push } from '../src/providers/push';
import type { ProviderContext } from '../src/domain/provider';

const url = new URL('https://push.fm/cu/fixture');
const destination = 'https://example.org/music.zip';
function action(driver = 'youtube-subscribe', id = 10, required = true, native = true) {
  return {
    id,
    driver,
    required,
    provider: { client_authentication: native, client_execution: native },
  };
}
function metadata(actions = [action()], minimum = 1) {
  return {
    slug: 'fixture',
    title: 'Track',
    type: 'url',
    content_count: 1,
    actions,
    minimum_actions: minimum,
  };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function context(responses: Response[], automate = true): ProviderContext {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return { pageUrl: url, fetch, probePublicFile: vi.fn(), automate };
}
function nativeSpotify(driver = 'follow', required = true) {
  const label = driver === 'follow-playlist' ? 'Follow playlist on Spotify' : 'Follow on Spotify';
  const button = document.createElement('button');
  button.className = `btn-spotify ${required ? 'action-required' : ''}`;
  button.textContent = label;
  document.querySelector('#app')!.append(button);
  return button;
}
function receipt(
  driver: string,
  token = 'native-gate-receipt',
  origin = 'https://push.fm',
  source?: Window | null,
) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { driver, token },
      origin,
      source: source === undefined ? frame.contentWindow : source,
    }),
  );
}
beforeEach(() => {
  document.head.innerHTML =
    '<meta name="csrf-token" content="native-csrf-fixture-000000000000"><meta property="og:title" content="Track">';
  document.body.innerHTML =
    '<div id="app"></div><script type="fixture/javascript" src="https://d29xpkeqnsbaz3.cloudfront.net/release/js/products.js"></script>';
});

describe('PUSH native click acknowledgements', () => {
  it('does no network work while inspecting or listing native controls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    nativeSpotify();
    expect(push.inspect(document, url)).not.toBeNull();
    expect(push.actions!(document, url)).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the anonymous diagnostic path at two GETs even for gated metadata', async () => {
    const ctx = context([json(metadata()), json({}, 403)], false);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(ctx.fetch)
        .mock.calls.every(
          ([, options]) => options?.method === 'GET' && options.credentials === 'omit',
        ),
    ).toBe(true);
  });
  it('does not issue acknowledgements when the public reward is already released', async () => {
    const ctx = context([json(metadata()), json({ body: destination })]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: true,
      url: destination,
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    'twitter-follow',
    'youtube-subscribe',
    'soundcloud-follow',
    'instagram-follow',
    'tiktok-follow',
  ])('uses only native returned %s gate receipts', async (driver) => {
    const ctx = context([
      json(metadata([action(driver)])),
      json({}, 403),
      json({ driver, token: 'opaque-native-receipt' }),
      json({ body: destination }),
    ]);
    const gate = push.inspect(document, url)!;
    expect(await push.resolve(gate, ctx)).toMatchObject({ ok: true, url: destination });
    const calls = vi.mocked(ctx.fetch).mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[2]![0]).toBe('https://push.fm/unlock/fixture/action/10');
    expect(calls[2]![1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-TOKEN': 'native-csrf-fixture-000000000000' },
      redirect: 'error',
    });
    expect(calls[2]![1]?.body).toBeUndefined();
    const final = new URL(calls[3]![0] as string);
    expect(JSON.parse(atob(final.searchParams.get('token')!))).toEqual({
      actions: { [driver]: 'opaque-native-receipt' },
    });
    expect(gate.metadata).toEqual({});
    expect(
      calls.every(([request]) => new URL(request as string).origin === 'https://push.fm'),
    ).toBe(true);
  });
  it.each([
    action('unknown-follow'),
    action('spotify-follow', 10, true, false),
    {
      ...action('youtube-subscribe'),
      provider: { client_authentication: false, client_execution: true },
    },
    action('push-mailing-list-sign-up'),
  ])(
    'never POSTs OAuth, marketing, unknown or changed execution contracts: $driver',
    async (value) => {
      const ctx = context([json(metadata([value])), json({}, 403), json({}, 403)]);
      await push.resolve(push.inspect(document, url)!, ctx);
      expect(
        vi.mocked(ctx.fetch).mock.calls.every(([, options]) => options?.method === 'GET'),
      ).toBe(true);
    },
  );
  it('handles expiry without retrying or inventing a receipt', async () => {
    const ctx = context([json(metadata()), json({}, 403), json({}, 419)]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'session-expired',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(3);
  });
  it('requires the current native CSRF value before any acknowledgement', async () => {
    document.querySelector('meta[name="csrf-token"]')!.remove();
    const ctx = context([json(metadata()), json({}, 403)]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'session-expired',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    { driver: 'other-driver', token: 'gate-receipt' },
    { driver: 'youtube-subscribe', token: '' },
    { driver: 'youtube-subscribe', token: 'with spaces' },
    { driver: 'youtube-subscribe', token: 'a'.repeat(8193) },
  ])('rejects malformed/mismatched receipts before requesting a reward', async (receipt) => {
    const ctx = context([json(metadata()), json({}, 403), json(receipt)]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects duplicate native drivers instead of overwriting action receipts', async () => {
    const ctx = context([
      json(metadata([action(), action('youtube-subscribe', 11)])),
      json({}, 403),
    ]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('PUSH required native Spotify sign-ins', () => {
  it('exposes required native Spotify controls but hides optional ones before metadata', () => {
    nativeSpotify('follow', false);
    nativeSpotify('follow-playlist');
    expect(push.actions!(document, url).map((value) => value.id)).toEqual([
      'push-login-spotify-follow-playlist',
    ]);
  });
  it('discovers minimum-count Spotify requirement only after requested metadata arrives', async () => {
    nativeSpotify('follow', false);
    const ctx = context([
      json(metadata([action('spotify-follow', 10, false, false)])),
      json({}, 403),
    ]);
    expect(push.actions!(document, url)).toEqual([]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(push.actions!(document, url)).toMatchObject([
      { id: 'push-login-spotify-follow', required: true },
    ]);
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });
  it('launches only the exact native control on an explicit sign-in action', () => {
    const button = nativeSpotify();
    const clicked = vi.fn();
    button.onclick = clicked;
    expect(push.performAction!('push-login-spotify-follow', document, url, 'activate').ok).toBe(
      true,
    );
    expect(clicked).toHaveBeenCalledOnce();
    expect(push.actionProgress!('push-login-spotify-follow', document, url)?.state).toBe('waiting');
  });
  it('requires both the native gate receipt and native completed button before unlocking', () => {
    const button = nativeSpotify();
    const id = 'push-login-spotify-follow';
    push.performAction!(id, document, url, 'activate');
    receipt('spotify-follow');
    expect(push.actionProgress!(id, document, url)?.state).toBe('waiting');
    button.disabled = true;
    expect(push.actionProgress!(id, document, url)?.state).toBe('complete');
  });
  it('does not treat disabled state alone as a confirmed login receipt', () => {
    const button = nativeSpotify();
    push.performAction!('push-login-spotify-follow', document, url, 'activate');
    button.disabled = true;
    expect(push.actionProgress!('push-login-spotify-follow', document, url)?.state).toBe('waiting');
  });
  it.each(['https://accounts.spotify.com', 'https://example.org', 'null'])(
    'ignores credentials and callbacks from %s',
    (origin) => {
      const button = nativeSpotify();
      const id = 'push-login-spotify-follow';
      push.performAction!(id, document, url, 'activate');
      receipt('spotify-follow', 'foreign-oauth-or-receipt', origin);
      button.disabled = true;
      expect(push.actionProgress!(id, document, url)?.state).toBe('waiting');
    },
  );
  it('ignores self-posted messages and wrong drivers', () => {
    const button = nativeSpotify();
    const id = 'push-login-spotify-follow';
    push.performAction!(id, document, url, 'activate');
    receipt('spotify-follow', 'self-message', 'https://push.fm', window);
    receipt('spotify-follow-playlist');
    button.disabled = true;
    expect(push.actionProgress!(id, document, url)?.state).toBe('waiting');
  });
  it('continues with exact gate receipts after two independently completed Spotify logins', async () => {
    const follow = nativeSpotify();
    const playlist = nativeSpotify('follow-playlist');
    for (const [driver, button] of [
      ['spotify-follow', follow],
      ['spotify-follow-playlist', playlist],
    ] as const) {
      push.performAction!(`push-login-${driver}`, document, url, 'activate');
      receipt(driver, `gate-${driver}`);
      button.disabled = true;
      expect(push.actionProgress!(`push-login-${driver}`, document, url)?.state).toBe('complete');
    }
    const ctx = context([
      json(
        metadata(
          [
            action('spotify-follow', 10, true, false),
            action('spotify-follow-playlist', 11, true, false),
          ],
          2,
        ),
      ),
      json({}, 403),
      json({ body: destination }),
    ]);
    expect(await push.resolve(push.inspect(document, url)!, ctx)).toMatchObject({
      ok: true,
      url: destination,
    });
    const final = new URL(vi.mocked(ctx.fetch).mock.calls[2]![0] as string);
    expect(JSON.parse(atob(final.searchParams.get('token')!))).toEqual({
      actions: {
        'spotify-follow': 'gate-spotify-follow',
        'spotify-follow-playlist': 'gate-spotify-follow-playlist',
      },
    });
  });
});
