import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContext, Page, Worker } from 'playwright';
import { concealWindowsBackground } from './windows-background';

const accountHosts = new Set([
  'accounts.spotify.com',
  'secure.soundcloud.com',
  'soundcloud.com',
  'www.soundcloud.com',
  'connect.soundcloud.com',
  'mixcloud.com',
  'www.mixcloud.com',
  'connect.deezer.com',
  'www.deezer.com',
  'deezer.com',
]);

export function isAccountWindow(address: string): boolean {
  try {
    const url = new URL(address);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      accountHosts.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Window operations are scoped to pages of this CLI-owned browser context. */
export function browserWindows(
  context: BrowserContext,
  headed: boolean,
  conceal = process.platform === 'win32',
) {
  const shown = new WeakSet<Page>();
  let verification: number | undefined;
  let verificationVisible = false;
  async function state(page: Page, windowState: 'normal' | 'minimized'): Promise<void> {
    if (!headed || page.isClosed()) return;
    if (!context.pages().includes(page)) throw new Error('This window does not belong to the CLI.');
    const session = await context.newCDPSession(page);
    try {
      const { windowId } = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
      for (let attempt = 0; attempt < 20; attempt++) {
        const { bounds } = await session.send('Browser.getWindowBounds', { windowId });
        if (bounds.windowState === windowState) return;
        await delay(50);
      }
      throw new Error(
        'Could not set the CLI window state. Interactive verification needs a desktop window manager.',
      );
    } finally {
      await session.detach();
    }
  }
  return {
    async minimize(page: Page) {
      if (headed && conceal && !page.isClosed()) await concealWindowsBackground(context, page);
      else await state(page, 'minimized');
    },
    async showAccounts(gate: Page, control: Page): Promise<void> {
      for (const page of context.pages()) {
        if (page === gate || page === control || shown.has(page) || !isAccountWindow(page.url()))
          continue;
        try {
          await state(page, 'normal');
        } catch (error) {
          if (!page.isClosed()) throw error;
        }
        shown.add(page);
      }
    },
    async showVerification(worker: Worker, tab: number, control: Page): Promise<void> {
      if (verification === undefined) {
        verification = await worker.evaluate(async (id) => {
          const window = await chrome.windows.create({
            tabId: id,
            type: 'popup',
            width: 520,
            height: 780,
            focused: true,
          });
          if (window?.id === undefined) throw new Error('Could not open verification window.');
          return window.id;
        }, tab);
      }
      if (!verificationVisible) {
        await state(control, 'normal');
        verificationVisible = true;
      }
    },
    async hideVerification(control: Page): Promise<void> {
      if (verificationVisible) {
        await state(control, 'minimized');
        verificationVisible = false;
      }
    },
  };
}
