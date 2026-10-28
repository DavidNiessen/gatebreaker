// Modern Chrome and Firefox expose Promise-based MV3 APIs. Firefox's browser
// namespace is selected when present; Chrome uses chrome without a polyfill.
export const extension: typeof chrome =
  (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;

export const DEFAULT_SETTINGS = { enabled: true } as const;

export async function isEnabled(): Promise<boolean> {
  const settings = await extension.storage.local.get(DEFAULT_SETTINGS);
  return settings['enabled'] !== false;
}
