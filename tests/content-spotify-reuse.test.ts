import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { PageStatus } from '../src/platform/messages';
type Listener = (
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
) => boolean | void;
const hooks = vi.hoisted(() => ({
  runtime: vi.fn(),
  storage: vi.fn(),
  send: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  panel: vi.fn(),
}));
vi.mock('../src/platform/browser', () => ({
  extension: {
    runtime: {
      id: 'authored',
      getURL: (path: string) => 'chrome-extension://authored/' + path,
      onMessage: { addListener: hooks.runtime },
      onConnect: { addListener: vi.fn() },
      sendMessage: hooks.send,
    },
    storage: {
      local: { get: hooks.get, set: hooks.set },
      onChanged: { addListener: hooks.storage },
    },
  },
  isEnabled: async () => true,
}));
vi.mock('../src/ui/panel', () => ({
  createPanel: (anchor: Element) => {
    const host = document.createElement('div');
    host.id = 'gatebreaker-panel';
    anchor.after(host);
    return { update: hooks.panel, remove: () => host.remove() };
  },
}));
const auth =
  'https://accounts.spotify.com/authorize?client_id=authored&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored&state=authored';
function fixture(gate = 'reusedGate') {
  document.head.innerHTML = '<meta name="csrf-token" content="authored-reuse-csrf-000000000000">';
  document.body.innerHTML = `<a id="downloadProcess"></a><input id="fan_gate_id" value="12345"><input id="current_download_file_listner" value="${gate}"><input id="wrndk" value="authored-${gate}"><input id="nwSteps" value="email,sp"><input id="is_unlimited" value="1"><section class="fangate-slider-content"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next"></button><a id="login_to_sp" onclick="PopupCenterDual('${auth}','sp_popup',500,500)"></a></section>`;
}
function request(type: string, extra: Record<string, unknown> = {}): Promise<PageStatus> {
  return new Promise((resolve) =>
    (hooks.runtime.mock.calls[0]![0] as Listener)(
      { type, ...extra },
      { id: 'authored', url: 'chrome-extension://authored/popup.html' },
      (value) => resolve(value as PageStatus),
    ),
  );
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function receipt() {
  return { hypedditSpotifyReuse: { version: 1, confirmedAt: Date.now() - 1000 } };
}
async function returned() {
  const { hypedditState } = await import('../src/providers/hypeddit/session');
  const { checkHypedditNativeAuth } = await import('../src/providers/hypeddit/native-auth');
  const current = hypedditState(document),
    pending = current.nativeAuth.get('sign-in-spotify')!;
  pending.callbackSeen = true;
  checkHypedditNativeAuth(document, new URL(location.href), current, pending);
}
beforeEach(() => {
  vi.resetModules();
  for (const hook of Object.values(hooks)) hook.mockReset();
  hooks.get.mockResolvedValue(receipt());
  hooks.set.mockResolvedValue(undefined);
  hooks.send.mockImplementation(async (message) =>
    message.type === 'gatebreaker:reuse-spotify' || message.type === 'gatebreaker:open-spotify'
      ? { opened: true }
      : message.type === 'gatebreaker:deliver'
        ? { state: 'started', files: 1, message: 'Started' }
        : { url: null },
  );
  vi.stubGlobal('location', new URL('https://hypeddit.com/authored/reuse'));
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockReturnValue({
    closed: false,
    location: { origin: 'https://accounts.spotify.com', pathname: '/authorize' },
  } as unknown as Window);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (input) =>
        String(input).endsWith('/verifyEmailAddress')
          ? json({ status: 'T' })
          : json({ download_status: true, URL: 'https://hypeddit.com/download/authoredReuse' }),
      ),
  );
  fixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Download-only Spotify session reuse', () => {
  it('performs no preference read, sign-in, email or download request on page load', async () => {
    await import('../src/entrypoints/content');
    await request('gatebreaker:status');
    expect(hooks.get).not.toHaveBeenCalled();
    expect(hooks.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
  it('waits for accepted email, automatically opens once, and still requires final server proof', async () => {
    let accept!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith('/verifyEmailAddress')
        ? new Promise((resolve) => (accept = resolve))
        : json({ download_status: true, URL: 'https://hypeddit.com/download/authoredReuse' }),
    );
    await import('../src/entrypoints/content');
    const initial = request('gatebreaker:resolve');
    expect(hooks.send).not.toHaveBeenCalled();
    accept(json({ status: 'T' }));
    await initial;
    await vi.waitFor(() =>
      expect(hooks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gatebreaker:reuse-spotify',
          gateId: 'reusedGate',
          address: auth,
        }),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) await request('gatebreaker:status');
    expect(
      hooks.send.mock.calls.filter(([message]) => message.type === 'gatebreaker:reuse-spotify'),
    ).toHaveLength(1);
    await returned();
    await vi.waitFor(() => expect(hooks.set).toHaveBeenCalledTimes(1));
    const done = await request('gatebreaker:status');
    expect(done.result?.ok).toBe(true);
    expect(hooks.set.mock.calls[0]![0]).toEqual({
      hypedditSpotifyReuse: { version: 1, confirmedAt: expect.any(Number) },
    });
  });
  it('leaves first-time sign-in manual and remembers only its approved completion', async () => {
    hooks.get.mockResolvedValue({});
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    expect(
      hooks.send.mock.calls.some(([message]) => message.type === 'gatebreaker:reuse-spotify'),
    ).toBe(false);
    expect(hooks.set).not.toHaveBeenCalled();
    await request('gatebreaker:action', { action: 'sign-in-spotify' });
    expect(window.open).not.toHaveBeenCalled();
    expect(hooks.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gatebreaker:open-spotify' }),
    );
    expect(hooks.set).not.toHaveBeenCalled();
    await returned();
    await vi.waitFor(() => expect(hooks.set).toHaveBeenCalledTimes(1));
  });
  it('does not open after cancellation while preference loading is pending', async () => {
    let accept!: (value: unknown) => void;
    hooks.get.mockReturnValue(new Promise((resolve) => (accept = resolve)));
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    await request('gatebreaker:cancel');
    accept(receipt());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      hooks.send.mock.calls.some(([message]) => message.type === 'gatebreaker:reuse-spotify'),
    ).toBe(false);
    expect(hooks.set).not.toHaveBeenCalled();
  });
  it('does not reopen repeatedly after automatic popup failure', async () => {
    hooks.send.mockImplementation(async (message) =>
      message.type === 'gatebreaker:reuse-spotify' ? { opened: false } : { url: null },
    );
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    await vi.waitFor(() =>
      expect(
        hooks.send.mock.calls.filter(([message]) => message.type === 'gatebreaker:reuse-spotify'),
      ).toHaveLength(1),
    );
    for (let i = 0; i < 10; i++) await request('gatebreaker:status');
    expect(
      hooks.send.mock.calls.filter(([message]) => message.type === 'gatebreaker:reuse-spotify'),
    ).toHaveLength(1);
    expect(hooks.set).not.toHaveBeenCalled();
  });
  it('resumes reuse only after required CAPTCHA and email preparation', async () => {
    fixture();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="captchalog" data-attempts="over" data-sitekey="authored-sitekey-0000000000"></div>',
    );
    await import('../src/entrypoints/content');
    const paused = await request('gatebreaker:resolve');
    expect(paused.challenge).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(hooks.send).not.toHaveBeenCalled();
    await request('gatebreaker:challenge', { nonce: paused.challenge!.nonce });
    await vi.waitFor(() =>
      expect(hooks.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'gatebreaker:reuse-spotify' }),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
