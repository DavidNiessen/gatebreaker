import { afterEach, describe, expect, it, vi } from 'vitest';
import { droploud } from '../src/providers/droploud';
import type { ProviderContext } from '../src/domain/provider';

const id = 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89';
const url = new URL(`https://droploud.com/track/${id}`);
const text = 'A comment chosen by the listener';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function fixture(types: string[]) {
  const model = {
    track: { id, title: 'Authored social track' },
    steps: types.map((type) => ({ id: type === 'soundcloud_comment' ? 'sc_comment' : type, type })),
  };
  const flight = `1:["$","$L1",null,{"gateData":${JSON.stringify(model)}}]`;
  return new DOMParser().parseFromString(
    `<h1 class="dtr-caption-title">Track</h1><script src="/_next/static/immutable/chunks/new-deployment.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
    'text/html',
  );
}
function context(fetch: typeof globalThis.fetch, comment: unknown = text): ProviderContext {
  return {
    pageUrl: url,
    fetch,
    probePublicFile: async () => null,
    automate: true,
    preferences: { soundcloudComment: comment as string },
  };
}
afterEach(() => vi.useRealTimers());
describe('Droploud configured comments and server-verified social requirements', () => {
  it.each([undefined, '', 'a', ' '.repeat(5), 'x'.repeat(1001), 'bad\u0000comment'])(
    'never submits invalid configured text %s',
    async (value) => {
      const doc = fixture(['soundcloud_comment']);
      const fetch = vi.fn<typeof globalThis.fetch>();
      expect(
        await droploud.resolve(droploud.inspect(doc, url)!, context(fetch, value ?? null)),
      ).toMatchObject({ ok: false, code: 'input-required' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('saves only the exact configured text before discovering authorization, without opening it automatically', async () => {
    const doc = fixture(['soundcloud_comment', 'soundcloud_repost']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValue(json({ connected: false }));
    const ctx = context(fetch, `  ${text}  `);
    expect(await droploud.resolve(droploud.inspect(doc, url)!, ctx)).toMatchObject({
      code: 'server-required',
    });
    const first = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(first).toEqual({ session_id: expect.any(String), step: 'sc_comment', value: text });
    expect(String(fetch.mock.calls[0]![0])).toBe(`https://api.droploud.com/api/gate/${id}/step`);
    expect(String(fetch.mock.calls[1]![0])).toContain('/soundcloud/gate-status');
    expect(droploud.actions!(doc, url)).toMatchObject([
      { id: 'droploud-soundcloud', required: true },
    ]);
    await droploud.resolve(droploud.inspect(doc, url)!, ctx);
    expect(fetch.mock.calls.filter(([address]) => String(address).endsWith('/step'))).toHaveLength(
      1,
    );
  });
  it('stops on refused comment preparation and exposes no authorization action', async () => {
    const doc = fixture(['soundcloud_comment']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json({ error: 'Denied' }, 403));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(droploud.actions!(doc, url)).toEqual([]);
  });
  it('keeps final server approval authoritative after successful comment preparation', async () => {
    const doc = fixture(['soundcloud_comment']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ connected: true }))
      .mockResolvedValueOnce(json({ download_url: 'https://files.example.test/reward.wav' }));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2]![1]!.body as string)).toEqual({
      session_id: expect.any(String),
    });
  });
  it('does not post comments or optional acknowledgements without explicit automation', async () => {
    const doc = fixture(['soundcloud_comment']);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ connected: false }));
    await droploud.resolve(droploud.inspect(doc, url)!, { ...context(fetch), automate: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toContain('/gate-status');
  });
  it('retries only the exact native final comment refusal once with the same configured text', async () => {
    const doc = fixture(['soundcloud_comment']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ connected: true }))
      .mockResolvedValueOnce(json({ error: 'SoundCloud comment step not completed' }, 403))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ error: 'SoundCloud comment step not completed' }, 403));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetch.mock.calls[3]![1]!.body as string).value).toBe(text);
  });
  it('verifies a manual repost through Droploud and never fabricates like attestation or completion', async () => {
    const doc = fixture(['soundcloud_repost', 'soundcloud_like']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ connected: true, repost_mode: 'manual', like_mode: 'manual' }))
      .mockResolvedValueOnce(json({ found: true, like: 'found' }))
      .mockResolvedValueOnce(json({ download_url: 'https://files.example.test/reward.wav' }));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: true,
    });
    expect(String(fetch.mock.calls[1]![0])).toBe(
      'https://api.droploud.com/api/soundcloud/verify-repost',
    );
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({
      track_id: id,
      session_id: expect.any(String),
      fresh: true,
    });
    expect(
      fetch.mock.calls.every(([, init]) => !String(init?.body).includes('like_attested')),
    ).toBe(true);
  });
  it.each([
    { found: false, like: 'found' },
    { found: true, like: 'missing' },
  ])('does not request a reward for unverified social state %j', async (value) => {
    const doc = fixture(['soundcloud_repost', 'soundcloud_like']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ connected: true, repost_mode: 'manual', like_mode: 'manual' }))
      .mockResolvedValueOnce(json(value));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('waits for native API repost settling and aborts without a final request', async () => {
    vi.useFakeTimers();
    const doc = fixture(['soundcloud_repost']);
    const controller = new AbortController();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        json({ connected: true, repost_mode: 'api', steps: { sc_repost: false } }),
      );
    const result = droploud.resolve(droploud.inspect(doc, url)!, {
      ...context(fetch),
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await expect(result).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('accepts settling status only through a final server-approved file', async () => {
    vi.useFakeTimers();
    const doc = fixture(['soundcloud_repost']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ connected: true, repost_mode: 'api', steps: {} }))
      .mockResolvedValueOnce(
        json({ connected: true, repost_mode: 'api', steps: { sc_repost: true } }),
      )
      .mockResolvedValueOnce(json({ error: 'Gate not completed' }, 403));
    const result = droploud.resolve(droploud.inspect(doc, url)!, context(fetch));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('treats identity changes as an expired connection, not repost success', async () => {
    const doc = fixture(['soundcloud_repost']);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({ connected: true, repost_mode: 'manual' }))
      .mockResolvedValueOnce(json({ error: 'identity_changed' }, 409));
    expect(await droploud.resolve(droploud.inspect(doc, url)!, context(fetch))).toMatchObject({
      ok: false,
      code: 'session-expired',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
