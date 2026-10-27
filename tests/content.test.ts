import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PageStatus } from '../src/platform/messages';
import type { Resolution, ResolutionProgress } from '../src/domain/provider';

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
  connectListener: vi.fn(),
}));

vi.mock('../src/platform/browser', () => ({
  extension: {
    runtime: {
      id: 'fixture-extension',
      getURL: (path: string) => `chrome-extension://fixture-extension/${path}`,
      onMessage: { addListener: hooks.runtimeListener },
      onConnect: { addListener: hooks.connectListener },
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

function request(
  type: 'gatebreaker:status' | 'gatebreaker:resolve' | 'gatebreaker:action',
  action?: string,
  anonymousOnly?: boolean,
): Promise<PageStatus> {
  return new Promise((respond) => {
    runtimeListener()(type ? { type, action, anonymousOnly } : null, trustedSender, (value) =>
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('content lifecycle', () => {
  it('publishes provider countdowns and clears them after resolution', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const waiting = deferred<Resolution>();
    let notify!: (progress: ResolutionProgress) => void;
    vi.spyOn(hypeddit, 'resolve').mockImplementation((_gate, context) => {
      notify = context.onProgress!;
      return waiting.promise;
    });
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    notify({ message: 'Waiting for the provider timer.', remainingSeconds: 20 });
    expect(await request('gatebreaker:status')).toMatchObject({
      busy: true,
      progress: { message: 'Waiting for the provider timer.', remainingSeconds: 20 },
    });
    waiting.resolve({ ok: true, url: publicUrl, method: 'skip-request' });
    expect(await pending).toMatchObject({ busy: false, progress: null, result: { ok: true } });
  });

  it('ignores countdown callbacks after disabling a pending resolution', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const waiting = deferred<Resolution>();
    let notify!: (progress: ResolutionProgress) => void;
    vi.spyOn(hypeddit, 'resolve').mockImplementation((_gate, context) => {
      notify = context.onProgress!;
      return waiting.promise;
    });
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    notify({ message: 'Waiting for the provider timer.', remainingSeconds: 20 });
    enable(false);
    notify({ message: 'Stale update', remainingSeconds: 10 });
    expect(await request('gatebreaker:status')).toMatchObject({ enabled: false, progress: null });
    waiting.resolve({ ok: true, url: publicUrl, method: 'skip-request' });
    expect(await pending).toMatchObject({ enabled: false, progress: null, result: null });
  });

  it('discards progress from a different gate after navigation', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const waiting = deferred<Resolution>();
    let notify!: (progress: ResolutionProgress) => void;
    vi.spyOn(hypeddit, 'resolve').mockImplementation((_gate, context) => {
      notify = context.onProgress!;
      return waiting.promise;
    });
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    notify({ message: 'Waiting for the provider timer.', remainingSeconds: 20 });
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value =
      'fixture456';
    await request('gatebreaker:status');
    notify({ message: 'Stale update', remainingSeconds: 10 });
    expect(await request('gatebreaker:status')).toMatchObject({
      gate: { id: 'fixture456' },
      progress: null,
    });
    waiting.resolve({ ok: true, url: publicUrl, method: 'skip-request' });
    expect(await pending).toMatchObject({
      gate: { id: 'fixture456' },
      progress: null,
      result: null,
    });
  });

  it('bounds progress copy and excludes nonfinite countdown values', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const waiting = deferred<Resolution>();
    let notify!: (progress: ResolutionProgress) => void;
    vi.spyOn(hypeddit, 'resolve').mockImplementation((_gate, context) => {
      notify = context.onProgress!;
      return waiting.promise;
    });
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    notify({ message: 'x'.repeat(500), remainingSeconds: Number.NaN });
    expect((await request('gatebreaker:status')).progress).toEqual({ message: 'x'.repeat(300) });
    waiting.resolve({ ok: false, code: 'network-error', message: 'Fixture failure' });
    expect(await pending).toMatchObject({ busy: false, progress: null });
  });

  it('keeps developer anonymous-only checks from submitting native email', async () => {
    emailStep();
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    const state = await request('gatebreaker:resolve', undefined, true);
    expect(state.result).toMatchObject({ ok: false, code: 'server-required' });
    expect(click).not.toHaveBeenCalled();
    expect(state.websiteSession).toBe(false);
  });

  it('restricts live status ports to the own popup and publishes disabled state', async () => {
    await import('../src/entrypoints/content');
    const connect = hooks.connectListener.mock.calls[0]![0] as (port: chrome.runtime.Port) => void;
    const port = {
      name: 'gatebreaker:popup',
      sender: trustedSender,
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    };
    connect(port as unknown as chrome.runtime.Port);
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    enable(false);
    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    for (const sender of [
      { id: 'other', url: trustedSender.url },
      { id: trustedSender.id, url: 'https://hypeddit.com/fixture' },
    ]) {
      const forged = { ...port, sender, postMessage: vi.fn(), disconnect: vi.fn() };
      connect(forged as unknown as chrome.runtime.Port);
      expect(forged.disconnect).toHaveBeenCalledOnce();
      expect(forged.postMessage).not.toHaveBeenCalled();
    }
  });
  function emailStep(): void {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="fangate-slider-content" id="email-step"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next"></button><span class="name_error_email hide"></span></div>',
    );
  }

  it('automatically submits required email only after an anonymous server rejection and prevents duplicates', async () => {
    vi.useFakeTimers();
    emailStep();
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    expect(click).not.toHaveBeenCalled();
    const state = await request('gatebreaker:resolve');
    expect(click).toHaveBeenCalledOnce();
    expect(state).toMatchObject({
      websiteSession: true,
      result: null,
      actionStates: { 'prepare-email': { state: 'waiting' } },
    });
    expect(state.preparedEmail).toMatch(/^[a-f0-9]{30}@gmail\.com$/);
    expect(
      new URLSearchParams(vi.mocked(fetch).mock.calls[0]![1]!.body as URLSearchParams).has('email'),
    ).toBe(false);
    await request('gatebreaker:action', 'prepare-email');
    expect(click).toHaveBeenCalledOnce();
    document.querySelector('#email-step')!.classList.add('move-left');
    const completed = await request('gatebreaker:status');
    expect(completed.actionStates?.['prepare-email']?.state).toBe('complete');
    expect(completed.actionMessage).toBe('Email step completed on Hypeddit.');
    await request('gatebreaker:action', 'prepare-email');
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not submit optional email automatically or perform actions while disabled', async () => {
    emailStep();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="skipper_email" data-step="email"></button>',
    );
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    expect(click).not.toHaveBeenCalled();
    enable(false);
    await request('gatebreaker:action', 'prepare-email');
    expect(click).not.toHaveBeenCalled();
  });

  it('retains native progress across Hypeddit query changes and resets it for another gate', async () => {
    vi.useFakeTimers();
    emailStep();
    await import('../src/entrypoints/content');
    await request('gatebreaker:action', 'prepare-email');
    vi.stubGlobal(
      'location',
      new URL('https://hypeddit.com/fixture-artist/fixture-track?nxstp=sp'),
    );
    expect((await request('gatebreaker:status')).websiteSession).toBe(true);
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value =
      'fixture456';
    expect(await request('gatebreaker:status')).toMatchObject({
      websiteSession: false,
      actionStates: {},
      preparedEmail: null,
    });
  });

  it('allows retry after an unconfirmed native step times out without reporting success', async () => {
    vi.useFakeTimers();
    emailStep();
    await import('../src/entrypoints/content');
    await request('gatebreaker:action', 'prepare-email');
    await vi.advanceTimersByTimeAsync(15100);
    expect((await request('gatebreaker:status')).actionStates?.['prepare-email']?.state).toBe(
      'error',
    );
    expect(
      (await request('gatebreaker:action', 'prepare-email')).actionStates?.['prepare-email']?.state,
    ).toBe('waiting');
  });

  it('recognizes a step already completed by Hypeddit without submitting it again', async () => {
    emailStep();
    document.querySelector('#email-step')!.classList.add('move-left');
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    expect(
      (await request('gatebreaker:action', 'prepare-email')).actionStates?.['prepare-email']?.state,
    ).toBe('complete');
    expect(click).not.toHaveBeenCalled();
  });
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
