import { afterEach, describe, expect, it, vi } from 'vitest';
import { droploud } from '../src/extension/providers/droploud';
import { droploud as coreDroploud } from '../src/core/providers/droploud';
import type { ProviderContext } from '../src/core/domain/provider';

const id = 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89';
const url = new URL(`https://droploud.com/track/${id}`);
const firstSid = '11111111-1111-4111-8111-111111111111';
const secondSid = '22222222-2222-4222-8222-222222222222';
const text = 'The listener supplied this comment';
const contexts: Document[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const denied = () => json({ error: 'Gate not completed' }, 403);
const reward = () => json({ download_url: 'https://files.example.test/authored-original.wav' });

function fixture(types: string[]) {
  const model = {
    track: {
      id,
      title: 'Authored boundary track',
      soundcloud_url: 'https://soundcloud.com/authored/track',
    },
    steps: types.map((type) => ({ id: type === 'soundcloud_comment' ? 'sc_comment' : type, type })),
  };
  const flight = `1:${JSON.stringify(['$', '$L1', null, { gateData: model }])}`;
  const document = new DOMParser().parseFromString(
    `<h1 class="dtr-caption-title">Track</h1><script src="/_next/static/immutable/chunks/boundary.js"></script><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
    'text/html',
  );
  const storage = new Map([['dw_sid', firstSid]]);
  const popup = () =>
    ({
      closed: false,
      close(this: { closed: boolean }) {
        this.closed = true;
      },
    }) as unknown as Window;
  const view = {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null },
    open: vi.fn<(address: string, name: string, features: string) => Window | null>(() => popup()),
    fetch: vi.fn<typeof fetch>().mockImplementation(async () => json({ connected: true })),
    addEventListener: vi.fn(),
    setTimeout: (callback: () => void, duration: number) => setTimeout(callback, duration),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    setInterval: (callback: () => void, duration: number) => setInterval(callback, duration),
    clearInterval: (timer: ReturnType<typeof setInterval>) => clearInterval(timer),
  };
  Object.defineProperty(document, 'defaultView', { value: view });
  contexts.push(document);
  const context = (responses: Response[]): ProviderContext => ({
    pageUrl: url,
    fetch: vi.fn<typeof fetch>().mockImplementation(async () => {
      const response = responses.shift();
      if (!response) throw Error('Unexpected authored request');
      return response;
    }),
    probePublicFile: async () => null,
    readNativeSession: () => storage.get('dw_sid') ?? null,
    automate: true,
    preferences: { soundcloudComment: text },
  });
  return { document, storage, view, context };
}

afterEach(() => {
  for (const document of contexts.splice(0)) droploud.cancelActions!(document, url);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Droploud native session and owned social-window boundaries', () => {
  it('resaves the exact native comment refusal after authorization even when the configured text is unchanged', async () => {
    const { document, context } = fixture(['soundcloud_comment']);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ ok: true }), json({ connected: false })]),
    );
    const resumed = context([
      json({ error: 'SoundCloud comment step not completed' }, 403),
      json({ ok: true }),
      json({ connected: true }),
      reward(),
    ]);
    expect(await droploud.resolve(droploud.inspect(document, url)!, resumed)).toMatchObject({
      ok: true,
    });
    const calls = vi.mocked(resumed.fetch).mock.calls;
    expect(calls.map(([address]) => new URL(String(address)).pathname)).toEqual([
      `/api/gate/${id}/download`,
      `/api/gate/${id}/step`,
      '/api/soundcloud/gate-status',
      `/api/gate/${id}/download`,
    ]);
    expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({
      session_id: firstSid,
      step: 'sc_comment',
      value: text,
    });
  });

  it('does not resave the same comment or repeat a generic unchanged native-session refusal', async () => {
    const { document, context } = fixture(['soundcloud_comment']);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ ok: true }), json({ connected: false })]),
    );
    const resumed = context([denied(), json({ connected: true })]);
    expect(await droploud.resolve(droploud.inspect(document, url)!, resumed)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(
      vi.mocked(resumed.fetch).mock.calls.map(([address]) => new URL(String(address)).pathname),
    ).toEqual([`/api/gate/${id}/download`, '/api/soundcloud/gate-status']);
  });

  it('opens a separate SoundCloud track window even while the owned OAuth window remains open', async () => {
    vi.useFakeTimers();
    const { document, context, view } = fixture(['soundcloud_repost']);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ connected: false })]),
    );
    expect(droploud.performAction!('droploud-soundcloud', document, url, 'activate').ok).toBe(true);
    const auth = view.open.mock.results[0]!.value!;
    expect(auth.closed).toBe(false);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ connected: true, repost_mode: 'manual' }), json({ found: false })]),
    );
    expect(droploud.actions!(document, url).map((action) => action.id)).toEqual([
      'droploud-social',
    ]);
    expect(droploud.performAction!('droploud-social', document, url, 'activate').ok).toBe(true);
    expect(view.open).toHaveBeenCalledTimes(2);
    expect(view.open.mock.calls[1]![0]).toBe('https://soundcloud.com/authored/track');
    expect(view.open.mock.results[1]!.value).not.toBe(auth);
  });

  it('refuses authorization on a new native SID until that SID has prepared the configured comment', async () => {
    const { document, context, storage, view } = fixture(['soundcloud_comment']);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ ok: true }), json({ connected: false })]),
    );
    storage.set('dw_sid', secondSid);
    expect(
      droploud.performAction!('droploud-soundcloud', document, url, 'activate', undefined, {
        soundcloudComment: text,
      }).ok,
    ).toBe(false);
    expect(view.open).not.toHaveBeenCalled();
  });

  it('discards a pending old-SID authorization status instead of completing the new session', async () => {
    const { document, context, storage, view } = fixture(['soundcloud_comment']);
    await droploud.resolve(
      droploud.inspect(document, url)!,
      context([denied(), json({ ok: true }), json({ connected: false })]),
    );
    let settle!: (response: Response) => void;
    view.fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );
    expect(
      droploud.performAction!('droploud-soundcloud', document, url, 'activate', undefined, {
        soundcloudComment: text,
      }).ok,
    ).toBe(true);
    expect(view.fetch).toHaveBeenCalledTimes(1);
    storage.set('dw_sid', secondSid);
    settle(json({ connected: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(droploud.actionProgress!('droploud-soundcloud', document, url)?.state).not.toBe(
      'complete',
    );
    expect(droploud.actions!(document, url)).toEqual([]);
  });

  it('retries the original native-session download after an observed API repost settles successfully', async () => {
    vi.useFakeTimers();
    const { document, context } = fixture(['soundcloud_repost']);
    const checking = context([
      denied(),
      json({ connected: true, repost_mode: 'api', steps: { sc_repost: false } }),
      json({ connected: true, repost_mode: 'api', steps: { sc_repost: true } }),
      reward(),
    ]);
    const result = droploud.resolve(droploud.inspect(document, url)!, checking);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({ ok: true });
    expect(
      vi.mocked(checking.fetch).mock.calls.map(([address]) => new URL(String(address)).pathname),
    ).toEqual([
      `/api/gate/${id}/download`,
      '/api/soundcloud/gate-status',
      '/api/soundcloud/gate-status',
      `/api/gate/${id}/download`,
    ]);
  });

  it('checks the injected native SID again before accepting a pending core status response', async () => {
    const { document, context, storage } = fixture(['soundcloud_comment']);
    await coreDroploud.resolve(
      coreDroploud.inspect(document, url)!,
      context([denied(), json({ ok: true }), json({ connected: false })]),
    );
    let settle!: (response: Response) => void;
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(denied())
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      );
    const injected = { ...context([]), fetch: transport };
    const result = coreDroploud.resolve(coreDroploud.inspect(document, url)!, injected);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    storage.set('dw_sid', secondSid);
    settle(json({ connected: true }));
    expect(await result).toMatchObject({ ok: false });
    expect(transport).toHaveBeenCalledTimes(2);
    const retry = context([denied(), json({ ok: true }), json({ connected: false })]);
    await coreDroploud.resolve(coreDroploud.inspect(document, url)!, retry);
    const calls = vi.mocked(retry.fetch).mock.calls;
    expect(calls).toHaveLength(3);
    expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({
      session_id: secondSid,
      step: 'sc_comment',
      value: text,
    });
  });
});
