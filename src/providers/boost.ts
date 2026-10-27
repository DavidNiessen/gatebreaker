import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';

const hosts = new Set(['boost.ink', 'de.boost.ink', 'nl.boost.ink']);
const destinationAttribute = 'bufpsvdhmjybvgfncqfa';
const maxDestinationLength = 16384;
const maxEncodedLength = Math.ceil(maxDestinationLength / 3) * 4;

function gateId(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.has(url.hostname)
  )
    return null;
  return /^\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname)?.[1] ?? null;
}

/** Resolve the actual script base without trusting an injected cross-origin <base>. */
function nativeScript(document: Document, url: URL): HTMLScriptElement | null {
  let base = url;
  const declaredBase = document.querySelector('base[href]')?.getAttribute('href');
  try {
    if (declaredBase) base = new URL(declaredBase, url);
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
      const source = new URL(script.getAttribute('src')!, base);
      if (
        source.origin === url.origin &&
        source.pathname === '/assets/js/unlock.js' &&
        !source.username &&
        !source.password
      )
        return script;
    }
  } catch {
    // A malformed base or source cannot identify the known native script.
  }
  return null;
}

function inspect(document: Document, url: URL): Gate | null {
  const id = gateId(url);
  const script = nativeScript(document, url);
  if (!id || !script || !document.querySelector('button.complete_btn')) return null;
  return {
    provider: 'boost',
    id,
    title: `Boost.ink link ${id}`,
    steps: [...document.querySelectorAll('.step_block')].map((_, index) => `step-${index + 1}`),
    metadata: {
      encodedDestination: script.getAttribute(destinationAttribute) ?? '',
    },
  };
}

function decodeDestination(encoded: string, id: string): Resolution {
  if (
    !encoded ||
    encoded.length > maxEncodedLength ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    return fail('invalid-response', 'Boost.ink did not provide a valid embedded destination.');
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return fail('invalid-response', 'Boost.ink returned unreadable destination data.');
  }
  if (decoded.length > maxDestinationLength)
    return fail('invalid-response', 'Boost.ink returned an unusually long destination.');
  const destination = safeHttpsUrl(decoded);
  if (!destination || gateId(new URL(destination)) === id)
    return fail(
      'unsafe-destination',
      'Boost.ink returned an unsafe or looping destination. No link was opened.',
    );
  return { ok: true, url: destination, method: 'embedded-link' };
}

async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  if (gate.provider !== 'boost' || gateId(context.pageUrl) !== gate.id)
    return fail('not-supported', 'Open a supported Boost.ink gate, then try again.');
  context.signal?.throwIfAborted();
  const encoded = gate.metadata['encodedDestination'];
  if (encoded) return decodeDestination(encoded, gate.id);
  const requestUrl = new URL(context.pageUrl.href);
  requestUrl.hash = '';

  // unlock.js removes its data attribute before document_idle. Read only this
  // gate's inert HTML on request; never run source or fetch the final target.
  const response = await context.fetch(requestUrl.href, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    headers: { Accept: 'text/html' },
  });
  context.signal?.throwIfAborted();
  if (response.status === 429)
    return fail('rate-limited', 'Boost.ink is limiting requests. Wait before trying again.');
  if (response.status === 404 || response.status === 410)
    return fail('not-supported', 'This Boost.ink gate is no longer available.');
  if (response.status === 401 || response.status === 403)
    return fail(
      'server-required',
      'Boost.ink did not allow this page request. Complete any browser check yourself.',
    );
  if (!response.ok)
    return fail('network-error', 'Boost.ink could not load this gate. Try again later.');
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html'))
    return fail('invalid-response', 'Boost.ink returned an unexpected page response.');
  if (response.url && response.url !== requestUrl.href)
    return fail('invalid-response', 'Boost.ink returned a different page. No link was opened.');
  let source: string;
  try {
    source = await readLimitedText(response, 2 * 1024 * 1024);
  } catch {
    return fail('invalid-response', 'Boost.ink returned an oversized or unreadable page.');
  }
  context.signal?.throwIfAborted();
  const fresh = inspect(new DOMParser().parseFromString(source, 'text/html'), context.pageUrl);
  if (!fresh || fresh.id !== gate.id)
    return fail('invalid-response', 'Boost.ink did not return the expected gate layout.');
  return decodeDestination(fresh.metadata['encodedDestination'] ?? '', gate.id);
}

export const boost: GateProvider = {
  id: 'boost',
  name: 'Boost.ink',
  matches: (url) => gateId(url) !== null,
  inspect,
  resolve,
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector('h1');
    return anchor
      ? {
          anchor,
          startControl: '.complete_btn',
          hiddenSelectors: ['.step_block', '.complete_btn'],
        }
      : null;
  },
};
