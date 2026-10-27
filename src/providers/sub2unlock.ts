import { fail } from '../domain/provider';
import type { GateProvider } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';

const idPattern = /^[A-Za-z0-9]{3,64}$/;

function idFromUrl(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'sub2unlock.com' ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const match = /^\/([A-Za-z0-9]{3,64})\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse only Next's public gate model; never execute page code or retain creator data. */
function gateData(document: Document): Record<string, unknown> | null {
  const text = document.querySelector('script#__NEXT_DATA__[type="application/json"]')?.textContent;
  if (!text || text.length > 2 * 1024 * 1024) return null;
  try {
    const next = record(JSON.parse(text) as unknown);
    if (next?.['page'] !== '/[uniquer]') return null;
    return record(record(record(record(next['props'])?.['pageProps'])?.['sink'])?.['data']);
  } catch {
    return null;
  }
}

export const sub2unlock: GateProvider = {
  id: 'sub2unlock',
  name: 'Sub2Unlock',
  matches: (url) => idFromUrl(url) !== null,
  inspect(document, url) {
    const id = idFromUrl(url);
    const data = id ? gateData(document) : null;
    if (
      !id ||
      !data ||
      data['uniquer'] !== id ||
      (data['deleted_at'] !== null && data['deleted_at'] !== undefined)
    )
      return null;
    const steps = Array.isArray(data['blocks'])
      ? data['blocks'].slice(0, 50).map((block) => {
          const name = record(record(block)?.['media'])?.['name'];
          return typeof name === 'string' ? name.trim().slice(0, 80) : 'Social action';
        })
      : [];
    return {
      provider: 'sub2unlock',
      id,
      title:
        typeof data['title'] === 'string' && data['title'].trim()
          ? data['title'].trim().slice(0, 200)
          : 'Sub2Unlock gate',
      steps: [...new Set(steps)],
      metadata: {
        destination:
          typeof data['unlocked_link'] === 'string' ? data['unlocked_link'].slice(0, 16385) : '',
      },
    };
  },
  async resolve(gate, context) {
    context.signal?.throwIfAborted();
    if (
      gate.provider !== 'sub2unlock' ||
      !idPattern.test(gate.id) ||
      idFromUrl(context.pageUrl) !== gate.id
    )
      return fail('not-supported', 'Open a supported Sub2Unlock gate, then try again.');
    const value = gate.metadata['destination'];
    if (!value)
      return fail(
        'server-required',
        'Sub2Unlock did not include a destination on this page. Reload the gate or use its original controls.',
      );
    const destination = value.length <= 16384 ? safeHttpsUrl(value) : null;
    if (!destination || destination === context.pageUrl.href)
      return fail(
        'unsafe-destination',
        'Sub2Unlock supplied an unsupported destination. No link was opened.',
      );
    return { ok: true, url: destination, method: 'embedded-link' };
  },
  presentation(document, url) {
    if (!sub2unlock.inspect(document, url)) return null;
    const anchor =
      document.querySelector('#__next .section-padding-equal h3, #__next h3, h1') ??
      document.body.firstElementChild;
    return anchor
      ? {
          anchor,
          startControl: '.section-padding-equal .d-grid.gap-4 > button:last-child',
          hiddenSelectors: ['.section-padding-equal .d-grid.gap-4'],
        }
      : null;
  },
};
