import type { ProviderContext } from '../../domain/provider';
import { safeDestination } from './urls';

/** One native HTTP transport contract, shared by direct and post-auth verification. */
export function requestHypedditDownload(
  context: Pick<ProviderContext, 'pageUrl' | 'fetch' | 'signal'>,
  csrf: string,
  body: URLSearchParams,
  acceptJson = false,
): Promise<Response> {
  return context.fetch(new URL('/gate/download/ul', context.pageUrl).href, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    headers: {
      ...(acceptJson ? { Accept: 'application/json' } : {}),
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrf,
    },
    body,
  });
}

export type NativeHypedditReply =
  | { readonly kind: 'ready'; readonly url: string }
  | { readonly kind: 'invalid' | 'unsafe' | 'refused' };

/** Callback ownership belongs to the host; only this server reply releases a file. */
export function parseNativeHypedditReply(value: unknown, pageUrl: URL): NativeHypedditReply {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>)['download_status'] !== 'boolean'
  )
    return { kind: 'invalid' };
  const record = value as Record<string, unknown>;
  if (record['download_status'] !== true) return { kind: 'refused' };
  const destination = safeDestination(record['URL'], pageUrl);
  if (destination) return { kind: 'ready', url: destination };
  return {
    kind: typeof record['URL'] === 'string' && record['URL'].trim() ? 'unsafe' : 'refused',
  };
}
