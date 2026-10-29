import {
  bandcampGrantUrl,
  bandcampProductUrl,
  bandcampStatUrl,
} from '../../core/providers/bandcamp';
import { readLimitedText } from '../../core/providers/shared/read-text';
import { extension, isEnabled } from '../platform/browser';

export const bandcampReadType = 'gatebreaker:bandcamp-read';
export interface BandcampReadReply {
  status: number;
  type: string;
  text: string;
}

/** Fixed metadata endpoints only. Never an arbitrary URL proxy or credential bridge. */
export function bandcampReadMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
): boolean | undefined {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== bandcampReadType)
    return undefined;
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    typeof sender.tab?.id !== 'number' ||
    !sender.url ||
    !('url' in value) ||
    typeof value.url !== 'string'
  )
    return false;
  try {
    const source = new URL(sender.url);
    if (!bandcampProductUrl(source) && !bandcampGrantUrl(source.href)) return false;
  } catch {
    return false;
  }
  const grant = bandcampGrantUrl(value.url),
    stat = bandcampStatUrl(value.url);
  const address = grant ?? stat;
  if (!address) return false;
  void (async (): Promise<BandcampReadReply | null> => {
    if (!(await isEnabled())) return null;
    const response = await fetch(address.href, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: grant ? 'text/html' : 'application/json, text/javascript, */*; q=0.01' },
    });
    const type = response.headers.get('content-type') ?? '';
    const allowed = grant
      ? /^text\/html(?:;|$)/i.test(type)
      : /^(?:application\/(?:json|javascript)|text\/javascript)(?:;|$)/i.test(type);
    if (
      response.redirected ||
      (response.url && response.url !== address.href) ||
      (response.ok && !allowed)
    ) {
      await response.body?.cancel();
      return null;
    }
    const text = response.ok
      ? await readLimitedText(response, grant ? 2 * 1024 * 1024 : 64 * 1024)
      : '';
    if (!response.ok) await response.body?.cancel();
    return { status: response.status, type: type.slice(0, 200), text };
  })()
    .then(respond)
    .catch(() => respond(null));
  return true;
}

export async function readBandcampMetadata(url: string, signal?: AbortSignal): Promise<Response> {
  if (!bandcampGrantUrl(url) && !bandcampStatUrl(url))
    throw new Error('Unsupported Bandcamp metadata endpoint');
  signal?.throwIfAborted();
  const request = extension.runtime.sendMessage({
    type: bandcampReadType,
    url,
  }) as Promise<unknown>;
  let abort: (() => void) | undefined;
  const value = await (signal
    ? Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(new DOMException('Bandcamp check cancelled', 'AbortError'));
          signal.addEventListener('abort', abort, { once: true });
        }),
      ]).finally(() => {
        if (abort) signal.removeEventListener('abort', abort);
      })
    : request);
  signal?.throwIfAborted();
  if (
    !value ||
    typeof value !== 'object' ||
    !('status' in value) ||
    typeof value.status !== 'number' ||
    !Number.isInteger(value.status) ||
    value.status < 200 ||
    value.status > 599 ||
    !('type' in value) ||
    typeof value.type !== 'string' ||
    value.type.length > 200 ||
    !('text' in value) ||
    typeof value.text !== 'string' ||
    value.text.length > (bandcampGrantUrl(url) ? 2 * 1024 * 1024 : 64 * 1024)
  )
    throw new Error('Bandcamp metadata request failed');
  return new Response([204, 205, 304].includes(value.status) ? null : value.text, {
    status: value.status,
    headers: { 'content-type': value.type },
  });
}
