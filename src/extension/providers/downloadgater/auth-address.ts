import type { Driver } from '../../../core/providers/downloadgater';
import { origin } from '../../../core/providers/downloadgater';
/** Accept only a provider-returned first-party consent URL with its owned callback. */
export function authorizationUrl(value: unknown, driver: Driver): string | null {
  if (typeof value !== 'string' || value.length > 16384) return null;
  try {
    const url = new URL(value);
    const allowed =
      driver === 'soundcloud'
        ? url.origin === 'https://secure.soundcloud.com' && url.pathname === '/authorize'
        : url.origin === 'https://accounts.spotify.com' && url.pathname === '/authorize';
    if (!allowed || url.username || url.password || url.port || url.hash) return null;
    for (const key of ['client_id', 'redirect_uri', 'state', 'response_type'])
      if (url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)) return null;
    if (url.searchParams.get('response_type') !== 'code') return null;
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    if (
      callback.origin !== origin ||
      callback.pathname !== `/api/${driver}/callback` ||
      callback.search ||
      callback.hash ||
      callback.username ||
      callback.password ||
      callback.port
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
