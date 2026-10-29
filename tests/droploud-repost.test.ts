import { afterEach, describe, expect, it, vi } from 'vitest';
import { droploud } from '../src/core/providers/droploud';
import type { ProviderContext } from '../src/core/domain/provider';
import type { SoundcloudRepostResult } from '../src/core/domain/soundcloud';

const id = 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89';
const pageUrl = new URL(`https://droploud.com/track/${id}`);
const trackUrl = 'https://soundcloud.com/authored/required-track';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function fixture(types = ['soundcloud_repost'], soundcloudUrl = trackUrl) {
  const model = {
    track: { id, title: 'Authored repost gate', soundcloud_url: soundcloudUrl },
    steps: types.map((type) => ({ id: type, type })),
  };
  const flight = `1:${JSON.stringify(['$', '$L1', null, { gateData: model }])}`;
  return new DOMParser().parseFromString(
    `<h1 class="dtr-caption-title">Track</h1><script src="/_next/static/immutable/chunks/authored.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
    'text/html',
  );
}
function setup(types?: string[], track?: string) {
  const document = fixture(types, track);
  const gate = droploud.inspect(document, pageUrl)!;
  const events: string[] = [];
  let verifies = 0;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (address) => {
    const path = new URL(String(address)).pathname;
    events.push(path.split('/').at(-1)!);
    if (path.endsWith('/gate-status')) return json({ connected: true, repost_mode: 'manual' });
    if (path.endsWith('/verify-repost')) return json({ found: verifies++ > 0 });
    return json({ download_url: 'https://files.example.test/authored.wav' });
  });
  const repost = vi
    .fn<NonNullable<ProviderContext['repostSoundcloud']>>()
    .mockImplementation(async () => {
      events.push('real-repost');
      return { state: 'complete' };
    });
  const context: ProviderContext = {
    pageUrl,
    fetch,
    probePublicFile: async () => null,
    automate: true,
    repostSoundcloud: repost,
  };
  return { document, gate, context, repost, fetch, events };
}
afterEach(() => vi.useRealTimers());

describe('real repost host capability followed by native proof', () => {
  it('automatically reposts only the declared track, then verifies and requests the reward', async () => {
    vi.useFakeTimers();
    const h = setup();
    const pending = droploud.resolve(h.gate, h.context);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toMatchObject({ ok: true });
    expect(h.events).toEqual([
      'gate-status',
      'verify-repost',
      'real-repost',
      'verify-repost',
      'download',
    ]);
    expect(h.repost).toHaveBeenCalledExactlyOnceWith(
      { provider: 'droploud', gateId: id, url: trackUrl },
      expect.any(AbortSignal),
      undefined,
    );
    expect(JSON.parse(h.fetch.mock.calls[2]![1]!.body as string).fresh).toBe(true);
  });
  it('never reposts a gate that native verification already accepts', async () => {
    const h = setup();
    h.fetch
      .mockResolvedValueOnce(json({ connected: true, repost_mode: 'manual' }))
      .mockResolvedValueOnce(json({ found: true }));
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: true });
    expect(h.repost).not.toHaveBeenCalled();
  });
  it('does not equate SoundCloud acceptance with Droploud approval or retry the mutation', async () => {
    vi.useFakeTimers();
    const h = setup();
    h.fetch.mockImplementation(async (address) =>
      String(address).endsWith('/gate-status')
        ? json({ connected: true, repost_mode: 'manual' })
        : json({ found: false }),
    );
    const pending = droploud.resolve(h.gate, h.context);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toMatchObject({ ok: false, code: 'server-required' });
    expect(h.repost).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls.some(([address]) => String(address).endsWith('/download'))).toBe(
      false,
    );
  });
  it.each<SoundcloudRepostResult['state']>([
    'failed',
    'login-required',
    'challenge-required',
    'cancelled',
    'rate-limited',
  ])('stops after an unconfirmed account action: %s', async (state) => {
    const h = setup();
    h.repost.mockResolvedValue({ state });
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: false });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not reuse the repost capability for a different declared social action', async () => {
    const h = setup(['soundcloud_like']);
    h.fetch
      .mockResolvedValueOnce(json({ connected: true, like_mode: 'manual' }))
      .mockResolvedValueOnce(json({ found: false, like: 'missing' }));
    expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: false });
    expect(h.repost).not.toHaveBeenCalled();
  });
  it.each(['https://evil.invalid/author/track', 'https://soundcloud.com/author/track/other'])(
    'refuses an unbound target %s',
    async (track) => {
      const h = setup(undefined, track);
      expect(await droploud.resolve(h.gate, h.context)).toMatchObject({ ok: false });
      expect(h.repost).not.toHaveBeenCalled();
    },
  );
  it('normalizes tracking parameters before handing off the exact track', async () => {
    vi.useFakeTimers();
    const h = setup(undefined, `${trackUrl}/?utm_source=gate#player`);
    const pending = droploud.resolve(h.gate, h.context);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toMatchObject({ ok: true });
    expect(h.repost.mock.calls[0]![0].url).toBe(trackUrl);
  });
  it('does not mutate from a non-automatic resolution', async () => {
    const h = setup();
    await droploud.resolve(h.gate, { ...h.context, automate: false });
    expect(h.repost).not.toHaveBeenCalled();
  });
  it('rejects a host completion from a replaced native session', async () => {
    const h = setup();
    let sid = '11111111-1111-4111-8111-111111111111';
    h.fetch.mockResolvedValueOnce(json({ error: 'Gate not completed' }, 403));
    h.repost.mockImplementation(async () => {
      sid = '22222222-2222-4222-8222-222222222222';
      return { state: 'complete' };
    });
    expect(
      await droploud.resolve(h.gate, { ...h.context, readNativeSession: () => sid }),
    ).toMatchObject({ ok: false, code: 'session-expired' });
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });
  it('propagates cancellation into the real account operation', async () => {
    const h = setup();
    const controller = new AbortController();
    let hostSignal: AbortSignal | undefined;
    h.repost.mockImplementation(async (_request, signal) => {
      hostSignal = signal;
      controller.abort();
      return { state: 'complete' };
    });
    await expect(
      droploud.resolve(h.gate, { ...h.context, signal: controller.signal }),
    ).rejects.toThrow();
    expect(hostSignal?.aborted).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
});
