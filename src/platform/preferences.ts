import type { GatePreferences } from '../domain/preferences';
import { soundcloudComment } from '../domain/preferences';
import { extension } from './browser';

export const preferencesKey = 'gatebreakerPreferences';

export async function readPreferences(): Promise<GatePreferences> {
  const stored: unknown = (await extension.storage.local.get(preferencesKey))?.[preferencesKey];
  const text =
    stored && typeof stored === 'object' && 'soundcloudComment' in stored
      ? soundcloudComment(stored.soundcloudComment)
      : null;
  return text ? { soundcloudComment: text } : {};
}

export async function saveSoundcloudComment(value: unknown): Promise<void> {
  const text = soundcloudComment(value);
  if (!text) throw new Error('Enter a comment between 2 and 1,000 characters.');
  await extension.storage.local.set({ [preferencesKey]: { soundcloudComment: text } });
}

export async function clearSoundcloudComment(): Promise<void> {
  await extension.storage.local.remove(preferencesKey);
}
