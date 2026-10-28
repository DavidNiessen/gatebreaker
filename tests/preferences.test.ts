import { beforeEach, describe, expect, it, vi } from 'vitest';
import { soundcloudComment } from '../src/core/domain/preferences';
const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  listeners: new Set<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >(),
}));
vi.mock('../src/extension/platform/browser', () => ({
  extension: {
    storage: {
      local: storage,
      onChanged: {
        addListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
        ) => storage.listeners.add(listener),
        removeListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void,
        ) => storage.listeners.delete(listener),
      },
    },
  },
}));
import {
  readPreferences,
  saveSoundcloudComment,
  clearSoundcloudComment,
  preferencesKey,
} from '../src/extension/platform/preferences';
beforeEach(() => {
  storage.get.mockReset();
  storage.set.mockReset();
  storage.remove.mockReset();
  storage.listeners.clear();
  storage.set.mockImplementation(async (value) => {
    for (const listener of storage.listeners)
      listener({ [preferencesKey]: { newValue: value[preferencesKey] } }, 'local');
  });
});
describe('user-configured reusable SoundCloud comment', () => {
  it.each([
    undefined,
    null,
    5,
    {},
    '',
    ' ',
    'x',
    'x'.repeat(1001),
    'bad\u0000text',
    'bad\u007ftext',
  ])('rejects invalid or oversized text %s', (value) =>
    expect(soundcloudComment(value)).toBeNull(),
  );
  it('trims the user text and preserves multiline/unicode text verbatim', () => {
    expect(soundcloudComment('  My own text\nSecond line 🎵  ')).toBe(
      'My own text\nSecond line 🎵',
    );
  });
  it('reads only validated comment data from the dedicated local preference', async () => {
    storage.get.mockResolvedValue({
      [preferencesKey]: { soundcloudComment: '  My text  ', token: 'not-a-preference' },
    });
    expect(await readPreferences()).toEqual({ soundcloudComment: 'My text' });
    expect(storage.get).toHaveBeenCalledWith(preferencesKey);
  });
  it('treats absent/corrupted preferences as unconfigured', async () => {
    storage.get.mockResolvedValue({ [preferencesKey]: { soundcloudComment: 7 } });
    expect(await readPreferences()).toEqual({});
  });
  it('persists only the supplied validated text and supports clearing it', async () => {
    await saveSoundcloudComment(' My text ');
    expect(storage.set).toHaveBeenCalledWith({
      [preferencesKey]: { soundcloudComment: 'My text' },
    });
    await clearSoundcloudComment();
    expect(storage.remove).toHaveBeenCalledWith(preferencesKey);
  });
  it('never writes invalid text and reports storage failures', async () => {
    await expect(saveSoundcloudComment('x')).rejects.toThrow(/2/);
    expect(storage.set).not.toHaveBeenCalled();
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(saveSoundcloudComment('My text')).rejects.toThrow('Storage unavailable');
    expect(storage.listeners.size).toBe(0);
  });
  it('waits for Firefox-style delayed change delivery before continuing and ignores unrelated receipts', async () => {
    storage.set.mockResolvedValue(undefined);
    let finished = false;
    const pending = saveSoundcloudComment('My text').then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1));
    expect(finished).toBe(false);
    for (const listener of storage.listeners)
      listener({ [preferencesKey]: { newValue: { soundcloudComment: 'Other text' } } }, 'local');
    await Promise.resolve();
    expect(finished).toBe(false);
    for (const listener of storage.listeners)
      listener({ [preferencesKey]: { newValue: { soundcloudComment: 'My text' } } }, 'local');
    await pending;
    expect(finished).toBe(true);
    expect(storage.listeners.size).toBe(0);
  });
  it('does not wait for a nonexistent change event when the same text is already saved', async () => {
    storage.get.mockResolvedValue({ [preferencesKey]: { soundcloudComment: 'My text' } });
    await saveSoundcloudComment(' My text ');
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.listeners.size).toBe(0);
  });
});
