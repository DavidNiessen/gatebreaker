import { beforeEach, describe, it, expect, vi } from 'vitest';
const hooks = vi.hoisted(() => ({
  listen: vi.fn(),
  download: vi.fn(),
  open: vi.fn(),
  getTab: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('../src/platform/browser', () => ({
  extension: {
    runtime: { id: 'fixture-extension', onMessage: { addListener: hooks.listen } },
    downloads: { download: hooks.download },
    tabs: { create: hooks.open, get: hooks.getTab },
  },
  isEnabled: hooks.enabled,
}));
let listener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (v: unknown) => void,
) => boolean | void;
const sender = {
  id: 'fixture-extension',
  frameId: 0,
  tab: { id: 7 },
  url: 'https://push.fm/cu/fixture',
} as chrome.runtime.MessageSender;
const result = {
  ok: true,
  url: 'https://downloads.example.invalid/fixture.wav',
  kind: 'file',
  method: 'provider-request',
};
function request(value: unknown, origin = sender) {
  let reply!: (value: unknown) => void;
  if (value && typeof value === 'object' && 'type' in value && value.type === 'gatebreaker:deliver')
    value = { operation: 'fixture-operation', ...value };
  const response = new Promise((resolve) => {
    reply = resolve;
  });
  return { keep: listener(value, origin, reply), response };
}
beforeEach(async () => {
  vi.resetModules();
  for (const h of Object.values(hooks)) h.mockReset();
  hooks.enabled.mockResolvedValue(true);
  hooks.getTab.mockResolvedValue({ url: sender.url });
  hooks.download.mockResolvedValue(7);
  hooks.open.mockResolvedValue({ id: 8 });
  await import('../src/entrypoints/background');
  listener = hooks.listen.mock.calls[0]![0];
});
describe('background automatic delivery', () => {
  it('starts a validated file only through downloads with no overwrite', async () => {
    const pending = request({ type: 'gatebreaker:deliver', result });
    expect(pending.keep).toBe(true);
    expect(await pending.response).toMatchObject({ state: 'started', files: 1 });
    expect(hooks.download).toHaveBeenCalledExactlyOnceWith({
      url: result.url,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    expect(hooks.open).not.toHaveBeenCalled();
  });
  it('opens a page destination and preserves its key instead of downloading HTML', async () => {
    const url = 'https://mega.nz/file/fixture#key';
    expect(
      await request({ type: 'gatebreaker:deliver', result: { ...result, kind: 'page', url } })
        .response,
    ).toMatchObject({ state: 'started', files: 0 });
    expect(hooks.open).toHaveBeenCalledExactlyOnceWith({ url, active: true });
    expect(hooks.download).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'other' },
    { frameId: 1 },
    { tab: undefined },
    { url: 'https://evil.example/a' },
    { url: 'https://user:pass@push.fm/cu/a' },
    { url: 'http://push.fm/cu/a' },
    { url: 'https://push.fm:8443/cu/a' },
  ])('rejects untrusted delivery senders: %j', (change) => {
    expect(
      request({ type: 'gatebreaker:deliver', result }, {
        ...sender,
        ...change,
      } as chrome.runtime.MessageSender).keep,
    ).toBe(false);
    expect(hooks.download).not.toHaveBeenCalled();
    expect(hooks.open).not.toHaveBeenCalled();
  });
  it.each([
    'http://example.com/file',
    'https://127.0.0.1/file',
    'https://localhost/file',
    'javascript:alert(1)',
  ])('rejects unsafe destinations: %s', (url) => {
    expect(request({ type: 'gatebreaker:deliver', result: { ...result, url } }).keep).toBe(false);
    expect(hooks.download).not.toHaveBeenCalled();
  });
  it('does not start delivery while disabled', async () => {
    hooks.enabled.mockResolvedValue(false);
    expect(await request({ type: 'gatebreaker:deliver', result }).response).toMatchObject({
      state: 'failed',
    });
    expect(hooks.download).not.toHaveBeenCalled();
  });
  it('reports browser API failures without repeating requests', async () => {
    hooks.download.mockRejectedValue(Error('refused'));
    expect(await request({ type: 'gatebreaker:deliver', result }).response).toMatchObject({
      state: 'failed',
    });
    expect(hooks.download).toHaveBeenCalledOnce();
  });

  it('cancels remaining file starts while a browser handoff is pending', async () => {
    let finish!: (v: number) => void;
    hooks.download.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = request({
      type: 'gatebreaker:deliver',
      result: {
        ...result,
        destinations: [
          { label: 'a', url: result.url },
          { label: 'b', url: result.url + '2' },
        ],
      },
    });
    await vi.waitFor(() => expect(hooks.download).toHaveBeenCalledOnce());
    const reply = vi.fn();
    listener(
      { type: 'gatebreaker:cancel-delivery', operation: 'fixture-operation' },
      sender,
      reply,
    );
    finish(7);
    expect(await pending.response).toMatchObject({ state: 'failed', files: 1 });
    expect(hooks.download).toHaveBeenCalledOnce();
  });
  it('stops remaining files when the tab moves to another gate', async () => {
    hooks.download.mockImplementationOnce(async () => {
      hooks.getTab.mockResolvedValue({ url: 'https://push.fm/cu/different' });
      return 7;
    });
    const pending = request({
      type: 'gatebreaker:deliver',
      result: {
        ...result,
        destinations: [
          { label: 'a', url: result.url },
          { label: 'b', url: result.url + '2' },
        ],
      },
    });
    expect(await pending.response).toMatchObject({ state: 'failed', files: 1 });
    expect(hooks.download).toHaveBeenCalledOnce();
  });
});
