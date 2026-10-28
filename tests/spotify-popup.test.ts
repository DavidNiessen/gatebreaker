import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const h = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  windowGet: vi.fn(),
  settings: vi.fn(),
  enabled: vi.fn(),
  updated: vi.fn(),
  removed: vi.fn(),
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
      local: { get: h.settings },
      session: { get: h.sessionGet, set: h.sessionSet, remove: h.sessionRemove },
      onChanged: { addListener: h.storage },
    },
    tabs: {
      get: h.get,
      update: h.update,
      onUpdated: { addListener: h.updated },
      onRemoved: { addListener: h.removed },
    },
    windows: {
      create: h.create,
      get: h.windowGet,
      remove: h.remove,
      onRemoved: { addListener: h.windowRemoved },
    },
  },
  isEnabled: h.enabled,
}));
const address =
  'https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=private-native-state';
const sender = {
  id: 'authored-extension',
  frameId: 0,
  tab: { id: 7 },
  url: 'https://hypeddit.com/artist/track',
} as chrome.runtime.MessageSender;
let message: typeof import('../src/extension/platform/spotify-popup').spotifyPopupMessage;
let saved: Record<string, unknown>;
const request = {
  type: 'gatebreaker:reuse-spotify',
  operation: 'authored-operation',
  gateId: 'authoredGate',
  address,
};
function dispatch(value: unknown = request, source = sender) {
  let resolve!: (value: unknown) => void;
  const result = new Promise((accept) => (resolve = accept));
  return { kept: message(value, source, resolve), result };
}
const heartbeat = (source = sender, operation = request.operation) =>
  dispatch({ type: 'gatebreaker:spotify-heartbeat', operation }, source).result;
const relay = (id = 91, windowId = 90) =>
  dispatch(
    { type: 'gatebreaker:spotify-returned' },
    {
      id: 'authored-extension',
      frameId: 0,
      tab: { id, windowId } as chrome.tabs.Tab,
      url: 'https://hypeddit.com/spotify_callback?code=private-code&state=private-state',
    },
  ).result;
async function restart() {
  vi.clearAllTimers();
  vi.resetModules();
  message = (await import('../src/extension/platform/spotify-popup')).spotifyPopupMessage;
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  for (const fn of Object.values(h)) fn.mockReset();
  saved = {};
  h.sessionGet.mockImplementation(async () => ({ ...saved }));
  h.sessionSet.mockImplementation(async (values) => Object.assign(saved, values));
  h.sessionRemove.mockImplementation(async (keys) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete saved[key];
  });
  h.get.mockResolvedValue({ id: 7, url: sender.url });
  h.update.mockResolvedValue({ id: 91 });
  h.create.mockResolvedValue({ id: 90, tabs: [{ id: 91 }] });
  h.windowGet.mockResolvedValue({ id: 90 });
  h.remove.mockResolvedValue(undefined);
  h.enabled.mockResolvedValue(true);
  h.settings.mockResolvedValue({ hypedditSpotifyReuse: { version: 1, confirmedAt: Date.now() } });
  message = (await import('../src/extension/platform/spotify-popup')).spotifyPopupMessage;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe('owned Spotify popup boundary', () => {
  it.each([
    { id: 'other' },
    { frameId: 1 },
    { tab: undefined },
    { url: 'https://evil.invalid/a' },
    { url: 'https://user:password@hypeddit.com/a' },
    { url: 'http://hypeddit.com/a' },
  ])('rejects an untrusted sender: %j', (override) => {
    expect(dispatch(request, { ...sender, ...override } as chrome.runtime.MessageSender).kept).toBe(
      false,
    );
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each([
    { address: 'https://evil.invalid' },
    { gateId: '../bad' },
    { operation: 'bad/path' },
    { operation: 1 },
  ])('rejects malformed messages: %j', (override) => {
    expect(dispatch({ ...request, ...override }).kept).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });
  it('requires remembered success only for automatic opening', async () => {
    h.settings.mockResolvedValue({});
    expect(await dispatch().result).toEqual({ opened: false });
    expect(h.create).not.toHaveBeenCalled();
    expect(await dispatch({ ...request, type: 'gatebreaker:open-spotify' }).result).toEqual({
      opened: true,
    });
  });
  it('opens only the native URL and persists nonsecret ownership only in session storage', async () => {
    expect(await dispatch().result).toEqual({ opened: true });
    expect(h.create).toHaveBeenCalledExactlyOnceWith({
      url: 'about:blank',
      type: 'popup',
      width: 720,
      height: 640,
      focused: true,
    });
    expect(h.update).toHaveBeenCalledExactlyOnceWith(91, { url: address });
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain('accounts.spotify.com');
    expect(serialized).not.toContain('private-native-state');
    expect(serialized).not.toContain('redirect_uri');
    expect(Object.values(saved)).toEqual([
      expect.objectContaining({
        tab: 7,
        window: 90,
        child: 91,
        path: '/artist/track',
        operation: 'authored-operation',
      }),
    ]);
  });
  it('blocks another automatic window for the same owner', async () => {
    await dispatch().result;
    expect(await dispatch({ ...request, operation: 'another' }).result).toEqual({ opened: false });
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it('closes on cancellation', async () => {
    await dispatch().result;
    await dispatch({ type: 'gatebreaker:cancel-spotify', operation: request.operation }).result;
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(90);
  });
  it('closes a late-created popup after cancellation', async () => {
    let finish!: (value: unknown) => void;
    h.create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const job = dispatch();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalled());
    await dispatch({ type: 'gatebreaker:cancel-spotify', operation: request.operation }).result;
    finish({ id: 90, tabs: [{ id: 91 }] });
    expect(await job.result).toEqual({ opened: false });
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(90);
  });
  it.each([{ url: 'https://hypeddit.com/another/gate' }, { status: 'loading' }])(
    'closes on owner navigation/reload: %j',
    async (change) => {
      await dispatch().result;
      h.updated.mock.calls.at(-1)![0](7, change);
      await vi.waitFor(() => expect(h.remove).toHaveBeenCalledExactlyOnceWith(90));
    },
  );
  it('closes on disable without a content response', async () => {
    await dispatch().result;
    h.storage.mock.calls.at(-1)![0]({ enabled: { newValue: false } }, 'local');
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledExactlyOnceWith(90));
  });
  it('does not open after navigation while preference read is pending', async () => {
    let finish!: (value: unknown) => void;
    h.settings.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const job = dispatch();
    await vi.waitFor(() => expect(h.settings).toHaveBeenCalled());
    h.get.mockResolvedValue({ id: 7, url: 'https://hypeddit.com/another/gate' });
    finish({ hypedditSpotifyReuse: { version: 1, confirmedAt: Date.now() } });
    expect(await job.result).toEqual({ opened: false });
    expect(h.create).not.toHaveBeenCalled();
  });
  it('restores ownership after worker restart and can cancel the same popup', async () => {
    await dispatch().result;
    await restart();
    expect(await heartbeat()).toEqual({ active: true, returned: false });
    await dispatch({ type: 'gatebreaker:cancel-spotify', operation: request.operation }).result;
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(90);
    expect(saved).toEqual({});
  });
  it.each(['disable', 'reload'])('recovers %s cleanup after worker restart', async (kind) => {
    await dispatch().result;
    await restart();
    await heartbeat();
    if (kind === 'disable')
      h.storage.mock.calls.at(-1)![0]({ enabled: { newValue: false } }, 'local');
    else h.updated.mock.calls.at(-1)![0](7, { status: 'loading' });
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledExactlyOnceWith(90));
  });
  it('correlates callback A without advancing concurrent owner B', async () => {
    h.get.mockImplementation(async (id) => ({
      id,
      url: id === 7 ? sender.url : 'https://hypeddit.com/artist/other',
    }));
    h.create
      .mockResolvedValueOnce({ id: 90, tabs: [{ id: 91 }] })
      .mockResolvedValueOnce({ id: 92, tabs: [{ id: 93 }] });
    await dispatch().result;
    const other = {
      ...sender,
      tab: { id: 8 } as chrome.tabs.Tab,
      url: 'https://hypeddit.com/artist/other',
    };
    await dispatch({ ...request, operation: 'other-operation' }, other).result;
    await relay();
    expect(await heartbeat()).toEqual({ active: true, returned: true });
    expect(await heartbeat(other, 'other-operation')).toEqual({ active: true, returned: false });
    expect(JSON.stringify(saved)).not.toContain('private-code');
  });
  it('retains the real callback return when its popup closes immediately', async () => {
    await dispatch().result;
    await relay();
    h.windowRemoved.mock.calls.at(-1)![0](90);
    expect(await heartbeat()).toEqual({ active: false, returned: true });
  });
  it('reports actual closure without inventing a return', async () => {
    await dispatch().result;
    h.windowRemoved.mock.calls.at(-1)![0](90);
    expect(await heartbeat()).toEqual({ active: false, returned: false });
  });
  it('bounds popup lifetime across restart and contains create failures', async () => {
    await dispatch().result;
    await restart();
    await heartbeat();
    await vi.advanceTimersByTimeAsync(125000);
    expect(h.remove).toHaveBeenCalledExactlyOnceWith(90);
    h.create.mockRejectedValue(Error('Unavailable'));
    expect(await dispatch({ ...request, operation: 'failed' }).result).toEqual({ opened: false });
  });
});
