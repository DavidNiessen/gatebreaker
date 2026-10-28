import type { ProviderContext } from '../domain/provider';
import type { PushModel } from './push-session';
import { pushModel } from './push-session';
import { readLimitedText } from './shared/read-text';

/** Public action metadata only. OAuth windows and account credentials are host-owned. */
export async function loadPushActionModel(
  slug: string,
  context: Pick<ProviderContext, 'fetch' | 'signal'>,
): Promise<PushModel> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(slug)) throw new Error('Invalid gate');
  const endpoint = `https://push.fm/api/guest/unlock/${encodeURIComponent(slug)}`;
  const response = await context.fetch(endpoint, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (
    !response.ok ||
    response.redirected ||
    (response.url && response.url !== endpoint) ||
    !response.headers.get('content-type')?.toLowerCase().includes('application/json')
  )
    throw new Error('Metadata unavailable');
  const value: unknown = JSON.parse(await readLimitedText(response, 256 * 1024));
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)['slug'] !== slug ||
    (value as Record<string, unknown>)['isSoftDeleted'] === true
  )
    throw new Error('Wrong gate');
  const model = pushModel(value);
  if (!model) throw new Error('Action unavailable');
  return model;
}
