import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext, Page } from 'playwright';
import type { GateSummary, Resolution } from '../core';
import { providers, safeHttpsUrl } from '../core';
import type { PageStatus } from '../extension/platform/messages';
import { prepareBrowserProfile } from './browser-profile';

export interface BrowserOptions {
  profile?: string;
  /** Explicit injection for authored tests, never a normal browser executable/profile. */
  extensionPath?: string;
  headless?: boolean;
  setup?: (context: BrowserContext) => Promise<void>;
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
  const close = async () => {
    const current = context;
    context = undefined;
    if (current) closing = current.close().catch(() => {});
    await closing;
  };
  return {
    close,
    async resolve(address, request) {
      if (
        !safeHttpsUrl(address) ||
        !providers.some((provider) => provider.matches(new URL(address)))
      )
        throw new Error('This URL is not a supported gate.');
      const abort = () => {
        void close();
      };
      request.signal.addEventListener('abort', abort, { once: true });
      let gatePage: Page | undefined;
      let controller: Page | undefined;
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
          try {
            context = await chromium.launchPersistentContext(profile, {
              channel: 'chromium',
              headless: options.headless ?? false,
              acceptDownloads: false,
              ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'],
              args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
              ],
            });
          } catch {
            throw new Error(
              'Could not launch the dedicated Chromium browser. Run gatebreaker --install-browser, and close other CLI commands using this profile. Linux also needs a desktop and Chromium system libraries.',
            );
          }
          const opened = context;
          context.on('close', () => {
            if (context === opened) context = undefined;
          });
          await options.setup?.(context);
        }
        request.signal.throwIfAborted();
        const current = context;
        const worker =
          current
            .serviceWorkers()
            .find((worker) => worker.url().startsWith('chrome-extension://')) ??
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
        // Keep the existing private popup sender boundary. This controller is an
        // inactive extension tab, never a page-facing bridge or localhost server.
        const pending = current.waitForEvent('page', { timeout: 10000 });
        await worker.evaluate(async (id) => {
          await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html'), active: false });
          await chrome.tabs.update(id, { active: true });
        }, tabId);
        controller = await pending;
        await controller.waitForLoadState('domcontentloaded');
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
          'Complete required sign-in or CAPTCHA in the dedicated Gatebreaker browser.',
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
          if (!state.busy && !state.waitingForLogin && state.result)
            return { gate: original, result: state.result };
          if (state.cancelled) throw new Error('The browser check was cancelled.');
          await delay(400, undefined, { signal: request.signal });
        }
      } finally {
        request.signal.removeEventListener('abort', abort);
        await controller?.close().catch(() => {});
        await gatePage?.close().catch(() => {});
        if (request.signal.aborted) await close();
      }
    },
  };
}
