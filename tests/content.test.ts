import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PageStatus } from '../src/platform/messages';

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (response: unknown) => void,
) => boolean | void;
type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

const hooks = vi.hoisted(() => ({
  runtimeListener: vi.fn(),
  storageListener: vi.fn(),
  sendMessage: vi.fn(),
  getSettings: vi.fn(),
  panelUpdate: vi.fn(),
}));

vi.mock('../src/platform/browser', () => ({
  extension: {
    runtime: {
      id: 'fixture-extension',
      getURL: (path: string) => `chrome-extension://fixture-extension/${path}`,
      onMessage: { addListener: hooks.runtimeListener },
      sendMessage: hooks.sendMessage,
    },
    storage: { onChanged: { addListener: hooks.storageListener } },
  },
  isEnabled: hooks.getSettings,
}));

vi.mock('../src/ui/panel', () => ({
  createPanel: (anchor: Element) => {
    const host = document.createElement('div');
    host.id = 'gatebreaker-panel';
    anchor.insertAdjacentElement('afterend', host);
    return { update: hooks.panelUpdate, remove: () => host.remove() };
  },
}));

const trustedSender: chrome.runtime.MessageSender = {
  id: 'fixture-extension',
  url: 'chrome-extension://fixture-extension/popup.html',
};
const publicUrl = 'https://hypeddit-gates-prod.s3.amazonaws.com/fixture123_main';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function runtimeListener(): RuntimeListener {
  return hooks.runtimeListener.mock.calls[0]![0] as RuntimeListener;
}

function request(type: 'gatebreaker:status' | 'gatebreaker:resolve'): Promise<PageStatus> {
  return new Promise((respond) => {
    runtimeListener()(type ? { type } : null, trustedSender, (value) =>
      respond(value as PageStatus),
    );
  });
}

function enable(value: boolean): void {
  const listener = hooks.storageListener.mock.calls[0]![0] as StorageListener;
  listener({ enabled: { newValue: value } }, 'local');
}

beforeEach(() => {
  vi.resetModules();
  for (const mock of Object.values(hooks)) mock.mockReset();
  hooks.getSettings.mockResolvedValue(true);
  hooks.sendMessage.mockResolvedValue({ url: null });
  vi.stubGlobal('location', new URL('https://hypeddit.com/fixture-artist/fixture-track'));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"download_status":false,"URL":""}', {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // Avoid retaining a new popstate listener for each dynamically imported entrypoint.
  vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  document.head.innerHTML = '<meta name="csrf-token" content="fixture-csrf-not-real">';
  document.body.innerHTML = `
    <h1>Fixture track</h1>
    <button id="downloadProcess">Download</button>
    <input id="current_download_file_listner" value="fixture123">
    <input id="is_unlimited" value="1">
    <input id="wrndk" value="fixture-session-not-real">
    <input id="nwSteps" value="email,sc,sp,unknown">
  `;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('content lifecycle', () => {
  it('inspects the page without resolving or fetching until requested', async () => {
    await import('../src/entrypoints/content');
    expect(document.getElementById('gatebreaker-panel')).not.toBeNull();
    expect(hooks.sendMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await request('gatebreaker:status')).toMatchObject({
      enabled: true,
      busy: false,
      result: null,
    });
  });

  it('keeps a locally disabled extension inert and allows enabling it later', async () => {
    hooks.getSettings.mockResolvedValue(false);
    await import('../src/entrypoints/content');
    expect(document.getElementById('gatebreaker-panel')).toBeNull();
    expect(await request('gatebreaker:resolve')).toMatchObject({ enabled: false, result: null });
    expect(hooks.sendMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    enable(true);
    expect(document.getElementById('gatebreaker-panel')).not.toBeNull();
  });

  it('rejects commands from a page, another extension, or a different extension surface', async () => {
    await import('../src/entrypoints/content');
    const respond = vi.fn();
    for (const sender of [
      { id: 'another-extension', url: 'chrome-extension://fixture-extension/popup.html' },
      { id: 'fixture-extension', url: 'https://hypeddit.com/fixture-artist/fixture-track' },
      { id: 'fixture-extension', url: 'chrome-extension://fixture-extension/other.html' },
    ]) {
      expect(runtimeListener()({ type: 'gatebreaker:resolve' }, sender, respond)).toBe(false);
    }
    expect(respond).not.toHaveBeenCalled();
    expect(hooks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not attach an old gate result after the page changes to another gate', async () => {
    const probe = deferred<{ url: string }>();
    hooks.sendMessage.mockReturnValue(probe.promise);
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    expect(hooks.sendMessage).toHaveBeenCalledOnce();
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value =
      'fixture456';
    expect(await request('gatebreaker:status')).toMatchObject({ gate: { id: 'fixture456' } });
    probe.resolve({ url: publicUrl });
    expect(await pending).toMatchObject({ busy: false, gate: { id: 'fixture456' }, result: null });
  });

  it('does not show an in-flight result while disabled', async () => {
    const probe = deferred<{ url: string | null }>();
    hooks.sendMessage.mockReturnValue(probe.promise);
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    enable(false);
    expect(document.getElementById('gatebreaker-panel')).toBeNull();
    probe.resolve({ url: null });
    expect(await pending).toMatchObject({ enabled: false, busy: false, result: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('invalidates an old result when disabled and re-enabled during resolution', async () => {
    const probe = deferred<{ url: string }>();
    hooks.sendMessage.mockReturnValue(probe.promise);
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    enable(false);
    enable(true);
    probe.resolve({ url: publicUrl });
    expect(await pending).toMatchObject({ enabled: true, busy: false, result: null });
  });

  it('does not resolve before the initial local preference has finished loading', async () => {
    const settings = deferred<boolean>();
    hooks.getSettings.mockReturnValue(settings.promise);
    await import('../src/entrypoints/content');
    const early = request('gatebreaker:resolve');
    settings.resolve(false);
    await early;
    expect(hooks.sendMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a newer storage change when an older initial preference read completes', async () => {
    const settings = deferred<boolean>();
    hooks.getSettings.mockReturnValue(settings.promise);
    await import('../src/entrypoints/content');
    enable(false);
    settings.resolve(true);
    await settings.promise;
    expect(await request('gatebreaker:status')).toMatchObject({ enabled: false, result: null });
    expect(document.getElementById('gatebreaker-panel')).toBeNull();
  });
});
