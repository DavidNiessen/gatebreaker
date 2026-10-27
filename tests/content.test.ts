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
  type: 'gatebreaker:status' | 'gatebreaker:resolve' | 'gatebreaker:action' | 'gatebreaker:cancel',
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
    <h1>Fixture track</h1><input id="fan_gate_id" value="12345">
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
  it('cancels a pending check without publishing its eventual result', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const waiting = deferred<Resolution>();
    let signal!: AbortSignal;
    vi.spyOn(hypeddit, 'resolve').mockImplementation((_gate, context) => {
      signal = context.signal!;
      return waiting.promise;
    });
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    expect((await request('gatebreaker:cancel')).cancelled).toBe(true);
    expect(signal.aborted).toBe(true);
    waiting.resolve({ ok: true, url: publicUrl, method: 'skip-request' });
    expect(await pending).toMatchObject({
      busy: false,
      cancelled: true,
      progress: null,
      result: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a forged cancellation command and ignores idle cancellation', async () => {
    await import('../src/entrypoints/content');
    const respond = vi.fn();
    expect(
      runtimeListener()(
        { type: 'gatebreaker:cancel' },
        { id: 'other', url: trustedSender.url! },
        respond,
      ),
    ).toBe(false);
    expect(respond).not.toHaveBeenCalled();
    expect((await request('gatebreaker:cancel')).cancelled).toBe(false);
  });

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

  it('waits for the HTTP email response after Download and prevents duplicate requests', async () => {
    vi.useFakeTimers();
    emailStep();
    const mail = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith('/verifyEmailAddress')
        ? mail.promise
        : new Response('{"download_status":false,"URL":""}', {
            headers: { 'content-type': 'application/json' },
          }),
    );
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    expect(fetch).not.toHaveBeenCalled();
    const pending = request('gatebreaker:resolve');
    const state = await request('gatebreaker:status');
    expect(state).toMatchObject({
      websiteSession: true,
      result: null,
      actionStates: { 'prepare-email': { state: 'waiting' } },
    });
    expect(state.preparedEmail).toBe('gatebreakeros@proton.me');
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/verifyEmailAddress')),
    ).toHaveLength(1);
    expect((await request('gatebreaker:resolve')).busy).toBe(true);
    await request('gatebreaker:action', 'prepare-email');
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/verifyEmailAddress')),
    ).toHaveLength(1);
    document.querySelector('#email-step')!.classList.add('move-left');
    expect((await request('gatebreaker:status')).actionStates?.['prepare-email']?.state).toBe(
      'waiting',
    );
    mail.resolve(
      new Response('{"status":"T"}', { headers: { 'content-type': 'application/json' } }),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect((await pending).busy).toBe(false);
    expect((await request('gatebreaker:status')).actionStates?.['prepare-email']?.state).toBe(
      'complete',
    );
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#email_address')!.value).toBe('');
    expect(document.querySelector<HTMLInputElement>('#email_name')!.value).toBe('');
    const count = vi.mocked(fetch).mock.calls.length;
    await request('gatebreaker:action', 'prepare-email');
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it('submits optional email by HTTP after Download and stays inert while disabled', async () => {
    emailStep();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="skipper_email" data-step="email"></button>',
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        new Response(
          String(input).endsWith('/verifyEmailAddress')
            ? '{"status":"T"}'
            : '{"download_status":false,"URL":""}',
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/verifyEmailAddress')),
    ).toHaveLength(1);
    const count = vi.mocked(fetch).mock.calls.length;
    enable(false);
    await request('gatebreaker:action', 'prepare-email');
    expect(fetch).toHaveBeenCalledTimes(count);
    expect(click).not.toHaveBeenCalled();
  });

  it('retries an HTTP-rejected email once on the next request with the same fixed address', async () => {
    vi.useFakeTimers();
    emailStep();
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        new Response(
          String(input).endsWith('/verifyEmailAddress')
            ? '{"status":"F"}'
            : '{"download_status":false,"URL":""}',
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    await import('../src/entrypoints/content');
    const firstPending = request('gatebreaker:resolve');
    await vi.advanceTimersByTimeAsync(200);
    const first = await firstPending;
    expect(first.preparedEmail).toBe('gatebreakeros@proton.me');
    expect(first.actionStates?.['prepare-email']?.state).toBe('error');
    await request('gatebreaker:status');
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/verifyEmailAddress')),
    ).toHaveLength(1);
    const retryPending = request('gatebreaker:resolve');
    await vi.advanceTimersByTimeAsync(200);
    const retry = await retryPending;
    expect(retry.preparedEmail).toBe('gatebreakeros@proton.me');
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/verifyEmailAddress')),
    ).toHaveLength(2);
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

  it('allows retry after an unconfirmed provider action times out without reporting success', async () => {
    vi.useFakeTimers();
    emailStep();
    const { hypeddit } = await import('../src/providers/hypeddit');
    vi.spyOn(hypeddit, 'performAction').mockReturnValue({
      ok: true,
      value: 'authored@icloud.com',
      message: 'Waiting for fixture HTTP',
    });
    vi.spyOn(hypeddit, 'actionProgress').mockReturnValue(null);
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

  it('does not accept a completed native slide without a successful HTTP response', async () => {
    emailStep();
    document.querySelector('#email-step')!.classList.add('move-left');
    const mail = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mail.promise);
    const click = vi.fn();
    document.querySelector('#email_to_downloads_next')!.addEventListener('click', click);
    await import('../src/entrypoints/content');
    expect(
      (await request('gatebreaker:action', 'prepare-email')).actionStates?.['prepare-email']?.state,
    ).toBe('waiting');
    mail.resolve(
      new Response('{"status":"T"}', { headers: { 'content-type': 'application/json' } }),
    );
    await vi.waitFor(async () =>
      expect((await request('gatebreaker:status')).actionStates?.['prepare-email']?.state).toBe(
        'complete',
      ),
    );
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

  it('requires a new Download after initially declared sign-ins complete and resolves once', async () => {
    const { hypeddit } = await import('../src/providers/hypeddit');
    const progress: Record<string, { state: 'waiting' | 'complete'; message: string }> = {};
    const ids = ['sign-in-spotify', 'sign-in-soundcloud'];
    vi.spyOn(hypeddit, 'actions').mockReturnValue(
      ids.map((id) => ({
        id,
        kind: 'sign-in',
        label: id,
        description: 'Authored provider contract',
        required: true,
      })),
    );
    vi.spyOn(hypeddit, 'performAction').mockImplementation((id) => {
      progress[id] = { state: 'waiting', message: 'Waiting for authored native receipt' };
      return { ok: true, message: progress[id]!.message };
    });
    vi.spyOn(hypeddit, 'actionProgress').mockImplementation((id) => progress[id] ?? null);
    const resolve = vi
      .spyOn(hypeddit, 'resolve')
      .mockResolvedValue({ ok: true, url: publicUrl, method: 'website-session' });
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    expect(resolve).not.toHaveBeenCalled();
    await request('gatebreaker:action', ids[0]);
    expect((await request('gatebreaker:status')).actionStates?.[ids[0]!]!.state).toBe('waiting');
    progress[ids[0]!] = { state: 'complete', message: 'Authored native receipt confirmed' };
    await request('gatebreaker:status');
    expect(resolve).not.toHaveBeenCalled();
    await request('gatebreaker:action', ids[1]);
    progress[ids[1]!] = { state: 'complete', message: 'Authored native receipt confirmed' };
    await request('gatebreaker:status');
    expect(resolve).not.toHaveBeenCalled();
    expect((await request('gatebreaker:resolve')).result?.ok).toBe(true);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('resolves with optional logins untouched', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="login_to_sp"></button><button id="skipper_sp" data-step="sp"></button>',
    );
    const click = vi.fn();
    document.querySelector('#login_to_sp')!.addEventListener('click', click);
    const { hypeddit } = await import('../src/providers/hypeddit');
    const resolve = vi
      .spyOn(hypeddit, 'resolve')
      .mockResolvedValue({ ok: true, url: publicUrl, method: 'skip-request' });
    await import('../src/entrypoints/content');
    await request('gatebreaker:resolve');
    expect(resolve).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it.each(['complete', 'cancel', 'disable', 'navigate'] as const)(
    'handles HTTP-discovered required auth without DOM progression: %s',
    async (outcome) => {
      vi.useFakeTimers();
      const { hypeddit } = await import('../src/providers/hypeddit');
      let discovered = false;
      let complete = false;
      vi.spyOn(hypeddit, 'actions').mockImplementation(() =>
        discovered
          ? [
              {
                id: 'sign-in-spotify',
                kind: 'sign-in',
                label: 'Sign in with Spotify',
                description: 'Authored provider contract',
                required: true,
              },
            ]
          : [],
      );
      vi.spyOn(hypeddit, 'performAction').mockReturnValue({
        ok: true,
        message: 'Authored native window opened',
      });
      vi.spyOn(hypeddit, 'actionProgress').mockImplementation(() =>
        complete ? { state: 'complete', message: 'Authored receipt confirmed' } : null,
      );
      const resolve = vi
        .spyOn(hypeddit, 'resolve')
        .mockImplementationOnce(async () => {
          discovered = true;
          return { ok: false, code: 'server-required', message: 'Sign in required' };
        })
        .mockResolvedValue({ ok: true, url: publicUrl, method: 'website-session' });
      await import('../src/entrypoints/content');
      expect((await request('gatebreaker:resolve')).waitingForLogin).toBe(true);
      await request('gatebreaker:action', 'sign-in-spotify');
      if (outcome === 'cancel') await request('gatebreaker:cancel');
      if (outcome === 'disable') enable(false);
      if (outcome === 'navigate') {
        document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value =
          'fixture456';
        await request('gatebreaker:status');
      }
      complete = true;
      await vi.advanceTimersByTimeAsync(500);
      await request('gatebreaker:status');
      await vi.advanceTimersByTimeAsync(0);
      expect(resolve).toHaveBeenCalledTimes(outcome === 'complete' ? 2 : 1);
      expect((await request('gatebreaker:status')).waitingForLogin).toBe(false);
    },
  );

  it.each(['cancel', 'disable', 'navigate'] as const)(
    'does not resolve after an abandoned HTTP email response: %s',
    async (outcome) => {
      vi.useFakeTimers();
      emailStep();
      const mail = deferred<Response>();
      vi.mocked(fetch).mockReturnValue(mail.promise);
      const { hypeddit } = await import('../src/providers/hypeddit');
      const resolve = vi.spyOn(hypeddit, 'resolve');
      await import('../src/entrypoints/content');
      const pending = request('gatebreaker:resolve');
      const before = resolve.mock.calls.length;
      if (outcome === 'cancel') await request('gatebreaker:cancel');
      if (outcome === 'disable') enable(false);
      if (outcome === 'navigate') {
        document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value =
          'fixture456';
        await request('gatebreaker:status');
      }
      mail.resolve(
        new Response('{"status":"T"}', { headers: { 'content-type': 'application/json' } }),
      );
      await vi.advanceTimersByTimeAsync(200);
      expect((await pending).result).toBeNull();
      expect(resolve).toHaveBeenCalledTimes(before);
    },
  );

  it('automatically hands a successful requested result to the browser exactly once', async () => {
    hooks.sendMessage
      .mockResolvedValueOnce({ url: publicUrl })
      .mockResolvedValueOnce({ state: 'started', files: 1, message: 'Download started.' });
    await import('../src/entrypoints/content');
    expect((await request('gatebreaker:resolve')).delivery).toMatchObject({
      state: 'started',
      files: 1,
    });
    expect(
      hooks.sendMessage.mock.calls.filter(([value]) => value.type === 'gatebreaker:deliver'),
    ).toHaveLength(1);
    await request('gatebreaker:status');
    await request('gatebreaker:status');
    expect(
      hooks.sendMessage.mock.calls.filter(([value]) => value.type === 'gatebreaker:deliver'),
    ).toHaveLength(1);
  });

  it('never delivers from an anonymous-only diagnostic', async () => {
    hooks.sendMessage.mockResolvedValue({ url: publicUrl });
    await import('../src/entrypoints/content');
    expect((await request('gatebreaker:resolve', undefined, true)).result?.ok).toBe(true);
    expect(
      hooks.sendMessage.mock.calls.filter(([value]) => value.type === 'gatebreaker:deliver'),
    ).toHaveLength(0);
  });

  it('shows a recoverable delivery error without retrying the browser automatically', async () => {
    hooks.sendMessage
      .mockResolvedValueOnce({ url: publicUrl })
      .mockRejectedValueOnce(Error('browser refused'));
    await import('../src/entrypoints/content');
    expect((await request('gatebreaker:resolve')).delivery?.state).toBe('failed');
    await request('gatebreaker:status');
    expect(
      hooks.sendMessage.mock.calls.filter(([value]) => value.type === 'gatebreaker:deliver'),
    ).toHaveLength(1);
  });

  it('stops a pending delivery on cancellation and ignores its eventual receipt', async () => {
    const delivery = deferred<unknown>();
    hooks.sendMessage.mockImplementation(async (value) =>
      value.type === 'gatebreaker:public-file'
        ? { url: publicUrl }
        : value.type === 'gatebreaker:deliver'
          ? delivery.promise
          : { cancelled: true },
    );
    await import('../src/entrypoints/content');
    const pending = request('gatebreaker:resolve');
    await vi.waitFor(() =>
      expect(
        hooks.sendMessage.mock.calls.some(([value]) => value.type === 'gatebreaker:deliver'),
      ).toBe(true),
    );
    await request('gatebreaker:cancel');
    expect(
      hooks.sendMessage.mock.calls.some(([value]) => value.type === 'gatebreaker:cancel-delivery'),
    ).toBe(true);
    delivery.resolve({ state: 'started', files: 1, message: 'stale' });
    expect((await pending).delivery).toBeNull();
  });

  it('retains a failed native control as an error after removing the progress log', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="login_to_sp"></button>');
    const { hypeddit } = await import('../src/providers/hypeddit');
    vi.spyOn(hypeddit, 'actions').mockReturnValue([
      {
        id: 'sign-in-spotify',
        kind: 'sign-in',
        label: 'Sign in with Spotify',
        description: 'Authored provider contract',
        required: true,
      },
    ]);
    vi.spyOn(hypeddit, 'performAction').mockReturnValue({
      ok: false,
      message: 'The sign-in window could not open. Try again.',
    });
    await import('../src/entrypoints/content');
    const state = await request('gatebreaker:action', 'sign-in-spotify');
    expect(state.actionStates?.['sign-in-spotify']).toEqual({
      state: 'error',
      message: 'The sign-in window could not open. Try again.',
    });
    expect((await request('gatebreaker:status')).actionStates?.['sign-in-spotify']?.state).toBe(
      'error',
    );
  });
});
