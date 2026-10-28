import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';

const pageHosts = new Set(['www.valorizd.app']);
const providerHosts = new Set(['valorizd.app', 'www.valorizd.app']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const endpoint =
  'https://firestore.googleapis.com/v1/projects/valorizd-d6172/databases/(default)/documents:runQuery';
const documentPattern =
  /^projects\/valorizd-d6172\/databases\/\(default\)\/documents\/gates\/[A-Za-z0-9]{1,128}$/;
const selectedFields = [
  'slug',
  'title',
  'gateType',
  'reward.url',
  'reward.fileUrl',
  'reward.fileName',
  'steps',
  'emailCapture',
];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function slugFromUrl(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    !pageHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const slug = /^\/gates\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  return slug && slug.length <= 200 && slugPattern.test(slug) ? slug : null;
}

function ownedGateBundle(value: string, base: URL, pageOrigin: string): boolean {
  if (value.length > 2048) return false;
  try {
    const source = new URL(value, base);
    return (
      source.origin === pageOrigin &&
      !source.username &&
      !source.password &&
      /^\/_next\/static\/chunks\/app\/gates\/(?:%5[Bb]gateId%5[Dd]|\[gateId\])\/page-[a-f0-9]+\.js$/.test(
        source.pathname,
      )
    );
  } catch {
    return false;
  }
}

/** Next may consume route scripts before document_idle; resource timing survives hydration. */
function nativePage(document: Document, pageUrl: URL): boolean {
  try {
    const declaredBase = document.querySelector('base[href]')?.getAttribute('href');
    const base = declaredBase ? new URL(declaredBase, pageUrl) : pageUrl;
    const identities = document.querySelectorAll(
      'link[rel="canonical"][href], meta[property="og:url"][content]',
    );
    if (!identities.length) return false;
    for (const identity of identities) {
      const value = identity.getAttribute('href') ?? identity.getAttribute('content');
      if (!value || slugFromUrl(new URL(value, base)) !== slugFromUrl(pageUrl)) return false;
    }
    for (const source of document.querySelectorAll(
      'script[src], link[rel="preload"][as="script"][href], link[rel="modulepreload"][href]',
    )) {
      const value = source.getAttribute('src') ?? source.getAttribute('href');
      if (value && ownedGateBundle(value, base, pageUrl.origin)) return true;
    }
    const heading = nativeHeading(document);
    const performance = document.defaultView?.performance;
    if (
      heading?.closest('div.relative.px-5.pb-5.pt-5') &&
      typeof performance?.getEntriesByType === 'function'
    ) {
      const entries = performance.getEntriesByType('resource');
      // Index access also avoids cross-realm iterator differences in Firefox content scripts.
      for (let index = 0; index < Math.min(entries.length, 2000); index++) {
        const entry = entries[index];
        if (
          record(entry) &&
          entry['initiatorType'] === 'script' &&
          typeof entry['name'] === 'string' &&
          ownedGateBundle(entry['name'], pageUrl, pageUrl.origin)
        )
          return true;
      }
    }
  } catch {
    // Untrusted metadata and script URLs are data, never executable code.
  }
  return false;
}

function nativeHeading(document: Document): Element | null {
  return document.querySelector('h2.line-clamp-3.break-words');
}

function stringField(value: unknown): string | null {
  return record(value) &&
    Object.keys(value).length === 1 &&
    typeof value['stringValue'] === 'string'
    ? value['stringValue']
    : null;
}

function mapFields(value: unknown): Record<string, unknown> | null {
  if (!record(value) || Object.keys(value).length !== 1 || !record(value['mapValue'])) return null;
  const fields = value['mapValue']['fields'];
  return record(fields) ? fields : null;
}

function query(slug: string): string {
  return JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'gates' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'slug' },
          op: 'EQUAL',
          value: { stringValue: slug },
        },
      },
      select: { fields: selectedFields.map((fieldPath) => ({ fieldPath })) },
      limit: 2,
    },
  });
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
}

function readDestination(value: unknown, slug: string): Resolution {
  if (!Array.isArray(value) || value.length > 3 || value.some((row) => !record(row)))
    return fail('invalid-response', 'Valorizd returned an unreadable gate response.');
  const rows = value.filter((row) => row['document'] !== undefined);
  if (!rows.length)
    return fail('not-supported', 'This Valorizd gate is unavailable or was removed.');
  if (rows.length !== 1)
    return fail('invalid-response', 'Valorizd returned more than one gate for this address.');
  const document = rows[0]!['document'];
  if (
    !record(document) ||
    typeof document['name'] !== 'string' ||
    !documentPattern.test(document['name']) ||
    !record(document['fields'])
  )
    return fail('invalid-response', 'Valorizd returned an unexpected gate document.');
  const fields = document['fields'];
  const title = stringField(fields['title']);
  const kind = stringField(fields['gateType']);
  if (
    stringField(fields['slug']) !== slug ||
    !title?.trim() ||
    title.length > 10000 ||
    !['url', 'file'].includes(kind ?? '') ||
    (fields['emailCapture'] !== undefined &&
      (!record(fields['emailCapture']) ||
        Object.keys(fields['emailCapture']).length !== 1 ||
        typeof fields['emailCapture']['booleanValue'] !== 'boolean'))
  )
    return fail('invalid-response', 'Valorizd returned inconsistent gate details.');
  const reward = mapFields(fields['reward']);
  const raw = reward ? stringField(reward[kind === 'file' ? 'fileUrl' : 'url']) : null;
  if (!raw?.trim())
    return fail('invalid-response', 'Valorizd did not include a usable gate destination.');
  const destination = raw.length <= 16384 ? safeHttpsUrl(raw) : null;
  if (
    !destination ||
    providerHosts.has(new URL(destination).hostname) ||
    new URL(destination).hostname === 'firestore.googleapis.com'
  )
    return fail(
      'unsafe-destination',
      'Valorizd returned an unsafe destination. No link was opened.',
    );
  return {
    ok: true,
    url: destination,
    ...(kind === 'file' ? { kind: 'file' as const } : {}),
    method: 'provider-request',
  };
}

async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  context.signal?.throwIfAborted();
  if (gate.provider !== 'valorizd' || slugFromUrl(context.pageUrl) !== gate.id)
    return fail('not-supported', 'Open a supported Valorizd gate, then try again.');
  try {
    const response = await context.fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: requestSignal(context.signal),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: query(gate.id),
    });
    context.signal?.throwIfAborted();
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 429)
        return fail('rate-limited', 'Valorizd is limiting requests. Wait before trying again.');
      if ([401, 403].includes(response.status))
        return fail('server-required', 'Valorizd did not allow access to this public gate.');
      if ([404, 410].includes(response.status))
        return fail('not-supported', 'This Valorizd gate is unavailable or was removed.');
      if (response.status === 400)
        return fail('invalid-response', 'Valorizd could not read the gate query.');
      return fail('network-error', 'Valorizd could not process the request. Try again later.');
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel().catch(() => {});
      return fail('invalid-response', 'Valorizd returned an unexpected response format.');
    }
    const value: unknown = JSON.parse(await readLimitedText(response, 256 * 1024));
    context.signal?.throwIfAborted();
    return readDestination(value, gate.id);
  } catch (error) {
    context.signal?.throwIfAborted();
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))
    )
      return fail('network-error', 'Valorizd could not be reached. Reload the page and try again.');
    return fail('invalid-response', 'Valorizd returned unreadable or oversized gate data.');
  }
}

export const valorizd: GateProvider = {
  id: 'valorizd',
  name: 'Valorizd',
  matches: (url) => slugFromUrl(url) !== null,
  inspect(document, url) {
    const slug = slugFromUrl(url);
    if (!slug || !nativePage(document, url)) return null;
    return {
      provider: 'valorizd',
      id: slug,
      title: nativeHeading(document)?.textContent?.trim().slice(0, 200) || 'Valorizd gate',
      steps: [],
      metadata: {},
    };
  },
  resolve,
  presentation(document, url) {
    if (!this.inspect(document, url)) return null;
    const heading = nativeHeading(document);
    const anchor = heading?.closest('div.flex.items-start.gap-4');
    const content = heading?.closest('div.relative.px-5.pb-5.pt-5');
    if (!heading || !anchor || !content) return null;
    return {
      anchor,
    };
  },
};
