import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bandcampReadMessage,
  bandcampReadType,
  readBandcampMetadata,
} from '../src/extension/providers/bandcamp-transport';
const hooks = vi.hoisted(() => ({ sendMessage: vi.fn(), enabled: vi.fn(async () => true) }));
vi.mock('../src/extension/platform/browser', () => ({
  extension: { runtime: { id: 'authored-extension', sendMessage: hooks.sendMessage } },
  isEnabled: hooks.enabled,
}));
const grant =
  'https://bandcamp.com/download?fsig=' + 'a'.repeat(32) + '&id=123&ts=12345.0&type=album';
const stat =
  'https://popplers5.bandcamp.com/statdownload/album?enc=flac&fsig=' +
  'a'.repeat(32) +
  '&id=123&ts=12345.0&.rand=42&.vrs=1';
const sender: chrome.runtime.MessageSender = {
  id: 'authored-extension',
  frameId: 0,
  tab: { id: 12 } as chrome.tabs.Tab,
  url: 'https://artist.bandcamp.com/album/release',
};
beforeEach(() => {
  hooks.sendMessage.mockReset();
  hooks.enabled.mockReset().mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<div>metadata only</div>', { headers: { 'content-type': 'text/html' } }),
      ),
  );
});
afterEach(() => vi.unstubAllGlobals());
function request(url: string, source = sender): Promise<unknown> {
  return new Promise((resolve) => {
    const accepted = bandcampReadMessage({ type: bandcampReadType, url }, source, resolve);
    if (accepted !== true) resolve('rejected');
  });
}
describe('private Bandcamp metadata transport', () => {
  it('allows only the same-extension top-frame supported gate sender', async () => {
    for (const source of [
      { ...sender, id: 'other' },
      { ...sender, frameId: 2 },
      { ...sender, url: 'https://evil.test/album/a' },
      { ...sender, url: 'https://artist.bandcamp.com/admin' },
      { ...sender, tab: undefined },
    ])
      expect(await request(grant, source as chrome.runtime.MessageSender)).toBe('rejected');
    expect(fetch).not.toHaveBeenCalled();
    expect(bandcampReadMessage({ type: 'unrelated' }, sender, vi.fn())).toBeUndefined();
  });
  it.each([
    'https://evil.test/',
    'http://bandcamp.com/download?fsig=x',
    'https://popplers5.bandcamp.com/download/album?enc=flac',
    'https://artist.bandcamp.com/api/account',
    grant + '&redirect=https://evil.test',
    stat + '&callback=evil',
  ])('rejects arbitrary proxy request %s', async (url) => {
    expect(await request(url)).toBe('rejected');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fetches only bounded grant HTML without cookies or redirects', async () => {
    expect(await request(grant)).toEqual({
      status: 200,
      type: 'text/html',
      text: '<div>metadata only</div>',
    });
    expect(fetch).toHaveBeenCalledWith(
      grant,
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }),
    );
  });
  it('refuses wrong content types and oversized bodies', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('audio', { headers: { 'content-type': 'audio/wav' } }),
    );
    expect(await request(grant)).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('x', {
        headers: { 'content-type': 'application/json', 'content-length': '999999' },
      }),
    );
    expect(await request(stat)).toBeNull();
  });
  it('does not fetch when disabled', async () => {
    hooks.enabled.mockResolvedValueOnce(false);
    expect(await request(grant)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reconstructs only a validated metadata reply', async () => {
    hooks.sendMessage.mockResolvedValueOnce({
      status: 200,
      type: 'application/json',
      text: '{"result":"ok"}',
    });
    expect(await (await readBandcampMetadata(stat)).json()).toEqual({ result: 'ok' });
    expect(hooks.sendMessage).toHaveBeenCalledWith({ type: bandcampReadType, url: stat });
    hooks.sendMessage.mockResolvedValueOnce({
      status: 200,
      type: 'text/html',
      text: 'x'.repeat(2 * 1024 * 1024 + 1),
    });
    await expect(readBandcampMetadata(grant)).rejects.toThrow();
  });
  it('cancels the caller without using a late reply', async () => {
    hooks.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = readBandcampMetadata(stat, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
  });
});
