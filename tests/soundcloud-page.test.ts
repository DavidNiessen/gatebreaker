import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performSoundcloudRepost } from '../src/extension/platform/soundcloud-page';

const track = 'https://soundcloud.com/authored/required-track';
const urn = 'soundcloud:tracks:12345';
const operation = 'authored-operation';
const client = 'a'.repeat(32);
const cookie = 'oauth_token=authored-local-only-token';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const metadata = () => [
  { hydratable: 'apiClient', data: { id: client, isExpiring: true } },
  { hydratable: 'sound', data: { id: 12345, urn, kind: 'track', permalink_url: track } },
];
const viewer = (reposted = false) => ({
  data: {
    allTracks: [
      { __typename: 'Track', urn, permalinkUrl: track, engagement: { hasReposted: reposted } },
    ],
  },
});
let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
beforeEach(() => {
  delete (globalThis as Record<string, unknown>)['__gatebreakerRepost'];
  vi.stubGlobal('location', new URL(track));
  vi.stubGlobal('__sc_hydration', metadata());
  vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie);
  fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(viewer()))
    .mockResolvedValue(json({ data: { repostTrack: { __typename: 'Repost', caption: null } } }));
  vi.stubGlobal('fetch', fetch);
});
afterEach(async () => {
  await performSoundcloudRepost(track, operation, 'cancel');
  delete (globalThis as Record<string, unknown>)['__gatebreakerRepost'];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('page-local HTTP SoundCloud repost performer', () => {
  it('reads viewer state, sets reposted once and returns no credentials or raw response data', async () => {
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toBe(`https://graph.soundcloud.com/graphql?client_id=${client}`);
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'include',
        redirect: 'error',
        headers: { authorization: 'OAuth authored-local-only-token' },
      });
      expect(String(init?.body)).not.toMatch(/Unrepost|unrepost|DELETE/);
    }
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toMatchObject({
      operationName: 'RepostTrack',
      variables: { trackUrn: urn },
    });
    expect(
      JSON.stringify((globalThis as Record<string, unknown>)['__gatebreakerRepost']),
    ).not.toContain('authored-local-only-token');
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('never toggles off or repeats an already existing repost', async () => {
    fetch.mockReset().mockResolvedValue(json(viewer(true)));
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('waits for login and automatically resumes the same operation when its cookie appears', async () => {
    const readCookie = vi.spyOn(document, 'cookie', 'get').mockReturnValue('');
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'login-required' });
    expect(fetch).not.toHaveBeenCalled();
    readCookie.mockReturnValue(cookie);
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
  });
  it('can resolve the bound track after login returns to the SoundCloud homepage', async () => {
    vi.stubGlobal('location', new URL('https://soundcloud.com/discover'));
    const hydration = JSON.stringify(metadata());
    fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(`<script>window.__sc_hydration = ${hydration};</script>`))
      .mockResolvedValueOnce(json(viewer()))
      .mockResolvedValueOnce(json({ data: { repostTrack: { __typename: 'Repost' } } }));
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
    expect(fetch.mock.calls[0]![0]).toBe(track);
  });
  it('refetches inert native metadata if the app consumed its hydration array', async () => {
    vi.stubGlobal('__sc_hydration', []);
    fetch
      .mockReset()
      .mockResolvedValueOnce(
        new Response(`<script>window.__sc_hydration = ${JSON.stringify(metadata())};</script>`),
      )
      .mockResolvedValueOnce(json(viewer()))
      .mockResolvedValueOnce(json({ data: { repostTrack: { __typename: 'Repost' } } }));
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'complete' });
    expect(fetch.mock.calls[0]![0]).toBe(track);
  });
  it.each([
    'https://evil.invalid/author/track',
    'http://soundcloud.com/author/track',
    `${track}?extra=1`,
    `${track}#extra`,
    'https://user:password@soundcloud.com/author/track',
    'https://soundcloud.com/author/track/extra',
  ])('does not request arbitrary or ambiguous target %s', async (url) => {
    expect(await performSoundcloudRepost(url, operation)).toEqual({ state: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not run outside SoundCloud', async () => {
    vi.stubGlobal('location', new URL('https://droploud.com/track/12345'));
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { id: 0 },
    { urn: 'soundcloud:tracks:99999' },
    { kind: 'playlist' },
    { permalink_url: 'https://soundcloud.com/authored/unrelated-track' },
  ])('rejects mismatched hydrated track metadata %j', async (override) => {
    const hydration = metadata();
    Object.assign(hydration[1]!.data, override);
    vi.stubGlobal('__sc_hydration', hydration);
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { urn: 'soundcloud:tracks:99999' },
    { permalinkUrl: 'https://soundcloud.com/authored/unrelated' },
    { __typename: 'Playlist' },
  ])('refuses a mismatched viewer response before mutation %j', async (override) => {
    const result = viewer();
    Object.assign(result.data.allTracks[0]!, override);
    fetch.mockReset().mockResolvedValue(json(result));
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'failed' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not treat an absent viewer or FORBIDDEN as an unreposted track', async () => {
    fetch.mockReset().mockResolvedValue(
      json({
        data: { allTracks: [{ urn, engagement: null }] },
        errors: [{ message: 'FORBIDDEN', extensions: { code: 'FORBIDDEN' } }],
      }),
    );
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'login-required' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['UnknownSuccess', 'TrackRepostFailedError', 'TrackRepostCaptionFailedError'])(
    'does not accept an arbitrary GraphQL result %s',
    async (__typename) => {
      fetch
        .mockReset()
        .mockResolvedValueOnce(json(viewer()))
        .mockResolvedValueOnce(json({ data: { repostTrack: { __typename } } }));
      expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'failed' });
    },
  );
  it.each([
    [401, '{"error":"unauthorized"}', 'login-required'],
    [429, '{"error":"slow down"}', 'rate-limited'],
    [403, '<html>captcha-delivery required</html>', 'challenge-required'],
    [403, '{"error":"forbidden"}', 'failed'],
    [
      200,
      '{"data":{"repostTrack":{"__typename":"Repost"}},"errors":[{"message":"failed"}]}',
      'failed',
    ],
  ])(
    'handles HTTP %s without bypassing a challenge or claiming success',
    async (status, body, state) => {
      fetch
        .mockReset()
        .mockResolvedValueOnce(json(viewer()))
        .mockResolvedValueOnce(new Response(String(body), { status: Number(status) }));
      expect(await performSoundcloudRepost(track, operation)).toEqual({ state });
    },
  );
  it('rejects an account change between viewer read and mutation', async () => {
    fetch.mockReset().mockImplementationOnce(async () => {
      vi.spyOn(document, 'cookie', 'get').mockReturnValue('oauth_token=another-authored-token');
      return json(viewer());
    });
    expect(await performSoundcloudRepost(track, operation)).toEqual({ state: 'login-required' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels an in-flight HTTP read before any mutation', async () => {
    let sent!: () => void;
    const started = new Promise<void>((resolve) => {
      sent = resolve;
    });
    fetch.mockReset().mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Cancelled', 'AbortError')),
          );
          sent();
        }),
    );
    const pending = performSoundcloudRepost(track, operation);
    await started;
    expect(await performSoundcloudRepost(track, operation, 'cancel')).toEqual({
      state: 'cancelled',
    });
    expect(await pending).toEqual({ state: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a different operation using a still-owned document', async () => {
    await performSoundcloudRepost(track, operation);
    expect(await performSoundcloudRepost(track, 'different-operation')).toEqual({
      state: 'failed',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
