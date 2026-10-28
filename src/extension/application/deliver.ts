import type { Resolution } from '../../core/domain/provider';
import { safeHttpsUrl } from '../../core/domain/urls';

export interface DeliveryTarget {
  readonly url: string;
  readonly kind: 'file' | 'page';
}
export interface DeliveryState {
  readonly state: 'started' | 'failed';
  readonly files: number;
  readonly message: string;
}

/** Validate the whole released set before handing anything to a browser API. */
export function deliveryTargets(result: Resolution): readonly DeliveryTarget[] | null {
  if (
    !result?.ok ||
    (result.kind !== undefined && result.kind !== 'file' && result.kind !== 'page')
  )
    return null;
  const file =
    result.kind === 'file' ||
    (result.kind === undefined &&
      ['public-file', 'skip-request', 'website-session'].includes(result.method));
  const values = result.destinations ?? [{ url: result.url }];
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > 20 ||
    (values.length > 1 && !file)
  )
    return null;
  const targets: DeliveryTarget[] = [];
  for (const value of values) {
    const url =
      typeof value?.url === 'string' && value.url.length <= 16384 ? safeHttpsUrl(value.url) : null;
    if (!url || targets.some((target) => target.url === url)) return null;
    targets.push({ url, kind: file ? 'file' : 'page' });
  }
  return targets[0]?.url === safeHttpsUrl(result.url) ? targets : null;
}

export async function deliver(
  targets: readonly DeliveryTarget[],
  startFile: (url: string) => Promise<unknown>,
  openPage: (url: string) => Promise<unknown>,
  active: () => boolean | Promise<boolean>,
): Promise<DeliveryState> {
  let files = 0;
  try {
    for (const target of targets) {
      if (!(await active())) throw Error('Cancelled');
      if (target.kind === 'file') {
        await startFile(target.url);
        files++;
      } else await openPage(target.url);
    }
    return {
      state: 'started',
      files,
      message: files
        ? files === 1
          ? 'Download started.'
          : 'All ' + files + ' downloads started.'
        : 'The destination opened in a new tab.',
    };
  } catch {
    return {
      state: 'failed',
      files,
      message: files
        ? 'Some downloads could not start. Use the file links below for the remaining files.'
        : 'The browser could not start the download. Use the link below to try again.',
    };
  }
}
