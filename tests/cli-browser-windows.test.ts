import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Page, Worker } from 'playwright';
import { browserWindows, isAccountWindow } from '../src/cli/browser-windows';

function fixture() {
  const page = (url: string) => ({ isClosed: () => false, url: () => url }) as Page;
  const gate = page('https://hypeddit.com/fixture/song');
  const control = page('chrome-extension://authored/popup.html');
  const spotify = page('https://accounts.spotify.com/authorize');
  const unrelated = page('https://advertising.example/');
  let currentState = 'normal';
  const send = vi.fn(async (method: string, params?: { bounds?: { windowState: string } }) => {
    if (method === 'Browser.setWindowBounds') currentState = params!.bounds!.windowState;
    return { windowId: 41, bounds: { windowState: currentState } };
  });
  const detach = vi.fn().mockResolvedValue(undefined);
  const context = {
    pages: () => [gate, control, spotify, unrelated],
    newCDPSession: vi.fn().mockResolvedValue({ send, detach }),
  } as unknown as BrowserContext;
  const evaluate = vi.fn().mockResolvedValue(42);
  const worker = { evaluate } as unknown as Worker;
  return { gate, control, spotify, unrelated, send, detach, context, worker, evaluate };
}

describe('CLI-owned verification windows', () => {
  it.each([
    'https://accounts.spotify.com/authorize',
    'https://secure.soundcloud.com/authorize',
    'https://mixcloud.com/oauth/authorize',
    'https://connect.deezer.com/oauth/auth.php',
  ])('recognizes the existing native account origin %s', (address) =>
    expect(isAccountWindow(address)).toBe(true),
  );
  it.each([
    'http://accounts.spotify.com/authorize',
    'https://accounts.spotify.com.evil.invalid/',
    'https://name:secret@secure.soundcloud.com/',
    'https://secure.soundcloud.com:8443/',
    'https://hypeddit.com/spotify_callback',
    'chrome-extension://authored/popup.html',
    'not a url',
  ])('does not promote an unrelated or malformed window %s', (address) =>
    expect(isAccountWindow(address)).toBe(false),
  );
  it('does not perform headed window operations during headless processing', async () => {
    const f = fixture(),
      windows = browserWindows(f.context, false);
    await windows.minimize(f.gate);
    await windows.showAccounts(f.gate, f.control);
    expect(f.context.newCDPSession).not.toHaveBeenCalled();
  });
  it('minimizes only a page belonging to the owned context', async () => {
    const f = fixture(),
      windows = browserWindows(f.context, true);
    await windows.minimize(f.gate);
    expect(f.send).toHaveBeenCalledWith('Browser.setWindowBounds', {
      windowId: 41,
      bounds: { windowState: 'minimized' },
    });
    await expect(windows.minimize({ isClosed: () => false } as Page)).rejects.toThrow(
      'does not belong',
    );
    expect(f.detach).toHaveBeenCalledTimes(1);
  });
  it('stops when the desktop cannot minimize the owned window', async () => {
    const f = fixture();
    f.send.mockResolvedValue({ windowId: 41, bounds: { windowState: 'normal' } });
    vi.useFakeTimers();
    try {
      const rejected = expect(browserWindows(f.context, true).minimize(f.gate)).rejects.toThrow(
        'desktop window manager',
      );
      await vi.runAllTimersAsync();
      await rejected;
      expect(f.detach).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('promotes only account pages once and leaves gate, controller and unrelated pages alone', async () => {
    const f = fixture(),
      windows = browserWindows(f.context, true);
    await windows.showAccounts(f.gate, f.control);
    await windows.showAccounts(f.gate, f.control);
    expect(f.context.newCDPSession).toHaveBeenCalledTimes(1);
    expect(f.context.newCDPSession).toHaveBeenCalledWith(f.spotify);
  });
  it('opens one verification popup and does not repeatedly steal window focus', async () => {
    const f = fixture(),
      windows = browserWindows(f.context, true);
    await windows.showVerification(f.worker, 17, f.control);
    await windows.showVerification(f.worker, 17, f.control);
    expect(f.evaluate).toHaveBeenCalledTimes(1);
    expect(
      f.send.mock.calls.filter(([method]) => method === 'Browser.setWindowBounds'),
    ).toHaveLength(1);
    await windows.hideVerification(f.control);
    await windows.hideVerification(f.control);
    expect(
      f.send.mock.calls.filter(([method]) => method === 'Browser.setWindowBounds'),
    ).toHaveLength(2);
    await windows.showVerification(f.worker, 17, f.control);
    expect(f.evaluate).toHaveBeenCalledTimes(1);
  });
});
