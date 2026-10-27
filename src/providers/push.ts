import { fail } from '../domain/provider';
import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';
import {
  bindPushSession,
  ordinaryPushAction,
  performPushAction,
  pushActionProgress,
  pushActions,
  pushCsrf,
  pushModel,
  pushSession,
} from './push-session';

const slugPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const bodyLimit = 256 * 1024;
const maxFiles = 20;
const fileOrigin = 'https://routenote-push.s3.eu-west-2.amazonaws.com';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function slugFromUrl(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'push.fm' ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const match = /^\/(?:cu|unlock)\/([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

function nativeHeading(document: Document): Element | null {
  return document.querySelector(
    'span.leading-normal.inline-block.w-full.text-xl.font-bold.text-black.break-word',
  );
}

function nativeRoot(document: Document): Element | null {
  // Vue replaces the original #app node after hydration.
  const root = document.querySelector('#app') ?? nativeHeading(document)?.parentElement;
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (!root || !title?.trim()) return null;
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    try {
      const url = new URL(script.getAttribute('src') ?? '');
      if (
        url.origin === 'https://d29xpkeqnsbaz3.cloudfront.net' &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/[A-Za-z0-9-]{1,100}\/js\/products\.js$/.test(url.pathname) &&
        !url.search &&
        !url.hash
      )
        return root;
    } catch {
      /* Parse known source addresses without executing any page code. */
    }
  }
  return null;
}

async function json(
  url: string,
  context: ProviderContext,
  options: RequestInit = {},
): Promise<{ response: Response; value: unknown }> {
  context.signal?.throwIfAborted();
  const signal = context.signal
    ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const response = await context.fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers,
    },
    credentials: options.credentials ?? 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  if (
    response.redirected ||
    (response.url &&
      (new URL(response.url).origin !== new URL(url).origin ||
        new URL(response.url).pathname !== new URL(url).pathname))
  ) {
    await response.body?.cancel();
    throw new Error('Unexpected provider response origin');
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { response, value: null };
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel();
    throw new Error('Unexpected provider response type');
  }
  return {
    response,
    value: JSON.parse(await readLimitedText(response, bodyLimit)) as unknown,
  };
}

function failure(response: Response): Resolution {
  if ([401, 403].includes(response.status))
    return fail(
      'server-required',
      'PUSH.fm did not release this reward without completing its required steps. No account or social action was used.',
    );
  if ([404, 410].includes(response.status))
    return fail('not-supported', 'This PUSH.fm reward link is unavailable or was removed.');
  if (response.status === 429)
    return fail('rate-limited', 'PUSH.fm is limiting requests. Wait before trying again.');
  return fail('network-error', 'PUSH.fm could not process this reward. Try again later.');
}

/** Preserve the native signed file address, while allowing only its observed S3 route. */
function fileDestination(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 16384) return null;
  const safe = safeHttpsUrl(input);
  if (!safe) return null;
  const url = new URL(safe);
  const parts = url.pathname.split('/');
  let name: string;
  try {
    name = decodeURIComponent(parts[2] ?? '');
  } catch {
    return null;
  }
  if (
    url.origin !== fileOrigin ||
    url.hash ||
    parts.length !== 3 ||
    !/^[1-9]\d{0,15}$/.test(parts[1] ?? '') ||
    !name.trim() ||
    name.length > 1000 ||
    name === '.' ||
    name === '..' ||
    /[\/\\\u0000-\u001f\u007f]/.test(name)
  )
    return null;
  const allowedKeys = new Set([
    'response-content-disposition',
    'X-Amz-Content-Sha256',
    'X-Amz-Security-Token',
    'X-Amz-Algorithm',
    'X-Amz-Credential',
    'X-Amz-Date',
    'X-Amz-SignedHeaders',
    'X-Amz-Expires',
    'X-Amz-Signature',
  ]);
  const seen = new Set<string>();
  let valid = true;
  // Firefox content-script URLSearchParams iterators are not reliably iterable.
  url.searchParams.forEach((value, key) => {
    if (!allowedKeys.has(key) || seen.has(key) || !value.trim()) valid = false;
    seen.add(key);
  });
  const expiry = url.searchParams.get('X-Amz-Expires');
  if (
    !valid ||
    url.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
    !url.searchParams.get('X-Amz-Credential')?.trim() ||
    !/^\d{8}T\d{6}Z$/.test(url.searchParams.get('X-Amz-Date') ?? '') ||
    url.searchParams.get('X-Amz-SignedHeaders') !== 'host' ||
    !/^\d{1,6}$/.test(expiry ?? '') ||
    Number(expiry) < 1 ||
    Number(expiry) > 604800 ||
    !/^[a-fA-F0-9]{64}$/.test(url.searchParams.get('X-Amz-Signature') ?? '')
  )
    return null;
  return safe;
}

function files(value: unknown, expected: number): Resolution {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > maxFiles ||
    value.length !== expected
  )
    return fail('invalid-response', 'PUSH.fm returned an unexpected reward file list.');
  const destinations: { label: string; url: string }[] = [];
  const urls = new Set<string>();
  for (const item of value) {
    if (
      !record(item) ||
      typeof item['name'] !== 'string' ||
      !item['name'].trim() ||
      item['name'].length > 1000 ||
      typeof item['type'] !== 'string' ||
      !item['type'].trim() ||
      item['type'].length > 255 ||
      typeof item['size'] !== 'number' ||
      !Number.isSafeInteger(item['size']) ||
      item['size'] < 0 ||
      typeof item['content_id'] !== 'number' ||
      !Number.isSafeInteger(item['content_id']) ||
      item['content_id'] < 1
    )
      return fail('invalid-response', 'PUSH.fm returned unreadable reward file details.');
    const url = fileDestination(item['url']);
    if (!url || urls.has(url))
      return fail('unsafe-destination', 'PUSH.fm returned an unsafe or duplicate file address.');
    const label = item['name']
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 200);
    if (!label) return fail('invalid-response', 'PUSH.fm returned no readable file name.');
    urls.add(url);
    destinations.push({ label, url });
  }
  const url = destinations[0]!.url;
  return destinations.length === 1
    ? { ok: true, url, method: 'provider-request' }
    : { ok: true, url, method: 'provider-request', destinations };
}

async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  const slug = slugFromUrl(context.pageUrl);
  if (gate.provider !== 'push' || !slug || gate.id !== slug || !slugPattern.test(gate.id))
    return fail('not-supported', 'Open a supported PUSH.fm reward link, then try again.');
  try {
    context.onProgress?.({ message: 'Loading the current PUSH.fm reward…' });
    const initial = await json(
      `https://push.fm/api/guest/unlock/${encodeURIComponent(slug)}`,
      context,
    );
    if (!initial.response.ok) return failure(initial.response);
    const current = initial.value;
    if (
      !record(current) ||
      current['slug'] !== slug ||
      typeof current['title'] !== 'string' ||
      !current['title'].trim() ||
      typeof current['content_count'] !== 'number' ||
      !Number.isInteger(current['content_count']) ||
      current['content_count'] < 1 ||
      current['content_count'] > maxFiles ||
      current['isSoftDeleted'] === true
    )
      return fail('invalid-response', 'PUSH.fm returned unexpected or unavailable reward details.');
    if (typeof current['type'] !== 'string' || !['file', 'url'].includes(current['type']))
      return fail(
        'not-supported',
        'PUSH.fm text rewards do not provide a supported download link.',
      );
    context.signal?.throwIfAborted();
    context.onProgress?.({
      message: 'Checking PUSH.fm’s public reward response…',
    });
    // The native empty state is an object, not an array. No action tokens are supplied.
    let token = btoa(JSON.stringify({ actions: {} }));
    let unlocked = await json(
      `https://push.fm/unlock/${encodeURIComponent(slug)}/complete?token=${encodeURIComponent(token)}`,
      context,
    );
    const session = pushSession(gate);
    if (context.automate && session) {
      const model = pushModel(current);
      if (model) session.model = model;
      else delete session.model;
    }
    if (
      !unlocked.response.ok &&
      [401, 403].includes(unlocked.response.status) &&
      context.automate
    ) {
      if (!session?.model)
        return fail(
          'invalid-response',
          'PUSH.fm returned unsupported action details. Reload the gate.',
        );
      const csrf = pushCsrf(session);
      if (!csrf)
        return fail('session-expired', 'Reload this PUSH.fm page to refresh its download session.');
      for (const action of session.model.actions) {
        if (!ordinaryPushAction(action) || session.completed[action.driver]) continue;
        context.signal?.throwIfAborted();
        context.onProgress?.({ message: 'Completing PUSH.fm’s account-free download steps…' });
        const receipt = await json(
          `https://push.fm/unlock/${encodeURIComponent(slug)}/action/${action.id}`,
          context,
          { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': csrf } },
        );
        if (receipt.response.status === 419)
          return fail('session-expired', 'PUSH.fm’s download session expired. Reload the page.');
        if (!receipt.response.ok) return failure(receipt.response);
        if (
          !record(receipt.value) ||
          receipt.value['driver'] !== action.driver ||
          typeof receipt.value['token'] !== 'string' ||
          !receipt.value['token'] ||
          receipt.value['token'].length > 8192 ||
          /[\u0000-\u0020\u007f]/.test(receipt.value['token'])
        )
          return fail('invalid-response', 'PUSH.fm did not confirm its download step.');
        session.completed[action.driver] = receipt.value['token'];
      }
      const pendingLogins = pushActions(session.document).some(
        (action) => pushActionProgress(action.id, session.document)?.state !== 'complete',
      );
      if (pendingLogins) {
        context.onProgress?.({
          message: 'Sign in with Spotify to continue this PUSH.fm download.',
        });
        return fail(
          'server-required',
          'PUSH.fm requires Spotify sign-in. Complete the sign-in buttons to continue automatically.',
        );
      }
      token = btoa(JSON.stringify({ actions: session.completed }));
      unlocked = await json(
        `https://push.fm/unlock/${encodeURIComponent(slug)}/complete?token=${encodeURIComponent(token)}`,
        context,
        { credentials: 'same-origin' },
      );
    }
    if (!unlocked.response.ok) return failure(unlocked.response);
    context.signal?.throwIfAborted();
    if (current['type'] === 'file') return files(unlocked.value, current['content_count']);
    if (
      !record(unlocked.value) ||
      typeof unlocked.value['body'] !== 'string' ||
      unlocked.value['body'].length > 16384
    )
      return fail('invalid-response', 'PUSH.fm returned no usable reward destination.');
    const destination = safeHttpsUrl(unlocked.value['body']);
    if (
      !destination ||
      new URL(destination).hostname === 'push.fm' ||
      new URL(destination).hostname.endsWith('.push.fm')
    )
      return fail('unsafe-destination', 'PUSH.fm returned an unsafe or recursive destination.');
    return { ok: true, url: destination, method: 'provider-request' };
  } catch (error) {
    context.signal?.throwIfAborted();
    return error instanceof TypeError
      ? fail('network-error', 'PUSH.fm could not be reached. Reload the page and try again.')
      : fail(
          'invalid-response',
          'PUSH.fm returned unreadable or oversized data. Reload and try again.',
        );
  }
}

export const push: GateProvider = {
  id: 'push',
  name: 'PUSH.fm',
  matches: (url) => slugFromUrl(url) !== null,
  inspect(document, url) {
    const slug = slugFromUrl(url);
    if (!slug || !nativeRoot(document)) return null;
    const title = document.querySelector('meta[property="og:title"]')!.getAttribute('content')!;
    return bindPushSession(
      {
        provider: 'push',
        id: slug,
        title: title.trim().slice(0, 200),
        steps: [],
        metadata: {},
      },
      document,
    );
  },
  resolve,
  actions(document, url) {
    return this.inspect(document, url) ? pushActions(document) : [];
  },
  performAction(id, document, url, mode) {
    return this.inspect(document, url)
      ? performPushAction(id, document, mode)
      : { ok: false, message: 'Open a supported PUSH.fm gate first.' };
  },
  actionProgress(id, document, url) {
    return this.inspect(document, url) ? pushActionProgress(id, document) : null;
  },
  presentation(document, url) {
    const heading = nativeHeading(document);
    if (!heading?.parentElement || !this.inspect(document, url)) return null;
    return {
      anchor: heading.parentElement,
      startControl:
        'div.block.w-full.text-left.px-4.pb-6 > div.block.w-full.text-center.mt-4 > button',
      hiddenSelectors: [
        'div.block.w-full.text-left.px-4.pb-6',
        'div.relative.block.w-full.bg-indigo-5.h-2.px-4',
        'div.cta-banner-lift',
      ],
    };
  },
};
