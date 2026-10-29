import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  removeTab: vi.fn(),
  create: vi.fn(),
  focus: vi.fn(),
  execute: vi.fn(),
  perform: vi.fn(),
  run: vi.fn(),
  enabled: vi.fn(),
  updated: vi.fn(),
  removed: vi.fn(),
  detached: vi.fn(),
  windowRemoved: vi.fn(),
  storage: vi.fn(),
  sessionGet: vi.fn(),
  sessionSet: vi.fn(),
  sessionRemove: vi.fn(),
}));
vi.mock('../src/extension/platform/browser', () => ({
  extension: {
    runtime: { id: 'authored-extension' },
    storage: {
      session: { get: h.sessionGet, set: h.sessionSet, remove: h.sessionRemove },
      onChanged: { addListener: h.storage },
    },
    tabs: {
      get: h.get,
      update: h.update,
      remove: h.removeTab,
      onUpdated: { addListener: h.updated },
      onRemoved: { addListener: h.removed },
      onDetached: { addListener: h.detached },
    },
    windows: { create: h.create, update: h.focus, onRemoved: { addListener: h.windowRemoved } },
    scripting: { executeScript: h.execute },
  },
  isEnabled: h.enabled,
}));
vi.mock('../src/extension/platform/soundcloud-page', () => ({
  performSoundcloudRepost: h.perform,
}));

const gate = 'e8769ae1-5c90-43ee-bfe3-9fbbe50c5b89';
const operation = '11111111-1111-4111-8111-111111111111';
const secondOperation = '22222222-2222-4222-8222-222222222222';
const track = 'https://soundcloud.com/artist.name/track-name';
const sender = {
  id: 'authored-extension',
  frameId: 0,
  documentId: 'parent-document',
  tab: { id: 7 },
  url: `https://droploud.com/track/${gate}`,
} as chrome.runtime.MessageSender;
const request = {
  type: 'gatebreaker:soundcloud-repost',
  operation,
  provider: 'droploud',
  gateId: gate,
  url: track,
};
let message: typeof import('../src/extension/platform/soundcloud-repost-job').soundcloudRepostMessage;
let tabs: Map<number, Record<string, unknown>>;
let saved: Record<string, unknown>;
let next = 0;
function dispatch(value: unknown = request, source = sender) {
  let resolve!: (value: unknown) => void;
  const result = new Promise<unknown>((accept) => {
    resolve = accept;
  });
  const respond = vi.fn(resolve);
  return { kept: message(value, source, respond), result, respond };
}
function ping(source = sender, nonce = operation) {
  return dispatch({ type: 'gatebreaker:soundcloud-repost-heartbeat', operation: nonce }, source);
}
function cancel(source = sender, nonce = operation) {
  return dispatch({ type: 'gatebreaker:cancel-soundcloud-repost', operation: nonce }, source);
}
async function settle() {
  for (let n = 0; n < 20; n++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}
const runs = () => h.execute.mock.calls.filter(([call]) => call.args[2] === 'run');
const cancels = () => h.execute.mock.calls.filter(([call]) => call.args[2] === 'cancel');

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  for (const fn of Object.values(h)) fn.mockReset();
  next = 0;
  saved = {};
  tabs = new Map([
    [7, { id: 7, url: sender.url, documentId: sender.documentId, status: 'complete', windowId: 1 }],
  ]);
  h.sessionGet.mockImplementation(async () => ({ ...saved }));
  h.sessionSet.mockImplementation(async (value) => {
    Object.assign(saved, value);
  });
  h.sessionRemove.mockImplementation(async (key) => {
    delete saved[key];
  });
  h.get.mockImplementation(async (id) => {
    if (!tabs.has(id)) throw Error('No such tab');
    return tabs.get(id);
  });
  h.update.mockImplementation(async (id, change) => {
    if (!tabs.has(id)) throw Error('No such tab');
    Object.assign(tabs.get(id)!, change);
    return tabs.get(id);
  });
  h.removeTab.mockImplementation(async (id) => {
    tabs.delete(id);
  });
  h.create.mockImplementation(async () => {
    const id = 90 + next,
      child = 91 + next++;
    tabs.set(child, { id: child, windowId: id, url: 'about:blank', status: 'complete' });
    return { id, tabs: [{ id: child }] };
  });
  h.focus.mockResolvedValue(undefined);
  h.enabled.mockResolvedValue(true);
  h.run.mockResolvedValue({ state: 'loading' });
  h.perform.mockImplementation(async (...args) =>
    args[2] === 'cancel' ? { state: 'cancelled' } : h.run(...args),
  );
  h.execute.mockImplementation(async (call) => [
    { frameId: 0, result: await call.func(...call.args) },
  ]);
  message = (await import('../src/extension/platform/soundcloud-repost-job'))
    .soundcloudRepostMessage;
  await settle();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('owned SoundCloud repost operation boundary', () => {
  it.each([
    { id: 'another-extension' },
    { frameId: 1 },
    { tab: undefined },
    { url: 'https://evil.invalid/track/' + gate },
    { url: 'https://droploud.com/track/not-a-uuid' },
    { url: 'https://user:secret@droploud.com/track/' + gate },
    { url: 'http://droploud.com/track/' + gate },
    { documentId: 'invalid document id' },
  ])('rejects a malicious or unrelated sender %j', async (override) => {
    expect(dispatch(request, { ...sender, ...override } as chrome.runtime.MessageSender).kept).toBe(
      false,
    );
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it.each([
    { provider: 'hypeddit' },
    { gateId: secondOperation },
    { operation: 'bad-nonce' },
    { url: 'https://soundcloud.com/artist/track?token=not-allowed' },
    { url: 'https://soundcloud.com/artist/track#fragment' },
    { url: 'https://soundcloud.com/artist' },
    { url: 'https://soundcloud.com/artist/track/extra' },
    { url: 'https://api.soundcloud.com/artist/track' },
    { url: 'https://user:secret@soundcloud.com/artist/track' },
    { url: 'https://soundcloud.com:8443/artist/track' },
    { url: 'https://soundcloud.com/artist%2fother/track' },
    { unexpected: 'not part of the contract' },
  ])('rejects an invalid operation request %j', async (override) => {
    expect(dispatch({ ...request, ...override }).kept).toBe(false);
    await settle();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('runs only the standalone function in frame zero of a newly owned window', async () => {
    h.run.mockResolvedValue({ state: 'complete' });
    const started = dispatch();
    expect(started.kept).toBe(true);
    expect(await started.result).toEqual({ state: 'complete' });
    expect(h.create).toHaveBeenCalledExactlyOnceWith({
      url: 'about:blank',
      type: 'popup',
      focused: false,
      width: 1000,
      height: 800,
    });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]![0]).toEqual({
      target: { tabId: 91, frameIds: [0] },
      world: 'MAIN',
      func: h.perform,
      args: [track, operation, 'run'],
    });
    expect(h.removeTab).toHaveBeenCalledExactlyOnceWith(91);
    expect(cancels()).toHaveLength(1);
    expect(h.sessionSet).toHaveBeenCalledWith({
      ['soundcloudRepostWindow:' + operation]: { window: 90, child: 91 },
    });
    expect(saved).toEqual({});
    expect(started.respond).toHaveBeenCalledTimes(1);
  });

  it('foregrounds required sign-in and automatically retries without a Repost click', async () => {
    h.run
      .mockResolvedValueOnce({ state: 'login-required' })
      .mockResolvedValueOnce({ state: 'complete' });
    const started = dispatch();
    await settle();
    expect(await ping().result).toEqual({ state: 'login-required' });
    expect(h.focus).toHaveBeenCalledExactlyOnceWith(90, { focused: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await started.result).toEqual({ state: 'complete' });
    expect(runs()).toHaveLength(2);
    expect(h.enabled.mock.calls.length).toBeGreaterThan(2);
    expect(h.get.mock.calls.filter(([id]) => id === 7).length).toBeGreaterThan(2);
  });

  it('keeps a real challenge available to the user and resumes after solving it', async () => {
    h.run
      .mockResolvedValueOnce({ state: 'challenge-required' })
      .mockResolvedValueOnce({ state: 'complete' });
    const started = dispatch();
    await settle();
    expect(await ping().result).toEqual({ state: 'challenge-required' });
    expect(h.removeTab).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await started.result).toEqual({ state: 'complete' });
  });

  it('does not inject on external OAuth pages, but can resume on SoundCloud home', async () => {
    const started = dispatch();
    await settle();
    tabs.get(91)!.url = 'https://accounts.example.invalid/authorize';
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs()).toHaveLength(1);
    expect(await ping().result).toEqual({ state: 'login-required' });
    tabs.get(91)!.url = 'https://soundcloud.com/discover';
    h.run.mockResolvedValue({ state: 'complete' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await started.result).toEqual({ state: 'complete' });
    expect(runs()).toHaveLength(2);
    expect(runs()[1]![0].args[0]).toBe(track);
  });

  it('rejects simultaneous operations in the same parent without opening another window', async () => {
    const original = dispatch();
    await settle();
    expect(await dispatch({ ...request, operation: secondOperation }).result).toEqual({
      state: 'failed',
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(await cancel().result).toEqual({ state: 'cancelled' });
    expect(await original.result).toEqual({ state: 'cancelled' });
  });

  it('does not renew or cancel another document or operation', async () => {
    const started = dispatch();
    await settle();
    expect(await ping({ ...sender, documentId: 'new-document' }).result).toEqual({
      state: 'cancelled',
    });
    expect(await cancel(sender, secondOperation).result).toEqual({ state: 'cancelled' });
    expect(cancels()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(8001);
    expect(await started.result).toEqual({ state: 'cancelled' });
    expect(cancels()).toHaveLength(1);
  });

  it.each(['loading', 'navigation', 'removed', 'disabled', 'child-closed', 'window-closed'])(
    'cancels an owned operation on %s',
    async (event) => {
      const started = dispatch();
      await settle();
      if (event === 'loading') h.updated.mock.calls[0]![0](7, { status: 'loading' });
      if (event === 'navigation') h.updated.mock.calls[0]![0](7, { url: 'https://droploud.com/' });
      if (event === 'removed') h.removed.mock.calls[0]![0](7);
      if (event === 'disabled')
        h.storage.mock.calls[0]![0]({ enabled: { newValue: false } }, 'local');
      if (event === 'child-closed') {
        tabs.delete(91);
        h.removed.mock.calls[0]![0](91);
      }
      if (event === 'window-closed') h.windowRemoved.mock.calls[0]![0](90);
      expect(await started.result).toEqual({ state: 'cancelled' });
      await vi.advanceTimersByTimeAsync(4000);
      expect(runs()).toHaveLength(1);
    },
  );

  it('cancels an in-flight page operation and ignores its late success', async () => {
    let release!: (value: unknown) => void;
    h.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const started = dispatch();
    await settle();
    expect(runs()).toHaveLength(1);
    expect(await cancel().result).toEqual({ state: 'cancelled' });
    expect(await started.result).toEqual({ state: 'cancelled' });
    release({ state: 'complete' });
    await settle();
    expect(started.respond).toHaveBeenCalledTimes(1);
    expect(cancels()).toHaveLength(1);
  });

  it('never runs or closes a tab moved out of the owned window', async () => {
    const started = dispatch();
    await settle();
    tabs.get(91)!.windowId = 999;
    await vi.advanceTimersByTimeAsync(2000);
    expect(await started.result).toEqual({ state: 'cancelled' });
    expect(runs()).toHaveLength(1);
    expect(h.removeTab).not.toHaveBeenCalled();
    expect(cancels()).toHaveLength(1);
  });
  it('immediately aborts an in-flight operation when the owned tab is detached', async () => {
    let release!: (value: unknown) => void;
    h.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const started = dispatch();
    await settle();
    h.detached.mock.calls[0]![0](91, { oldWindowId: 90, oldPosition: 0 });
    expect(await started.result).toEqual({ state: 'cancelled' });
    expect(cancels()).toHaveLength(1);
    expect(h.removeTab).not.toHaveBeenCalled();
    release({ state: 'complete' });
    await settle();
    expect(started.respond).toHaveBeenCalledTimes(1);
  });

  it.each([null, { state: 'done' }, { state: 'complete', token: 'must-not-return' }])(
    'does not trust malformed page replies %j',
    async (reply) => {
      h.run.mockResolvedValue(reply);
      expect(await dispatch().result).toEqual({ state: 'failed' });
      expect(saved).toEqual({});
    },
  );

  it('rejects non-top-frame execution results', async () => {
    h.execute.mockResolvedValueOnce([{ frameId: 2, result: { state: 'complete' } }]);
    expect(await dispatch().result).toEqual({ state: 'failed' });
  });

  it('stops a rate-limited job without retrying the mutation', async () => {
    h.run.mockResolvedValue({ state: 'rate-limited' });
    expect(await dispatch().result).toEqual({ state: 'rate-limited' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs()).toHaveLength(1);
  });

  it('enforces the two-minute deadline even while valid heartbeats renew the lease', async () => {
    h.run.mockResolvedValue({ state: 'login-required' });
    const started = dispatch();
    const timer = setInterval(() => {
      void ping().result;
    }, 2000);
    await vi.advanceTimersByTimeAsync(120001);
    clearInterval(timer);
    expect(await started.result).toEqual({ state: 'cancelled' });
    expect(h.removeTab).toHaveBeenCalledWith(91);
  });

  it('cleans an orphan after worker restart without resuming mutations', async () => {
    dispatch();
    await settle();
    expect(Object.keys(saved)).toEqual(['soundcloudRepostWindow:' + operation]);
    vi.clearAllTimers();
    vi.resetModules();
    const before = runs().length;
    message = (await import('../src/extension/platform/soundcloud-repost-job'))
      .soundcloudRepostMessage;
    expect(await ping().result).toEqual({ state: 'cancelled' });
    expect(runs()).toHaveLength(before);
    expect(cancels()).toHaveLength(1);
    expect(h.removeTab).toHaveBeenCalledWith(91);
    expect(saved).toEqual({});
  });

  it('never restores ownership from an invalid storage record', async () => {
    vi.resetModules();
    saved = {
      ['soundcloudRepostWindow:' + operation]: { window: 1, child: 7, extra: 'not-owned' },
    };
    message = (await import('../src/extension/platform/soundcloud-repost-job'))
      .soundcloudRepostMessage;
    expect(await ping().result).toEqual({ state: 'cancelled' });
    expect(h.removeTab).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    expect(saved).toEqual({});
  });
});
