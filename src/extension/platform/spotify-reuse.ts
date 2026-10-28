import { extension } from './browser';

export const spotifyReuseKey = 'hypedditSpotifyReuse';
const maxAge = 30 * 24 * 60 * 60 * 1000;
/** A nonsecret convenience preference, never an authentication credential. */
export function validSpotifyReuse(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record['version'] === 1 &&
    typeof record['confirmedAt'] === 'number' &&
    Number.isSafeInteger(record['confirmedAt']) &&
    record['confirmedAt'] <= now &&
    now - record['confirmedAt'] <= maxAge
  );
}
export async function canReuseSpotify(): Promise<boolean> {
  try {
    return validSpotifyReuse((await extension.storage.local.get(spotifyReuseKey))[spotifyReuseKey]);
  } catch {
    return false;
  }
}
export async function rememberSpotify(active: () => boolean): Promise<void> {
  if (!active()) return;
  try {
    await extension.storage.local.set({
      [spotifyReuseKey]: { version: 1, confirmedAt: Date.now() },
    });
  } catch {
    /* Storage failure never prevents the approved download. */
  }
}
/** The same exact native Spotify authorization contract used by Hypeddit. */
export function reusableSpotifyAddress(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 16384) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== 'https://accounts.spotify.com' ||
      url.pathname !== '/authorize' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null;
    for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'state'])
      if (url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)?.trim())
        return null;
    if (
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('redirect_uri') !== 'https://hypeddit.com/spotify_callback'
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
