import type { Gate, GateProvider, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';

type ItemType = 'album' | 'track';
interface Item {
  id: string;
  type: ItemType;
  title: string;
}
interface Session {
  document: Document;
  page: string;
  item: Item;
  free: boolean;
  grant?: string;
}
const gates = new WeakMap<Gate, Session>();
const formats = ['flac', 'wav', 'aiff-lossless', 'alac', 'mp3-320', 'mp3-v0', 'aac-hi', 'vorbis'];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): string | null =>
  ((typeof value === 'number' && Number.isSafeInteger(value)) || typeof value === 'string') &&
  /^[1-9]\d{0,15}$/.test(String(value))
    ? String(value)
    : null;
const reserved = new Set([
  'www',
  'daily',
  'discover',
  'help',
  'blog',
  'get',
  'artists',
  'fans',
  'support',
]);

export function bandcampProductUrl(url: URL): boolean {
  const label = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bandcamp\.com$/.exec(url.hostname)?.[1];
  return (
    !!label &&
    !reserved.has(label) &&
    !/^popplers\d+$/.test(label) &&
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    /^\/(?:album|track)\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}\/?$/.test(url.pathname)
  );
}
function signedParameters(url: URL, kind: 'grant' | 'file' | 'stat'): boolean {
  const allowed =
    kind === 'grant'
      ? ['fsig', 'id', 'ts', 'type']
      : kind === 'stat'
        ? ['enc', 'fsig', 'id', 'ts', '.rand', '.vrs']
        : ['enc', 'fsig', 'id', 'ts'];
  let valid = true;
  url.searchParams.forEach((_value, key) => {
    if (!allowed.includes(key)) valid = false;
  });
  if (!valid || allowed.some((key) => url.searchParams.getAll(key).length !== 1)) return false;
  if (
    !id(url.searchParams.get('id')) ||
    !/^[a-f0-9]{32,128}$/.test(url.searchParams.get('fsig') ?? '') ||
    !/^\d{1,16}(?:\.\d{1,20})?$/.test(url.searchParams.get('ts') ?? '')
  )
    return false;
  if (kind === 'grant') return ['album', 'track'].includes(url.searchParams.get('type') ?? '');
  if (!formats.includes(url.searchParams.get('enc') ?? '')) return false;
  return (
    kind !== 'stat' ||
    (/^\d{1,16}$/.test(url.searchParams.get('.rand') ?? '') &&
      Number.isSafeInteger(Number(url.searchParams.get('.rand'))) &&
      url.searchParams.get('.vrs') === '1')
  );
}
export function bandcampGrantUrl(input: unknown): URL | null {
  const safe = safeHttpsUrl(input);
  if (!safe || safe.length > 16384) return null;
  const url = new URL(safe);
  return url.origin === 'https://bandcamp.com' &&
    url.pathname === '/download' &&
    !url.hash &&
    signedParameters(url, 'grant')
    ? url
    : null;
}
export function bandcampStatUrl(input: unknown): URL | null {
  const safe = safeHttpsUrl(input);
  if (!safe || safe.length > 16384) return null;
  const url = new URL(safe);
  return /^popplers[1-9]\d{0,2}\.bandcamp\.com$/.test(url.hostname) &&
    /^\/statdownload\/(album|track)$/.test(url.pathname) &&
    !url.hash &&
    signedParameters(url, 'stat')
    ? url
    : null;
}
function fileUrl(input: unknown, item: Item, encoding: string): URL | null {
  if (typeof input !== 'string') return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  // The shipped HTTPS client upgrades its issued popplers URL before statting it.
  if (url.protocol === 'http:' && /^popplers[1-9]\d{0,2}\.bandcamp\.com$/.test(url.hostname))
    url.protocol = 'https:';
  if (
    !safeHttpsUrl(url.href) ||
    url.hash ||
    url.href.length > 16384 ||
    !/^popplers[1-9]\d{0,2}\.bandcamp\.com$/.test(url.hostname) ||
    url.pathname !== `/download/${item.type}` ||
    !signedParameters(url, 'file') ||
    url.searchParams.get('id') !== item.id ||
    url.searchParams.get('enc') !== encoding
  )
    return null;
  return url;
}
function blob(document: Document): Record<string, unknown> | null {
  const elements = document.querySelectorAll('[data-blob]');
  if (elements.length !== 1) return null;
  const text = elements[0]!.getAttribute('data-blob');
  if (!text || text.length > 2 * 1024 * 1024) return null;
  try {
    const value: unknown = JSON.parse(text);
    return object(value) ? value : null;
  } catch {
    return null;
  }
}
function receipt(document: Document, item: Item): { file: URL; encoding: string } | null {
  const value = blob(document);
  if (!value || !Array.isArray(value['download_items']) || value['download_items'].length > 100)
    return null;
  const matches = value['download_items'].filter(
    (entry) => object(entry) && id(entry['item_id']) === item.id && entry['type'] === item.type,
  );
  if (matches.length !== 1 || !object(matches[0])) return null;
  const entry = matches[0];
  if (
    (entry['is_pure_free'] !== true && entry['paid_for'] !== true) ||
    entry['killed'] === true ||
    entry['band_enabled'] === false ||
    entry['is_preorder'] === true ||
    !object(entry['downloads'])
  )
    return null;
  for (const encoding of formats) {
    const value = entry['downloads'][encoding];
    if (!object(value)) continue;
    const file = fileUrl(value['url'], item, encoding);
    if (file) return { file, encoding };
  }
  return null;
}
export function inspect(document: Document, url: URL): Gate | null {
  let session: Session | undefined;
  const grant = bandcampGrantUrl(url.href);
  if (grant) {
    const value = blob(document);
    if (!value || !Array.isArray(value['download_items'])) return null;
    const entries = value['download_items'].filter(
      (entry) =>
        object(entry) &&
        id(entry['item_id']) === grant.searchParams.get('id') &&
        entry['type'] === grant.searchParams.get('type'),
    );
    if (entries.length !== 1 || !object(entries[0]) || typeof entries[0]['title'] !== 'string')
      return null;
    const item: Item = {
      id: grant.searchParams.get('id')!,
      type: grant.searchParams.get('type') as ItemType,
      title: entries[0]['title'].trim().slice(0, 200),
    };
    if (!item.title || !receipt(document, item)) return null;
    session = { document, page: url.href, item, free: true };
  } else {
    if (!bandcampProductUrl(url)) return null;
    const elements = document.querySelectorAll('[data-tralbum]');
    if (elements.length !== 1) return null;
    const text = elements[0]!.getAttribute('data-tralbum');
    if (!text || text.length > 2 * 1024 * 1024) return null;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
    if (!object(value) || !object(value['current'])) return null;
    const current = value['current'],
      itemId = id(current['id']);
    const type = url.pathname.startsWith('/album/') ? 'album' : 'track';
    if (
      !itemId ||
      id(value['id']) !== itemId ||
      current['type'] !== type ||
      value['item_type'] !== type ||
      typeof current['title'] !== 'string' ||
      !current['title'].trim() ||
      current['title'].length > 2000
    )
      return null;
    if (typeof value['url'] === 'string') {
      try {
        const canonical = new URL(value['url'], url);
        if (
          canonical.origin !== url.origin ||
          canonical.pathname.replace(/\/$/, '') !== url.pathname.replace(/\/$/, '')
        )
          return null;
      } catch {
        return null;
      }
    }
    const allowed =
      current['download_pref'] === 1 &&
      !current['private'] &&
      !current['killed'] &&
      !value['tralbum_subscriber_only'] &&
      !value['is_preorder'] &&
      !value['album_is_preorder'];
    const issued = bandcampGrantUrl(value['freeDownloadPage']);
    const matching =
      issued &&
      issued.searchParams.get('id') === itemId &&
      issued.searchParams.get('type') === type;
    session = {
      document,
      page: url.href,
      item: { id: itemId, type, title: current['title'].trim().slice(0, 200) },
      free: allowed && !!matching,
      ...(matching ? { grant: issued.href } : {}),
    };
  }
  const gate: Gate = {
    provider: 'bandcamp',
    id: session.item.id,
    title: session.item.title,
    steps: [],
    metadata: {},
  };
  gates.set(gate, session);
  return gate;
}
export function parseBandcampStat(text: string): Record<string, unknown> | null {
  if (text.length > 64 * 1024) return null;
  let source = text;
  if (!/^\s*\{/.test(source)) {
    const wrapper =
      /^\s*if\s*\(\s*window\.Downloads\s*\)\s*\{\s*Downloads\.statResult\s*\(([\s\S]*)\)\s*\}\s*;?\s*$/.exec(
        source,
      );
    if (!wrapper) return null;
    source = wrapper[1]!;
  }
  try {
    const value: unknown = JSON.parse(source);
    return object(value) ? value : null;
  } catch {
    return null;
  }
}
function matchesStat(value: unknown, expected: URL): boolean {
  if (typeof value !== 'string' || value.length > 16384 || /[\r\n\0]/.test(value)) return false;
  try {
    const url = bandcampStatUrl(value.includes('://') ? value : 'https://' + value);
    if (!url || url.origin !== expected.origin || url.pathname !== expected.pathname) return false;
    let valid = true,
      actualCount = 0,
      expectedCount = 0;
    expected.searchParams.forEach((v, key) => {
      expectedCount++;
      if (url.searchParams.get(key) !== v) valid = false;
    });
    url.searchParams.forEach(() => {
      actualCount++;
    });
    return valid && actualCount === expectedCount;
  } catch {
    return false;
  }
}
function releasedUrl(input: unknown, original: URL, item: Item): string | null {
  const safe = safeHttpsUrl(input);
  if (!safe || safe.length > 16384) return null;
  const url = new URL(safe);
  if (url.hash) return null;
  if (url.href === original.href) return url.href;
  return /^[pt][1-9]\d{0,2}\.bcbits\.com$/.test(url.hostname) &&
    url.pathname.startsWith(`/download/${item.type}/`)
    ? url.href
    : null;
}
export const bandcamp: GateProvider = {
  id: 'bandcamp',
  name: 'Bandcamp',
  matches: (url) => bandcampProductUrl(url) || bandcampGrantUrl(url.href) !== null,
  inspect,
  async resolve(gate, context): Promise<Resolution> {
    const session = gates.get(gate);
    if (
      gate.provider !== 'bandcamp' ||
      !session ||
      context.pageUrl.href !== session.page ||
      !this.matches(context.pageUrl)
    )
      return fail(
        'not-supported',
        'Open a supported Bandcamp release or artist-issued download grant.',
      );
    if (!session.free)
      return fail(
        'not-supported',
        'This Bandcamp release is not an artist-issued free download. Use its purchase or native download controls.',
      );
    try {
      context.signal?.throwIfAborted();
      let document = session.document;
      if (session.grant) {
        if (!context.parseHtml)
          return fail(
            'not-supported',
            'This host does not supply an inert Bandcamp download-page parser.',
          );
        const response = await context.fetch(session.grant, {
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: context.signal
            ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
          headers: { Accept: 'text/html' },
        });
        if (
          !response.ok ||
          response.redirected ||
          (response.url && response.url !== session.grant) ||
          !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')
        ) {
          await response.body?.cancel();
          return fail(
            'server-required',
            'Bandcamp did not accept this download grant. Use its native download page.',
          );
        }
        document = context.parseHtml(
          await readLimitedText(response, 2 * 1024 * 1024),
          new URL(session.grant),
        );
      }
      const entry = receipt(document, session.item);
      if (!entry)
        return fail(
          'server-required',
          'Bandcamp did not provide an approved downloadable original for this release.',
        );
      let original = entry.file;
      for (let attempt = 0; attempt < 2; attempt++) {
        context.signal?.throwIfAborted();
        const stat = new URL(original.href);
        stat.pathname = stat.pathname.replace('/download/', '/statdownload/');
        stat.searchParams.set('.rand', String(crypto.getRandomValues(new Uint32Array(1))[0]));
        stat.searchParams.set('.vrs', '1');
        const response = await context.fetch(stat.href, {
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: context.signal
            ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
          headers: { Accept: 'application/json, text/javascript, */*; q=0.01' },
        });
        if (response.status === 429) {
          await response.body?.cancel();
          return fail('rate-limited', 'Bandcamp is limiting download checks. Try again later.');
        }
        if (
          !response.ok ||
          response.redirected ||
          (response.url && response.url !== stat.href) ||
          !/^(?:application\/(?:json|javascript)|text\/javascript)(?:;|$)/i.test(
            response.headers.get('content-type') ?? '',
          )
        ) {
          await response.body?.cancel();
          return fail(
            'server-required',
            'Bandcamp did not confirm this download. Complete its native download flow.',
          );
        }
        const value = parseBandcampStat(await readLimitedText(response, 64 * 1024));
        if (!value || !matchesStat(value['url'], stat))
          return fail(
            'invalid-response',
            'Bandcamp returned an unrelated or unreadable download status.',
          );
        if (value['result'] === 'ok') {
          const destination = releasedUrl(
            value['download_url'] ?? original.href,
            original,
            session.item,
          );
          return destination
            ? { ok: true, url: destination, kind: 'file', method: 'provider-request' }
            : fail(
                'unsafe-destination',
                'Bandcamp returned an unsupported original-download address.',
              );
        }
        if (
          attempt === 0 &&
          value['result'] === 'err' &&
          value['errortype'] === 'ExpiredFreeDownloadError' &&
          value['retry_url']
        ) {
          const retry = fileUrl(value['retry_url'], session.item, entry.encoding);
          if (!retry || retry.origin !== original.origin || retry.href === original.href)
            return fail('invalid-response', 'Bandcamp returned an invalid free-grant renewal.');
          original = retry;
          continue;
        }
        return fail(
          'server-required',
          'Bandcamp refused or expired this download grant. Use its native page to obtain a current authorized download.',
        );
      }
      return fail('server-required', 'Bandcamp did not confirm the renewed free download.');
    } catch {
      context.signal?.throwIfAborted();
      return fail(
        'network-error',
        'Bandcamp could not finish its download check. Check your connection and retry.',
      );
    }
  },
};
