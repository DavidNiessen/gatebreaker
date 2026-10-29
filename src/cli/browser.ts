import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext, Page } from 'playwright';
import type { GateSummary, Resolution } from '../core';
import { providers, safeHttpsUrl } from '../core';
import type { PageStatus } from '../extension/platform/messages';
import { prepareBrowserProfile } from './browser-profile';
import { ensureBrowserInstalled } from './install-browser';
import { browserWindows } from './browser-windows';
import { pendingRequiredInteractions } from '../extension/application/gate-actions';

class InteractiveRequired extends Error {}

export interface BrowserOptions {
  profile?: string;
  /** Explicit injection for authored tests, never a normal browser executable/profile. */
  extensionPath?: string;
  /** Test override. Omit for automatic headless-to-interactive operation. */
  headless?: boolean;
  setup?: (context: BrowserContext, headless: boolean) => Promise<void>;
}
export interface BrowserRequest {
  signal: AbortSignal;
  inspect: boolean;
  comment?: string;
  progress(message: string): void;
}
export interface BrowserResult {
  gate: GateSummary;
  result?: Resolution;
}
export interface BrowserResolver {
  resolve(url: string, request: BrowserRequest): Promise<BrowserResult>;
  close(): Promise<void>;
}

export function createBrowserResolver(options: BrowserOptions = {}): BrowserResolver {
  let context: BrowserContext | undefined;
  let closing: Promise<void> | undefined;
  let runningHeadless: boolean | undefined;
  const close = async () => {
    const current = context;
    context = undefined;
    runningHeadless = undefined;
    if (current) closing = current.close().catch(() => {});
    await closing;
  };
  const resolveInContext = async (
    address: string,
    request: BrowserRequest,
    headless: boolean,
  ): Promise<BrowserResult> => {
    if (!safeHttpsUrl(address) || !providers.some((provider) => provider.matches(new URL(address))))
      throw new Error('This URL is not a supported gate.');
    const abort = () => {
      void close();
    };
    request.signal.addEventListener('abort', abort, { once: true });
    let gatePage: Page | undefined;
    let controller: Page | undefined;
    let controlTab: number | undefined;
    let gateTab: number | undefined;
    let removeListeners = () => {};
    try {
      request.signal.throwIfAborted();
      await closing;
      if (!context) {
        const profile = await prepareBrowserProfile(options.profile);
        const extensionPath = path.resolve(
          options.extensionPath ?? fileURLToPath(new URL('./browser-extension', import.meta.url)),
        );
        await access(path.join(extensionPath, 'manifest.json'));
        const { chromium } = await import('playwright');
        await ensureBrowserInstalled(chromium.executablePath(), request.signal, request.progress);
        try {
          context = await chromium.launchPersistentContext(profile, {
            channel: 'chromium',
            headless,
            acceptDownloads: false,
            ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'],
            args: [
              ...(!headless ? ['--start-minimized'] : []),
              `--disable-extensions-except=${extensionPath}`,
              `--load-extension=${extensionPath}`,
            ],
          });
        } catch {
          throw new Error(
            headless
              ? 'Could not launch headless Chromium. Run gatebreaker --install-browser, install Chromium system libraries, and close other CLI commands using this profile.'
              : 'Could not open the required sign-in window. A desktop is needed for interactive verification. Close other CLI commands using this profile and retry.',
          );
        }
        runningHeadless = headless;
        const opened = context;
        context.on('close', () => {
          if (context === opened) {
            context = undefined;
            runningHeadless = undefined;
          }
        });
        await options.setup?.(context, headless);
      }
      request.signal.throwIfAborted();
      const current = context;
      const windows = browserWindows(current, !headless);
      for (const page of current.pages()) await windows.minimize(page);
      const worker =
        current.serviceWorkers().find((worker) => worker.url().startsWith('chrome-extension://')) ??
        (await current.waitForEvent('serviceworker', {
          timeout: 20000,
          predicate: (worker) => worker.url().startsWith('chrome-extension://'),
        }));
      const extensionId = new URL(worker.url()).hostname;
      if (request.comment !== undefined)
        await worker.evaluate(async (text) => {
          await chrome.storage.local.set({ gatebreakerPreferences: { soundcloudComment: text } });
        }, request.comment);
      gatePage = await current.newPage();
      await windows.minimize(gatePage);
      await gatePage.goto(address, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const canonical = new URL(gatePage.url());
      if (
        !safeHttpsUrl(canonical.href) ||
        !providers.some((provider) => provider.matches(canonical))
      )
        throw new Error('The gate navigated to an unsupported page.');
      const tabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url === url)?.id;
      }, canonical.href);
      if (tabId === undefined) throw new Error('The browser could not identify the gate tab.');
      gateTab = tabId;
      // Keep the existing private popup sender boundary. This controller is an
      // inactive extension tab, never a page-facing bridge or localhost server.
      const pending = current.waitForEvent('page', { timeout: 10000 });
      controlTab = await worker.evaluate(async (id) => {
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL('popup.html'),
          active: false,
        });
        if (tab.id === undefined) throw new Error('Private controller tab unavailable.');
        await chrome.storage.session.set({ ['cliTarget:' + tab.id]: id });
        await chrome.tabs.update(id, { active: true });
        return tab.id;
      }, tabId);
      controller = await pending;
      await controller.waitForLoadState('domcontentloaded');
      await controller.reload({ waitUntil: 'domcontentloaded' });
      await windows.minimize(gatePage);
      if (controller.url() !== `chrome-extension://${extensionId}/popup.html`)
        throw new Error('The private browser controller could not be initialized.');
      const control = controller;
      const send = (type: string) =>
        control.evaluate(
          async ({ id, type }) => chrome.tabs.sendMessage(id, { type }) as Promise<PageStatus>,
          { id: tabId, type },
        );
      let state: PageStatus | undefined;
      for (let retry = 0; retry < 60; retry++) {
        request.signal.throwIfAborted();
        try {
          state = await send('gatebreaker:status');
          if (state.gate) break;
        } catch {
          /* Wait for document_idle injection. */
        }
        await delay(200, undefined, { signal: request.signal });
      }
      if (!state?.gate)
        throw new Error('Gatebreaker could not inspect this page in the dedicated browser.');
      const original = state.gate;
      if (request.inspect) return { gate: original };
      if (!state.enabled)
        throw new Error(
          'Gatebreaker is disabled in the CLI browser. Enable it in its panel and retry.',
        );
      request.progress(
        'Preparing the gate in the background. A sign-in or verification window opens only if needed.',
      );
      // Return immediately from evaluate so cancellation/progress polling never
      // waits on a long-lived resolution message.
      await control.evaluate(
        ({ id }) => {
          void chrome.tabs.sendMessage(id, { type: 'gatebreaker:resolve' }).catch(() => {});
        },
        { id: tabId },
      );
      let previous = '';
      const activated = new Set<string>();
      let waitingSince: number | undefined;
      const hideParent = () => {
        void windows.minimize(gatePage!).catch(() => {});
      };
      const observePage = (page: Page) => {
        page.once('close', hideParent);
      };
      current.on('page', observePage);
      removeListeners = () => {
        current.off('page', observePage);
      };
      while (true) {
        request.signal.throwIfAborted();
        if (gatePage.isClosed() || control.isClosed())
          throw new Error('The dedicated browser was closed before the gate completed.');
        const now = new URL(gatePage.url());
        if (now.origin !== canonical.origin || now.pathname !== canonical.pathname)
          throw new Error(
            'The gate changed during browser resolution. Retry with the new gate URL.',
          );
        state = await send('gatebreaker:status');
        if (state.gate?.id !== original.id || state.gate.provider !== original.provider)
          throw new Error('The gate identity changed during browser resolution.');
        const message = state.progress?.message ?? state.actionMessage ?? '';
        if (message && message !== previous) {
          previous = message;
          request.progress(message);
        }
        const interactions = pendingRequiredInteractions(state.actions, state.actionStates);
        const interaction = interactions[0];
        if (interaction && !state.busy) {
          waitingSince ??= Date.now();
          if (
            headless &&
            options.headless === undefined &&
            (interaction.kind !== 'sign-in' || Date.now() - waitingSince >= 3000)
          ) {
            await send('gatebreaker:cancel').catch(() => {});
            throw new InteractiveRequired();
          }
          if (interaction.kind === 'sign-in') {
            await windows.hideVerification(control);
            if (
              state.actionStates?.[interaction.id]?.state === 'error' &&
              activated.has(interaction.id)
            ) {
              if (headless && options.headless === undefined) throw new InteractiveRequired();
              throw new Error(
                'The provider did not confirm sign-in. Finish its verification, then run the command again.',
              );
            }
            if (
              !activated.has(interaction.id) &&
              state.actionStates?.[interaction.id]?.state !== 'waiting'
            ) {
              activated.add(interaction.id);
              // A provider can discover account requirements during its HTTP
              // attempt. Refresh the private view before its trusted action.
              await control.reload({ waitUntil: 'domcontentloaded' });
              const selector = await control.evaluate(
                (id) => '#native-controls button[data-action="' + CSS.escape(id) + '"]',
                interaction.id,
              );
              try {
                await control.waitForFunction(
                  (selector) => {
                    const button = document.querySelector<HTMLButtonElement>(selector);
                    return !!button && !button.disabled;
                  },
                  selector,
                  { timeout: 10000, polling: 100 },
                );
                // The private controller stays minimized. Dispatch a trusted
                // click without waiting for visible-window animation frames.
                await control.locator(selector).click({ force: true, timeout: 10000 });
              } catch {
                const refreshed = await send('gatebreaker:status');
                const progress = refreshed.actionStates?.[interaction.id]?.state;
                if (progress !== 'waiting' && progress !== 'complete')
                  throw new Error(
                    'The sign-in window could not open. Run the command again to retry.',
                  );
              }
            }
            await windows.showAccounts(gatePage, control);
          } else if (!headless || options.headless === true) {
            if (interaction.kind === 'captcha' && !activated.has(interaction.id)) {
              activated.add(interaction.id);
              await control.evaluate(
                async ({ id, action }) =>
                  chrome.tabs.sendMessage(id, { type: 'gatebreaker:action', action }),
                { id: tabId, action: interaction.id },
              );
            }
            await windows.showVerification(worker, controlTab!, control);
          }
        } else {
          waitingSince = undefined;
          await windows.hideVerification(control);
        }
        if (!state.busy && !state.waitingForLogin && state.result)
          return { gate: original, result: state.result };
        if (state.cancelled) throw new Error('The browser check was cancelled.');
        await delay(400, undefined, { signal: request.signal });
      }
    } finally {
      request.signal.removeEventListener('abort', abort);
      removeListeners();
      if (!request.signal.aborted && controller && !controller.isClosed() && gateTab !== undefined)
        await controller
          .evaluate(
            async (id) => chrome.tabs.sendMessage(id, { type: 'gatebreaker:cancel' }),
            gateTab,
          )
          .catch(() => {});
      if (!request.signal.aborted && controlTab !== undefined && context) {
        const worker = context.serviceWorkers()[0];
        await worker
          ?.evaluate(async (id) => chrome.storage.session.remove('cliTarget:' + id), controlTab)
          .catch(() => {});
      }
      if (request.signal.aborted) await close();
      else {
        await controller?.close().catch(() => {});
        await gatePage?.close().catch(() => {});
      }
    }
  };
  return {
    close,
    async resolve(address, request) {
      try {
        return await resolveInContext(
          address,
          request,
          runningHeadless ?? options.headless ?? true,
        );
      } catch (error) {
        if (!(error instanceof InteractiveRequired) || options.headless !== undefined) throw error;
        await close();
        request.signal.throwIfAborted();
        request.progress(
          process.platform === 'win32'
            ? 'Opening the required sign-in or verification window. The gate stays hidden.'
            : 'Opening the required sign-in or verification window. The gate stays minimized.',
        );
        return await resolveInContext(address, request, false);
      }
    },
  };
}

export { windowsBackgroundStatus } from './windows-background';
