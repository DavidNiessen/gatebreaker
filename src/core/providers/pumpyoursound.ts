import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { soundcloudComment } from '../domain/preferences';
import { safeHttpsUrl } from '../domain/urls';
import { automaticEmail } from './shared/automatic-email';
import { readLimitedText } from './shared/read-text';

export interface PumpStep {
  readonly kind: string;
  readonly done: boolean;
}
export interface PumpSession {
  readonly document: Document;
  readonly id: string;
  readonly path: string;
  readonly origin: string;
  readonly verified: Set<string>;
  authRequired?: boolean;
}
export const documents = new WeakMap<Document, PumpSession>();
const gates = new WeakMap<Gate, PumpSession>();
const hosts = new Set(['pumpyoursound.com', 'www.pumpyoursound.com']);
const kinds = new Set(['soundcloud', 'comment', 'spotify', 'instagram', 'youtube', 'facebook']);
const socialPaths: Readonly<Record<string, string>> = {
  instagram: '/auth/instagram-follow/',
  youtube: '/auth/youtube-follow/',
  facebook: '/auth/facebook-like/',
};

export function pumpId(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    !hosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.searchParams.has('do') ||
    url.searchParams.has('_do')
  )
    return null;
  return (
    /^\/f\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,200}\/([1-9]\d{0,11})\/?$/.exec(
      url.pathname,
    )?.[1] ?? null
  );
}
export function pumpSteps(document: Document): readonly PumpStep[] {
  const elements = [...document.querySelectorAll('.fangateStep')];
  if (elements.length > 32) return [{ kind: 'unsupported', done: false }];
  return elements.map((element) => ({
    kind: /\bfangateStep--([a-z]+)\b/.exec(element.className)?.[1] ?? 'unsupported',
    done: element.classList.contains('done'),
  }));
}
function native(document: Document, url: URL): boolean {
  return [...document.querySelectorAll('script[src], script[data-main]')].some((script) => {
    try {
      const source = new URL(
        script.getAttribute('data-main') ?? script.getAttribute('src') ?? '',
        url,
      );
      return (
        source.origin === url.origin &&
        source.pathname === '/js/main.min.js' &&
        !source.username &&
        !source.password
      );
    } catch {
      return false;
    }
  });
}
function nativeForm(document: Document, url: URL): HTMLFormElement | null {
  const form = document.querySelector<HTMLFormElement>('form#frm-freeDownloadForm');
  if (
    !form ||
    form.getAttribute('method')?.toLowerCase() !== 'post' ||
    form.querySelector<HTMLInputElement>('input[name="_do"]')?.value !== 'freeDownloadForm-submit'
  )
    return null;
  try {
    const action = new URL(form.getAttribute('action') ?? '', url);
    return action.origin === url.origin &&
      action.pathname === url.pathname &&
      !action.username &&
      !action.password &&
      !action.search &&
      !action.hash
      ? form
      : null;
  } catch {
    return null;
  }
}
export function inspect(document: Document, url: URL): Gate | null {
  const id = pumpId(url);
  if (
    !id ||
    !native(document, url) ||
    (!nativeForm(document, url) && !document.querySelector('.fangateDownload[data-redirect-link]'))
  )
    return null;
  const steps = pumpSteps(document);
  const gate: Gate = {
    provider: 'pumpyoursound',
    id,
    title: (
      document.querySelector('h1.fangateTitle, h1')?.textContent?.trim() || 'PumpYourSound download'
    ).slice(0, 200),
    steps: steps.map(({ kind }) => kind),
    ...(steps.some((step) => step.kind === 'comment' && !step.done)
      ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
      : {}),
    metadata: {},
  };
  let session = documents.get(document);
  if (
    !session ||
    session.id !== id ||
    session.origin !== url.origin ||
    session.path !== url.pathname
  ) {
    session = { document, id, origin: url.origin, path: url.pathname, verified: new Set() };
    documents.set(document, session);
  }
  gates.set(gate, session);
  return gate;
}
export function pendingPumpSteps(current: PumpSession): readonly PumpStep[] {
  return pumpSteps(current.document).filter(
    (step) => !step.done && !current.verified.has(step.kind),
  );
}
function released(document: Document, url: URL): Resolution | null {
  if (document.querySelector('#flashMessages [data-type="error"], .flash.error')) return null;
  const links = document.querySelectorAll('.fangateDownload[data-redirect-link]');
  if (!links.length) return null;
  if (links.length !== 1)
    return fail('invalid-response', 'PumpYourSound supplied conflicting download details.');
  const value = links[0]!.getAttribute('data-redirect-link');
  const destination = value && value.length <= 16384 ? safeHttpsUrl(value) : null;
  if (!destination || destination === url.href)
    return fail('unsafe-destination', 'PumpYourSound returned an unsupported download address.');
  const parsed = new URL(destination);
  if (hosts.has(parsed.hostname) && (/^\/auth\//.test(parsed.pathname) || pumpId(parsed)))
    return fail(
      'unsafe-destination',
      'PumpYourSound returned a gate or account page instead of a reward.',
    );
  const kind = /\.(?:wav|aiff?|flac|mp3|m4a|ogg|zip|rar|7z)(?:$|\/)/i.test(parsed.pathname)
    ? 'file'
    : 'page';
  return { ok: true, url: destination, kind, method: 'provider-request' };
}
function headers(): Record<string, string> {
  return { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/html' };
}
function status(response: Response): Resolution | null {
  if (response.status === 429)
    return fail('rate-limited', 'PumpYourSound is limiting requests. Try again later.');
  if ([401, 403, 419].includes(response.status))
    return fail('session-expired', 'PumpYourSound rejected this session. Reload the gate.');
  if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status))
    return fail('network-error', 'PumpYourSound could not process this request.');
  return null;
}
export async function readPumpPage(
  context: ProviderContext,
  address: string,
): Promise<Document | null> {
  const response = await context.fetch(address, {
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal ?? null,
    headers: { Accept: 'text/html' },
  });
  context.signal?.throwIfAborted();
  if (
    !response.ok ||
    (response.url && response.url !== address) ||
    !response.headers.get('content-type')?.toLowerCase().includes('text/html') ||
    !context.parseHtml
  ) {
    await response.body?.cancel();
    return null;
  }
  const html = await readLimitedText(response, 2 * 1024 * 1024);
  context.signal?.throwIfAborted();
  return context.parseHtml(html, new URL(address));
}
function sameGateRedirect(value: unknown, page: URL): string | null {
  if (typeof value !== 'string' || value.length > 32768) return null;
  try {
    const target = new URL(value, page);
    if (
      target.origin !== page.origin ||
      target.pathname !== page.pathname ||
      target.username ||
      target.password ||
      target.hash
    )
      return null;
    const allowed = new Set(['_fid', 'downloadLink']);
    let valid = true;
    target.searchParams.forEach((_value, key) => {
      if (!allowed.has(key) || target.searchParams.getAll(key).length !== 1) valid = false;
    });
    return valid ? target.href : null;
  } catch {
    return null;
  }
}
function actionAddress(document: Document, kind: string, id: string, page: URL): string | null {
  const path = socialPaths[kind];
  if (!path) return null;
  const candidates = [
    ...document.querySelectorAll(
      `#${kind}_follow [data-href], #${kind}_follow a[href], .${kind}_follow_box[data-href]`,
    ),
  ];
  for (const element of candidates) {
    try {
      const url = new URL(
        element.getAttribute('data-href') ?? element.getAttribute('href') ?? '',
        page,
      );
      if (
        url.origin === page.origin &&
        url.pathname === path &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.searchParams.size === 1 &&
        url.searchParams.getAll('fangateId').length === 1 &&
        url.searchParams.get('fangateId') === id
      )
        return url.href;
    } catch {
      /* Unsupported native attributes remain unsupported. */
    }
  }
  return null;
}
export const pumpyoursound: GateProvider = {
  id: 'pumpyoursound',
  name: 'PumpYourSound',
  matches: (url) => pumpId(url) !== null,
  inspect,
  async resolve(gate, context) {
    const current = gates.get(gate);
    if (
      !current ||
      gate.provider !== 'pumpyoursound' ||
      pumpId(context.pageUrl) !== gate.id ||
      current.origin !== context.pageUrl.origin ||
      current.path !== context.pageUrl.pathname
    )
      return fail('not-supported', 'Open a supported PumpYourSound gate first.');
    context.signal?.throwIfAborted();
    const ready = released(current.document, context.pageUrl);
    if (ready) return ready;
    const remaining = pendingPumpSteps(current);
    if (remaining.some((step) => !kinds.has(step.kind)))
      return fail('not-supported', 'PumpYourSound declares a step this adapter cannot complete.');
    if (!context.automate)
      return fail('server-required', 'Choose Download to perform supported PumpYourSound steps.');
    const comment = soundcloudComment(context.preferences?.soundcloudComment);
    if (remaining.some((step) => step.kind === 'comment') && !comment)
      return fail(
        'input-required',
        'Save your SoundCloud comment in Gatebreaker. It will be posted publicly by PumpYourSound.',
      );
    if (remaining.some((step) => ['soundcloud', 'comment', 'spotify'].includes(step.kind))) {
      current.authRequired = true;
      return fail(
        'server-required',
        'Complete PumpYourSound’s required sign-in in Gatebreaker. The server must approve the download.',
      );
    }
    for (const step of remaining) {
      const address = actionAddress(current.document, step.kind, gate.id, context.pageUrl);
      if (!address)
        return fail('not-supported', 'PumpYourSound did not provide a recognized step request.');
      const response = await context.fetch(address, {
        credentials: 'include',
        redirect: 'error',
        cache: 'no-store',
        signal: context.signal ?? null,
        headers: headers(),
      });
      const failure = status(response);
      await response.body?.cancel();
      if (failure) return failure;
      const fresh = await readPumpPage(context, context.pageUrl.href);
      if (
        !fresh ||
        !inspect(fresh, context.pageUrl) ||
        !pumpSteps(fresh).some((item) => item.kind === step.kind && item.done)
      )
        return fail(
          'server-required',
          'PumpYourSound has not confirmed its social step. Complete the native flow.',
        );
      current.verified.add(step.kind);
    }
    const form = nativeForm(current.document, context.pageUrl);
    if (!form)
      return fail('invalid-response', 'PumpYourSound did not expose its native download form.');
    const body = new URLSearchParams({ _do: 'freeDownloadForm-submit', send: 'Download' });
    const token = form.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="_token"]',
    )?.value;
    if (token) {
      if (token.length > 4096)
        return fail('invalid-response', 'PumpYourSound supplied invalid form details.');
      body.set('_token', token);
    }
    if (form.querySelector('#frm-freeDownloadForm-email')) body.set('email', automaticEmail);
    if (comment && form.querySelector('input[name="fangate_comment"]'))
      body.set('fangate_comment', comment);
    const response = await context.fetch(new URL(context.pageUrl.pathname, context.pageUrl).href, {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
      signal: context.signal ?? null,
      headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    });
    context.signal?.throwIfAborted();
    const failure = status(response);
    if (failure) {
      await response.body?.cancel();
      return failure;
    }
    let next: string | null = null;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      next = sameGateRedirect(response.headers.get('location'), context.pageUrl);
      await response.body?.cancel();
    } else if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      let value: unknown;
      try {
        value = JSON.parse(await readLimitedText(response, 64 * 1024)) as unknown;
      } catch {
        return fail('invalid-response', 'PumpYourSound returned unreadable download details.');
      }
      if (value && typeof value === 'object' && !Array.isArray(value))
        next = sameGateRedirect((value as Record<string, unknown>)['redirect'], context.pageUrl);
    } else {
      await response.body?.cancel();
      return fail('invalid-response', 'PumpYourSound returned an unsupported download response.');
    }
    if (!next)
      return fail('invalid-response', 'PumpYourSound did not provide a recognized result page.');
    const page = await readPumpPage(context, next);
    if (!page || !native(page, new URL(next)))
      return fail('invalid-response', 'PumpYourSound’s result page could not be verified.');
    return (
      released(page, new URL(next)) ??
      fail(
        'server-required',
        'PumpYourSound refused the download. Complete any remaining required steps on its website.',
      )
    );
  },
};
