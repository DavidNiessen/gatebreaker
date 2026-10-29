import { soundcloudComment } from '../domain/preferences';
import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { readLimitedText } from './shared/read-text';
import { automaticEmail } from './shared/automatic-email';

export const origin = 'https://downloadgater.com';
export type Driver = 'soundcloud' | 'spotify';
export interface Model {
  readonly title: string;
  readonly steps: readonly string[];
  readonly comment: boolean;
  readonly email: boolean;
  readonly paid: boolean;
  readonly protected: boolean;
}
export interface Session {
  readonly document: Document;
  readonly root: Element;
  readonly id: string;
  model: Model | null;
  emailSubmitted?: boolean;
  preferences?: ProviderContext['preferences'];
  readonly required: Set<Driver>;
  readonly receipts: Partial<Record<Driver, string>>;
  readonly rejected: Partial<Record<Driver, string>>;
}
export const documents = new WeakMap<Document, Session>();
export const gates = new WeakMap<Gate, Session>();
const limit = 512 * 1024;
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function gateId(url: URL): string | null {
  if (url.origin !== origin || url.username || url.password || url.port) return null;
  return /^\/g\/([A-Za-z0-9][A-Za-z0-9_-]{0,199})\/?$/.exec(url.pathname)?.[1] ?? null;
}
function native(document: Document, url: URL): Element | null {
  const root = document.querySelector('#root');
  if (!root) return null;
  try {
    return [...document.querySelectorAll('script[src]')].some((script) => {
      const source = new URL(script.getAttribute('src')!, url);
      return (
        source.origin === origin &&
        !source.username &&
        !source.password &&
        !source.port &&
        /^\/assets\/index-[\w-]+\.js$/.test(source.pathname)
      );
    })
      ? root
      : null;
  } catch {
    return null;
  }
}
function readModel(document: Document, id: string): Model | null {
  const scripts = document.querySelectorAll('script#__GATE_DATA__[type="application/json"]');
  if (scripts.length !== 1) return null;
  const text = scripts[0]!.textContent ?? '';
  if (!text || text.length > limit) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!object(value) || value['kind'] !== 'gate' || !object(value['link'])) return null;
    const link = value['link'];
    if (
      link['id'] !== id ||
      !object(link['gates']) ||
      Object.keys(link['gates']).length > 64 ||
      typeof link['hasProtectedDownload'] !== 'boolean' ||
      !['required', 'not-required'].includes(String(link['emailCapture']))
    )
      return null;
    const steps: string[] = [];
    for (const [key, status] of Object.entries(link['gates'])) {
      if (
        !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) ||
        !['required', 'not-required', 'optional'].includes(String(status))
      )
        return null;
      if (status === 'required') steps.push(key);
    }
    const title =
      typeof link['songTitle'] === 'string' && link['songTitle'].trim()
        ? link['songTitle']
        : link['title'];
    if (typeof title !== 'string' || !title.trim() || title.length > 10000) return null;
    return {
      title: title.trim().slice(0, 200),
      steps,
      comment: steps.includes('soundcloudComment'),
      email: link['emailCapture'] === 'required',
      paid: object(link['paidDownload'])
        ? link['paidDownload']['enabled'] !== false
        : !!link['paidDownload'],
      protected: link['hasProtectedDownload'],
    };
  } catch {
    return null;
  }
}
export function session(document: Document, url: URL): Session | null {
  const id = gateId(url),
    root = native(document, url);
  if (!id || !root) return null;
  let current = documents.get(document);
  if (!current || current.id !== id || current.root !== root) {
    current = {
      document,
      root,
      id,
      model: readModel(document, id),
      required: new Set(),
      receipts: {},
      rejected: {},
    };
    documents.set(document, current);
  }
  return current;
}
export function inspect(document: Document, url: URL): Gate | null {
  const current = session(document, url);
  if (!current) return null;
  const present = document.querySelector('#__GATE_DATA__');
  if (present && !current.model) return null;
  const model = current.model;
  const gate: Gate = {
    provider: 'downloadgater',
    id: current.id,
    title:
      model?.title ??
      document.querySelector('h1')?.textContent?.trim().slice(0, 200) ??
      'DownloadGater download',
    steps: model?.steps ?? [],
    ...(model?.comment
      ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
      : {}),
    metadata: {},
  };
  gates.set(gate, current);
  return gate;
}
export function receipt(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{16,4096}$/.test(value);
}
function signal(context: ProviderContext): AbortSignal {
  return context.signal
    ? AbortSignal.any([context.signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
}
async function json(response: Response, maxBytes: number): Promise<unknown> {
  try {
    return JSON.parse(await readLimitedText(response, maxBytes)) as unknown;
  } catch {
    return null;
  }
}
async function hydrate(current: Session, context: ProviderContext): Promise<boolean> {
  if (current.model) return true;
  if (!context.parseHtml) return false;
  const response = await context.fetch(new URL(`/g/${current.id}`, origin).href, {
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: signal(context),
    headers: { Accept: 'text/html' },
  });
  if (
    !response.ok ||
    response.redirected ||
    !response.headers.get('content-type')?.includes('text/html')
  ) {
    await response.body?.cancel();
    return false;
  }
  const document = context.parseHtml(
    await readLimitedText(response, 4 * 1024 * 1024),
    context.pageUrl,
  );
  context.signal?.throwIfAborted();
  if (!native(document, context.pageUrl)) return false;
  current.model = readModel(document, current.id);
  return !!current.model;
}
function refusal(status: number, code: unknown): Resolution {
  if (status === 429)
    return fail('rate-limited', 'DownloadGater is limiting requests. Wait before trying again.');
  if (status === 404 || status === 410)
    return fail('not-supported', 'This DownloadGater download is unavailable.');
  if ([401, 403, 419].includes(status))
    return fail(
      'server-required',
      typeof code === 'string' && /spotify/.test(code)
        ? 'DownloadGater requires Spotify sign-in. Review and complete its consent to continue.'
        : 'DownloadGater requires its native verification steps. Complete the sign-in action to continue.',
    );
  return fail('network-error', 'DownloadGater could not prepare this download. Try again later.');
}
async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  const current = gates.get(gate);
  if (!current || gate.provider !== 'downloadgater' || gateId(context.pageUrl) !== gate.id)
    return fail('not-supported', 'Open a supported DownloadGater gate first.');
  context.signal?.throwIfAborted();
  if (!(await hydrate(current, context)) || !current.model)
    return fail(
      'invalid-response',
      'DownloadGater returned unreadable gate details. Reload the gate.',
    );
  const model = current.model;
  if (model.paid || !model.protected)
    return fail(
      'not-supported',
      'Use DownloadGater’s native controls for this payment or unsupported file layout.',
    );
  if (context.preferences) current.preferences = { ...context.preferences };
  if (model.email && !current.emailSubmitted) {
    if (!context.automate)
      return fail(
        'server-required',
        'DownloadGater’s email step requires an explicit Download request.',
      );
    const response = await context.fetch(
      `${origin}/api/links/${encodeURIComponent(gate.id)}/email`,
      {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: signal(context),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: automaticEmail }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return refusal(response.status, null);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel();
      return fail('invalid-response', 'DownloadGater did not confirm the email step.');
    }
    const value = await json(response, 16384);
    context.signal?.throwIfAborted();
    if (!object(value))
      return fail('invalid-response', 'DownloadGater returned unreadable email confirmation.');
    current.emailSubmitted = true;
  }
  const address = new URL(`/api/download/${encodeURIComponent(gate.id)}`, origin);
  for (const driver of ['soundcloud', 'spotify'] as const) {
    const value =
      context.readNativeReceipt?.('downloadgater', gate.id, driver) ?? current.receipts[driver];
    if (receipt(value) && current.rejected[driver] !== value) {
      address.searchParams.set(driver === 'soundcloud' ? 'soundcloudToken' : 'spotifyToken', value);
      if (driver === 'soundcloud') address.searchParams.set('token', value);
    }
  }
  const probe = new URL(address.href);
  probe.searchParams.set('preflight', '1');
  const response = await context.fetch(probe.href, {
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: signal(context),
    headers: { Accept: 'application/json' },
  });
  context.signal?.throwIfAborted();
  if (
    response.status === 204 &&
    !response.redirected &&
    (!response.url || response.url === probe.href)
  )
    return { ok: true, url: address.href, kind: 'file', method: 'provider-request' };
  if (response.status === 204)
    return fail('invalid-response', 'DownloadGater returned approval for a different request.');
  let code: unknown;
  if (/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    const value = await json(response, 32768);
    context.signal?.throwIfAborted();
    if (!object(value))
      return fail('invalid-response', 'DownloadGater returned unreadable verification details.');
    code = object(value) ? value['code'] : null;
  } else await response.body?.cancel();
  if (typeof code === 'string') {
    current.required.clear();
    for (const driver of ['soundcloud', 'spotify'] as const) {
      const refused =
        driver === 'soundcloud'
          ? ['soundcloud_unlock_required', 'expired_unlock', 'invalid_soundcloud_unlock']
          : ['spotify_unlock_required', 'expired_spotify_unlock', 'invalid_spotify_unlock'];
      if (refused.includes(code)) {
        current.required.add(driver);
        const old = address.searchParams.get(
          driver === 'soundcloud' ? 'soundcloudToken' : 'spotifyToken',
        );
        if (old) current.rejected[driver] = old;
        delete current.receipts[driver];
      }
    }
  }
  if (
    current.required.has('soundcloud') &&
    model.comment &&
    !soundcloudComment(current.preferences?.soundcloudComment)
  )
    return fail(
      'input-required',
      'Save your SoundCloud comment in Gatebreaker before connecting. DownloadGater may post it publicly through your account.',
    );
  if (response.status === 200)
    return fail('invalid-response', 'DownloadGater did not return its required download approval.');
  return refusal(response.status, code);
}
export const downloadgater: GateProvider = {
  id: 'downloadgater',
  name: 'DownloadGater',
  matches: (url) => gateId(url) !== null,
  inspect,
  resolve,
};
