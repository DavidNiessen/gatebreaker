import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';

const hosts = new Set(['rekonise.com', 'www.rekonise.com']);
const reserved = new Set([
  'user',
  'u',
  'dashboard',
  'admin',
  'login',
  'register',
  'guides',
  'features',
  'for',
  'pricing',
  'terms',
  'privacy',
  'cookies',
  'contact',
  'oauth',
  'password-reset',
  'create',
  '404',
  'how-it-works',
]);
const slugPattern = /^[a-z0-9][a-z0-9_-]{2,199}$/;
const usernamePattern = /^[A-Za-z0-9_.-]{1,80}$/;
const maxActions = 30;
const maxWaitMs = maxActions * 45000 + 15000 + 5000;
const bodyLimit = 256 * 1024;

interface Model {
  readonly slug: string;
  readonly title: string;
  readonly type: number;
  readonly status: number;
  readonly actions: readonly { readonly type: number }[];
  readonly custom_slug?: string;
  readonly user?: { readonly username: string };
  readonly unlock_token?: string;
  readonly email_lists?: readonly unknown[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function route(url: URL): readonly string[] | null {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.has(url.hostname)
  )
    return null;
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  if (parts.length === 1 && slugPattern.test(parts[0]!) && !reserved.has(parts[0]!)) return parts;
  if (
    parts.length === 2 &&
    usernamePattern.test(parts[0]!) &&
    !reserved.has(parts[0]!) &&
    slugPattern.test(parts[1]!)
  )
    return parts;
  return null;
}

function model(value: unknown): Model | null {
  if (
    !record(value) ||
    typeof value['slug'] !== 'string' ||
    !slugPattern.test(value['slug']) ||
    typeof value['title'] !== 'string' ||
    !value['title'].trim() ||
    typeof value['type'] !== 'number' ||
    typeof value['status'] !== 'number' ||
    !Array.isArray(value['actions']) ||
    value['actions'].length > maxActions
  )
    return null;
  if (
    !value['actions'].every(
      (action) =>
        record(action) &&
        typeof action['type'] === 'number' &&
        Number.isInteger(action['type']) &&
        action['type'] >= 1 &&
        action['type'] <= 69,
    )
  )
    return null;
  if (value['email_lists'] !== undefined && !Array.isArray(value['email_lists'])) return null;
  return value as unknown as Model;
}

function matchesRoute(value: Model, parts: readonly string[]): boolean {
  return parts.length === 1
    ? value.slug === parts[0]
    : value.custom_slug === parts[1] && value.user?.username === parts[0];
}

/** Homepage demos reuse the widget; the nearest native component must be a gate page. */
function nativeHeading(document: Document): Element | null {
  for (const widget of document.querySelectorAll('app-social-unlock')) {
    const heading = widget.querySelector('h1');
    if (!heading) continue;
    let ancestor = widget.parentElement;
    while (ancestor) {
      if (ancestor.tagName.toLowerCase().startsWith('app-')) {
        if (ancestor.tagName.toLowerCase() === 'app-social-unlock-detail-page') return heading;
        break;
      }
      ancestor = ancestor.parentElement;
    }
  }
  return null;
}

function transferredModel(document: Document, url: URL): Model | null {
  const parts = route(url);
  const script = document.querySelector<HTMLScriptElement>(
    'script#ng-state[type="application/json"]',
  );
  if (!parts || !script || !nativeHeading(document)) return null;
  const text = script.textContent ?? '';
  if (!text || text.length > 1024 * 1024) return null;
  try {
    const state: unknown = JSON.parse(text);
    if (!record(state)) return null;
    for (const entry of Object.values(state)) {
      if (!record(entry)) continue;
      const candidate = model(entry['b']);
      if (candidate && matchesRoute(candidate, parts)) return candidate;
    }
  } catch {
    /* Untrusted framework state is data, never executable code. */
  }
  return null;
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
}

async function json(
  url: string,
  context: ProviderContext,
): Promise<{ response: Response; value: unknown }> {
  context.signal?.throwIfAborted();
  const response = await context.fetch(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: requestSignal(context.signal),
    headers: { Accept: 'application/json', 'X-Initial-Referrer': 'direct' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { response, value: null };
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new Error('Invalid response content type');
  return {
    response,
    value: JSON.parse(await readLimitedText(response, bodyLimit)) as unknown,
  };
}

function failure(response: Response): Resolution {
  if (response.status === 429)
    return fail('rate-limited', 'Rekonise is limiting requests. Wait before trying again.');
  if ([401, 403].includes(response.status))
    return fail(
      'server-required',
      'Rekonise did not release this link. Reload the page before retrying; this gate may enforce additional requirements.',
    );
  if ([404, 410].includes(response.status))
    return fail('not-supported', 'This Rekonise link is unavailable or was removed.');
  return fail('network-error', 'Rekonise could not process the request. Try again later.');
}

/** Native uploaded-file capabilities are restricted to the signed storage route. */
function safeFileDestination(destination: string): boolean {
  if (destination.length > 8192) return false;
  const url = new URL(destination);
  if (
    url.origin !== 'https://api.rekonise.com' ||
    url.hash ||
    !/^\/storage\/serve\/b64_(?:[A-Za-z0-9_+=-]|%2[fFbB]|%3[dD])+$/.test(url.pathname)
  )
    return false;
  // Firefox content-script URLSearchParams iterators may not implement Symbol.iterator.
  const keys: string[] = [];
  url.searchParams.forEach((_value, key) => keys.push(key));
  return (
    keys.length === 2 &&
    keys.includes('exp') &&
    keys.includes('sig') &&
    !!url.searchParams.get('exp')?.trim() &&
    !!url.searchParams.get('sig')?.trim()
  );
}

/** Upper bounds from the native widget: ordinary steps15s, watch-video(type30)45s. */
export function rekoniseWaitMs(
  actions: readonly { readonly type: number }[],
  hasEmailStep = false,
): number | null {
  if (actions.length > maxActions) return null;
  const milliseconds =
    actions.length || hasEmailStep
      ? actions.reduce((sum, action) => sum + (action.type === 30 ? 45000 : 15000), 5000) +
        (hasEmailStep ? 15000 : 0)
      : 0;
  return milliseconds <= maxWaitMs ? milliseconds : null;
}

function wait(milliseconds: number, context: ProviderContext): Promise<void> {
  context.signal?.throwIfAborted();
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + milliseconds;
    const progress = () => {
      const remainingSeconds = Math.ceil((deadline - Date.now()) / 1000);
      if (remainingSeconds > 0)
        context.onProgress?.({
          message:
            'Waiting for Rekonise’s native unlock timer. No accounts or social actions are used.',
          remainingSeconds,
        });
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(ticker);
      context.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(context.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const ticker = setInterval(progress, 1000);
    context.signal?.addEventListener('abort', abort, { once: true });
    progress();
  });
}

async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  const parts = route(context.pageUrl);
  if (gate.provider !== 'rekonise' || !parts || gate.id !== parts.join('/'))
    return fail('not-supported', 'This is not a supported Rekonise gate.');
  try {
    context.onProgress?.({ message: 'Loading the current Rekonise gate…' });
    const endpoint = `https://api.rekonise.com/social-unlocks/${parts.map(encodeURIComponent).join('/')}`;
    const initial = await json(endpoint, context);
    if (!initial.response.ok) return failure(initial.response);
    const current = model(initial.value);
    if (!current || !matchesRoute(current, parts))
      return fail(
        'invalid-response',
        'Rekonise returned details for an unexpected gate. Reload the page and try again.',
      );
    if (![1, 2].includes(current.type) || ![1, 5, 6].includes(current.status))
      return fail(
        'not-supported',
        'Gatebreaker currently supports public Rekonise link and uploaded-file gates. Snippets and unavailable links are not supported.',
      );
    const milliseconds = rekoniseWaitMs(current.actions, !!current.email_lists?.length);
    if (milliseconds === null)
      return fail('not-supported', 'This Rekonise gate has an unsupported action configuration.');
    const token = current.unlock_token;
    if (typeof token !== 'string' || token.length < 16 || token.length > 4096)
      return fail(
        'session-expired',
        'Rekonise did not supply a current public gate token. Reload the page and try again.',
      );
    await wait(milliseconds, context);
    context.signal?.throwIfAborted();
    context.onProgress?.({
      message: 'Requesting the unlocked Rekonise destination…',
    });
    const unlocked = await json(
      `https://api.rekonise.com/social-unlocks/${encodeURIComponent(current.slug)}/unlock?token=${encodeURIComponent(token)}`,
      context,
    );
    if (!unlocked.response.ok) return failure(unlocked.response);
    const resultField = current.type === 2 ? 'file' : 'url';
    if (
      !record(unlocked.value) ||
      typeof unlocked.value[resultField] !== 'string' ||
      !unlocked.value[resultField].trim() ||
      unlocked.value[resultField].length > 16384
    )
      return fail('invalid-response', 'Rekonise returned no usable link destination.');
    const destination = safeHttpsUrl(unlocked.value[resultField]);
    if (current.type === 2) {
      if (!destination || !safeFileDestination(destination))
        return fail(
          'unsafe-destination',
          'Rekonise returned an unrecognized file address. No link was opened.',
        );
      return { ok: true, url: destination, kind: 'file', method: 'provider-request' };
    }
    if (
      !destination ||
      /^(?:localhost|.*\.localhost|.*\.local)$/.test(new URL(destination).hostname) ||
      /^\d+(?:\.\d+){3}$/.test(new URL(destination).hostname) ||
      new URL(destination).hostname.includes(':') ||
      hosts.has(new URL(destination).hostname) ||
      new URL(destination).hostname === 'api.rekonise.com'
    )
      return fail(
        'unsafe-destination',
        'Rekonise returned an unsafe or recursive destination. No link was opened.',
      );
    return { ok: true, url: destination, method: 'provider-request' };
  } catch (error) {
    context.signal?.throwIfAborted();
    if (error instanceof TypeError)
      return fail('network-error', 'Rekonise could not be reached. Reload the page and try again.');
    return fail(
      'invalid-response',
      'Rekonise returned unreadable or oversized data. Reload the page and try again.',
    );
  }
}

export const rekonise: GateProvider = {
  id: 'rekonise',
  name: 'Rekonise',
  matches: (url) => !!route(url),
  inspect(document, url) {
    const parts = route(url);
    const heading = nativeHeading(document);
    if (!parts || !heading) return null;
    const current = transferredModel(document, url);
    // Consumed transfer state is optional; malformed or mismatched present state is not.
    if (!current && document.querySelector('script#ng-state')) return null;
    return {
      provider: 'rekonise',
      id: parts.join('/'),
      title: (current?.title.trim() || heading.textContent?.trim() || 'Rekonise gate').slice(
        0,
        200,
      ),
      steps: [
        ...(current?.actions.map((action) => `action-${action.type}`) ?? []),
        ...(current?.email_lists?.length ? ['email'] : []),
      ],
      metadata: {},
    };
  },
  resolve,
  presentation(document, url) {
    if (!this.inspect(document, url)) return null;
    const heading = nativeHeading(document);
    if (!heading) return null;
    const supported = transferredModel(document, url);
    const eligible =
      !supported ||
      ([1, 2].includes(supported.type) &&
        [1, 5, 6].includes(supported.status) &&
        rekoniseWaitMs(supported.actions, !!supported.email_lists?.length) !== null);
    return {
      anchor: heading.closest('.title-row') ?? heading,
      startControl: eligible
        ? 'app-social-unlock .unlock-footer .cta-button'
        : '[data-gatebreaker-inactive-start]',
      hiddenSelectors: eligible
        ? [
            'app-social-unlock .actions-stack',
            'app-social-unlock .unlock-footer',
            'app-social-unlock .steps-col > .mb-3',
            'app-social-unlock #unlock-progress-badge',
          ]
        : [],
    };
  },
};
