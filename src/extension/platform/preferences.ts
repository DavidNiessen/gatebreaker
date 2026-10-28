import type { GatePreferences } from '../../core/domain/preferences';
import { soundcloudComment } from '../../core/domain/preferences';
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
  if ((await readPreferences()).soundcloudComment === text) return;
  let acknowledge!: () => void;
  let timeout: ReturnType<typeof setTimeout>;
  const receipt = new Promise<void>((resolve, reject) => {
    acknowledge = resolve;
    timeout = setTimeout(
      () =>
        reject(
          new Error(
            'Your comment was saved, but this page could not confirm the change. Reload the gate, then choose Download.',
          ),
        ),
      5000,
    );
  });
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const current: unknown = changes[preferencesKey]?.newValue;
    if (
      area === 'local' &&
      current &&
      typeof current === 'object' &&
      'soundcloudComment' in current &&
      current.soundcloudComment === text
    )
      acknowledge();
  };
  // Firefox can resolve set() before delivering onChanged. The page's earlier
  // listener must cancel stale work before Save and continue starts a new run.
  extension.storage.onChanged.addListener(changed);
  try {
    await Promise.all([
      extension.storage.local.set({ [preferencesKey]: { soundcloudComment: text } }),
      receipt,
    ]);
  } finally {
    clearTimeout(timeout!);
    extension.storage.onChanged.removeListener(changed);
  }
}

export async function clearSoundcloudComment(): Promise<void> {
  await extension.storage.local.remove(preferencesKey);
}
