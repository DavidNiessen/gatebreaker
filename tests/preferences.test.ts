import { beforeEach, describe, expect, it, vi } from 'vitest';
import { soundcloudComment } from '../src/domain/preferences';
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('../src/platform/browser', () => ({ extension: { storage: { local: storage } } }));
import {
  readPreferences,
  saveSoundcloudComment,
  clearSoundcloudComment,
  preferencesKey,
} from '../src/platform/preferences';
beforeEach(() => {
  storage.get.mockReset();
  storage.set.mockReset();
  storage.remove.mockReset();
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
  });
});
