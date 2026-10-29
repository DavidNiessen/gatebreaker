import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  tabs: new Map<number, chrome.tabs.Tab>(),
  removed: [] as Array<(id: number) => void>,
  updated: [] as Array<(id: number, change: { url?: string; status?: string }) => void>,
  get: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  inject: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('../src/extension/platform/browser', () => ({
  isEnabled: api.enabled,
  extension: {
    runtime: { id: 'authored-extension' },
    tabs: {
      get: api.get,
      remove: api.remove,
      update: api.update,
      onRemoved: { addListener: (f: (id: number) => void) => api.removed.push(f) },
      onUpdated: {
        addListener: (f: (id: number, change: { url?: string; status?: string }) => void) =>
          api.updated.push(f),
      },
    },
    windows: { create: api.create },
    scripting: { executeScript: api.inject },
  },
}));
import { downloadgaterAuthMessage as handle } from '../src/extension/providers/downloadgater/auth-job';
import {
  authOpen,
  authHeartbeat,
  authCancel,
} from '../src/extension/providers/downloadgater/auth-protocol';
const gate = 'authored-gate-12345',
  page = `https://downloadgater.com/g/${gate}`;
const receipt = 'authored-opaque-native-gate-receipt-123456789';
const source = {
  id: 'authored-extension',
  frameId: 0,
  tab: { id: 1 },
  url: page,
  documentId: 'authored-document',
} as chrome.runtime.MessageSender;
function tab(id: number, url: string, windowId = 4): chrome.tabs.Tab {
  return { id, url, windowId } as chrome.tabs.Tab;
}
function address(driver = 'spotify') {
  return `https://${driver === 'spotify' ? 'accounts.spotify.com' : 'secure.soundcloud.com'}/authorize?${new URLSearchParams({ client_id: 'authored-client', response_type: 'code', state: 'authored-state', redirect_uri: `https://downloadgater.com/api/${driver}/callback` })}`;
}
function message(
  type = authOpen,
  extra: Record<string, unknown> = {},
  sender = source,
): Promise<unknown> {
  return new Promise((resolve) => {
    let sent = false;
    const keep = handle(
      {
        type,
        operation: 'authored-operation',
        driver: 'spotify',
        gateId: gate,
        address: address(),
        ...extra,
      },
      sender,
      (v) => {
        sent = true;
        resolve(v);
      },
    );
    if (!keep && !sent) resolve(undefined);
  });
}
beforeEach(() => {
  api.tabs.clear();
  api.tabs.set(1, tab(1, page));
  api.enabled.mockResolvedValue(true);
  api.get.mockImplementation(async (id: number) => {
    const value = api.tabs.get(id);
    if (!value) throw new Error('Missing authored tab');
    return value;
  });
  api.remove.mockImplementation(async (id: number) => {
    api.tabs.delete(id);
    api.removed.forEach((f) => f(id));
  });
  api.update.mockImplementation(async (id: number, change: { url: string }) => {
    const value = { ...api.tabs.get(id)!, url: change.url };
    api.tabs.set(id, value);
    return value;
  });
  api.create.mockImplementation(async () => {
    const child = tab(2, 'about:blank', 8);
    api.tabs.set(2, child);
    return { id: 8, tabs: [child] };
  });
  api.inject.mockResolvedValue([{ frameId: 0, result: receipt }]);
});
afterEach(() => {
  api.removed.forEach((f) => f(1));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('DownloadGater narrowly owned authorization job', () => {
  it('ignores unrelated protocol and rejects nonextension, subframe, wrong gate and forged authorization', async () => {
    expect(handle({ type: 'unrelated' }, source, vi.fn())).toBeUndefined();
    for (const sender of [
      { ...source, id: 'other' },
      { ...source, frameId: 1 },
      { ...source, url: 'https://downloadgater.com.evil.test/g/x' },
      { ...source, url: 'https://downloadgater.com/g/other-gate' },
    ])
      expect(await message(authOpen, {}, sender)).toBeUndefined();
    expect(
      await message(authOpen, { address: address().replace('accounts.spotify.com', 'evil.test') }),
    ).toBeUndefined();
    expect(api.create).not.toHaveBeenCalled();
  });
  it('tracks an exact owned tab across COOP and returns only its native gate receipt after callback', async () => {
    expect(await message()).toEqual({ opened: true });
    expect(api.create).toHaveBeenCalledWith({
      url: 'about:blank',
      type: 'popup',
      width: 620,
      height: 720,
      focused: true,
    });
    expect(api.update).toHaveBeenCalledWith(2, { url: address() });
    expect(await message(authHeartbeat)).toEqual({ active: true });
    expect(api.inject).not.toHaveBeenCalled();
    api.tabs.set(2, tab(2, page + '?spotify_unlock=authored', 8));
    expect(await message(authHeartbeat)).toEqual({ active: true, receipt });
    expect(api.inject).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 2, frameIds: [0] },
        args: ['spotify', gate, expect.any(Number)],
      }),
    );
    expect(api.remove).toHaveBeenCalledWith(2);
    expect(api.remove).not.toHaveBeenCalledWith(1);
  });
  it('does not inspect account origins, unrelated gate returns, tabs or altered ownership', async () => {
    await message();
    api.tabs.set(3, tab(3, page, 8));
    api.updated.forEach((f) => f(3, { status: 'complete' }));
    api.tabs.set(2, tab(2, 'https://downloadgater.com/g/unrelated-gate', 8));
    expect(await message(authHeartbeat)).toEqual({ active: true });
    expect(api.inject).not.toHaveBeenCalled();
    expect(await message(authHeartbeat, {}, { ...source, documentId: 'new-document' })).toEqual({
      active: false,
    });
    expect(
      await message(authHeartbeat, {}, { ...source, tab: { id: 3 } as chrome.tabs.Tab }),
    ).toEqual({ active: false });
    api.tabs.set(2, tab(2, page, 9));
    expect(await message(authHeartbeat)).toEqual({ active: false });
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('rejects receipt when owned callback navigates away while extraction is pending', async () => {
    await message();
    api.tabs.set(2, tab(2, page, 8));
    api.inject.mockImplementationOnce(async () => {
      api.tabs.set(2, tab(2, 'https://downloadgater.com/g/other-gate', 8));
      return [{ frameId: 0, result: receipt }];
    });
    expect(await message(authHeartbeat)).toEqual({ active: true });
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('cancels jobs on exact parent navigation and closes only its own child', async () => {
    await message();
    api.updated.forEach((f) => f(1, { status: 'loading' }));
    expect(await message(authHeartbeat)).toEqual({ active: false });
    await vi.waitFor(() => expect(api.remove).toHaveBeenCalledWith(2));
  });
  it('expires missing heartbeat leases and rejects late callbacks', async () => {
    vi.useFakeTimers();
    await message();
    await vi.advanceTimersByTimeAsync(10001);
    api.tabs.set(2, tab(2, page, 8));
    expect(await message(authHeartbeat)).toEqual({ active: false });
    expect(api.inject).not.toHaveBeenCalled();
  });
  it('validates only the documented scoped native receipt, its timestamp and bounded shape', async () => {
    await message();
    api.tabs.set(2, tab(2, page, 8));
    let extracted: ((driver: string, gate: string, started: number) => string | null) | undefined;
    api.inject.mockImplementationOnce(async (options) => {
      extracted = options.func;
      return [];
    });
    await message(authHeartbeat);
    expect(extracted).toBeTypeOf('function');
    const values = new Map<string, string>();
    vi.stubGlobal('location', new URL(page));
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null });
    const read = () => extracted!('spotify', gate, Date.now());
    values.set(
      `downloadgater.spotifyUnlock.${gate}`,
      JSON.stringify({ token: receipt, createdAt: Date.now() }),
    );
    expect(read()).toBe(receipt);
    values.set(
      `downloadgater.spotifyUnlock.${gate}`,
      JSON.stringify({ token: receipt, createdAt: Date.now() - 60000 }),
    );
    expect(read()).toBeNull();
    vi.stubGlobal('location', new URL('https://accounts.spotify.com/authorize'));
    expect(read()).toBeNull();
  });
  it('cancellation and disabled extension cannot release or recreate stale jobs', async () => {
    await message();
    expect(await message(authCancel)).toEqual({ cancelled: true });
    expect(await message(authHeartbeat)).toEqual({ active: false });
    api.enabled.mockResolvedValue(false);
    expect(await message()).toEqual({ opened: false });
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});
