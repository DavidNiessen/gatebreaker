import { soundcloudComment } from '../domain/preferences';
import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { automaticEmail } from './shared/automatic-email';
import { readLimitedText } from './shared/read-text';

interface Step {
  readonly id: 'email' | 'soundcloud' | 'instagram' | 'spotify';
  readonly allowSkip: boolean;
  readonly collectName: boolean;
  readonly comment: boolean;
}
interface Model {
  readonly slug: string;
  readonly title: string;
  readonly hasFile: boolean;
  readonly isLink: boolean;
  readonly steps: readonly Step[];
}
export interface Session {
  readonly document: Document;
  readonly root: Element;
  readonly model: Model;
  readonly acknowledged: Set<string>;
  popup?: Window;
  oauthConfirmed?: boolean;
  oauthError?: boolean;
  authRequired?: boolean;
  listening?: boolean;
  savedComment?: string;
}

export const origin = 'https://gaterush.me';
export const documents = new WeakMap<Document, Session>();
const gates = new WeakMap<Gate, Document>();
const stepIds = new Set(['email', 'soundcloud', 'instagram', 'spotify']);
const jsonString = '"(?:[^"\\\\]|\\\\.)*"';
// The server renders this exact flat object. Its values are JSON, not JavaScript.
// Anchoring the entire script rejects extra statements, executable values and decoys.
const declaration = new RegExp(
  '^\\s*window\\.__GATE__\\s*=\\s*\\{\\s*' +
    `slug:\\s*(${jsonString})\\s*,\\s*` +
    `authUrl:\\s*(${jsonString})\\s*,\\s*` +
    `artistName:\\s*(${jsonString})\\s*,\\s*` +
    `trackTitle:\\s*(${jsonString})\\s*,\\s*` +
    'hasDownloadFile:\\s*(true|false)\\s*,\\s*' +
    'rewardIsLink:\\s*(true|false)\\s*,\\s*' +
    `rewardLabel:\\s*(${jsonString})\\s*,\\s*` +
    'steps:\\s*(\\[[\\s\\S]*\\])\\s*\\}\\s*;?\\s*$',
);

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function slugFromUrl(url: URL): string | null {
  if (url.origin !== origin || url.username || url.password || url.port) return null;
  const slug = /^\/([-A-Za-z0-9_]{6})\/?$/.exec(url.pathname)?.[1];
  return slug && !['charts', 'signup', 'logout', 'delete'].includes(slug) ? slug : null;
}

function nativeDocument(document: Document, url: URL): boolean {
  if (
    !document.querySelector('h1.track') ||
    !document.querySelector('#stepStage') ||
    !document.querySelector('button#download.download') ||
    document.querySelector('#adminDownloadModal')
  )
    return false;
  return [...document.querySelectorAll('script[src]')].some((script) => {
    try {
      const source = new URL(script.getAttribute('src') ?? '', url);
      return (
        source.origin === origin &&
        !source.username &&
        !source.password &&
        source.pathname === '/js/gate-liquid.js'
      );
    } catch {
      return false;
    }
  });
}

function model(document: Document, url: URL): Model | null {
  const slug = slugFromUrl(url);
  if (!slug || !nativeDocument(document, url)) return null;
  const scripts = [...document.querySelectorAll('script:not([src])')].filter((script) =>
    /window\.__GATE__\s*=/.test(script.textContent ?? ''),
  );
  if (scripts.length !== 1) return null;
  const source = scripts[0]!.textContent ?? '';
  if (source.length > 64 * 1024) return null;
  const match = declaration.exec(source);
  if (!match) return null;
  try {
    const declaredSlug: unknown = JSON.parse(match[1]!);
    const auth: unknown = JSON.parse(match[2]!);
    const title: unknown = JSON.parse(match[4]!);
    const raw: unknown = JSON.parse(match[8]!);
    if (
      declaredSlug !== slug ||
      auth !== `${origin}/auth/soundcloud?slug=${slug}` ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 2000 ||
      !Array.isArray(raw) ||
      raw.length > 4 ||
      match[5] === match[6]
    )
      return null;
    const seen = new Set<string>();
    const steps: Step[] = [];
    for (const item of raw) {
      if (
        !record(item) ||
        typeof item['id'] !== 'string' ||
        !stepIds.has(item['id']) ||
        seen.has(item['id']) ||
        typeof item['allowSkip'] !== 'boolean' ||
        !record(item['data']) ||
        item['data']['slug'] !== slug
      )
        return null;
      seen.add(item['id']);
      const data = item['data'];
      if (
        (data['collectName'] !== undefined && typeof data['collectName'] !== 'boolean') ||
        (data['enableScComment'] !== undefined && typeof data['enableScComment'] !== 'boolean') ||
        (item['id'] === 'soundcloud' && data['authUrl'] !== auth)
      )
        return null;
      steps.push({
        id: item['id'] as Step['id'],
        allowSkip: item['allowSkip'],
        collectName: data['collectName'] === true,
        comment: data['enableScComment'] === true,
      });
    }
    return {
      slug,
      title: title.trim().slice(0, 200),
      hasFile: match[5] === 'true',
      isLink: match[6] === 'true',
      steps,
    };
  } catch {
    return null;
  }
}

export function session(document: Document, url: URL): Session | null {
  const current = model(document, url);
  if (!current) return null;
  const root = document.querySelector('#stepStage')!;
  let stored = documents.get(document);
  if (!stored || stored.root !== root || JSON.stringify(stored.model) !== JSON.stringify(current)) {
    stored = { document, root, model: current, acknowledged: new Set() };
    documents.set(document, stored);
  }
  return stored;
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
}

function failure(response: Response): Resolution {
  if (response.status === 429)
    return fail('rate-limited', 'GateRush is limiting requests. Wait before trying again.');
  if ([401, 403].includes(response.status))
    return fail('server-required', 'GateRush requires its gate steps before releasing this file.');
  if (response.status === 419)
    return fail('session-expired', 'This GateRush session expired. Reload the page.');
  if ([404, 410].includes(response.status))
    return fail('not-supported', 'This GateRush download is unavailable or was removed.');
  return fail('network-error', 'GateRush could not process the download. Try again later.');
}

function csrf(document: Document): string | null {
  const value = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  return value && /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : null;
}

export function unsupported(current: Session): Resolution | null {
  if (current.model.isLink)
    return fail('not-supported', 'GateRush link rewards currently require the native website.');
  return null;
}

export function requiresComment(current: Session): boolean {
  return current.model.steps.some(
    (step) => step.id === 'soundcloud' && !step.allowSkip && step.comment,
  );
}

async function checkDownload(
  current: Session,
  context: ProviderContext,
): Promise<{ response: Response; result: Resolution }> {
  context.signal?.throwIfAborted();
  const destination = `${origin}/download/${current.model.slug}`;
  // Existing native cookies may already authorize the original file. A read-only
  // HEAD runs only after explicit Download and never reads media or UI state.
  const response = await context.fetch(destination, {
    method: 'HEAD',
    credentials: 'same-origin',
    redirect: 'manual',
    cache: 'no-store',
    signal: requestSignal(context.signal),
  });
  await response.body?.cancel();
  context.signal?.throwIfAborted();
  if (!response.ok) return { response, result: failure(response) };
  const contentType = response.headers.get('content-type') ?? '';
  const disposition = response.headers.get('content-disposition') ?? '';
  if (
    !/^attachment(?:\s*;|$)/i.test(disposition) ||
    !/^(?:audio\/[a-z0-9.+-]+|application\/(?:octet-stream|zip|x-zip-compressed))(?:\s*;|$)/i.test(
      contentType,
    )
  )
    return {
      response,
      result: fail('invalid-response', 'GateRush did not return a downloadable original file.'),
    };
  delete current.authRequired;
  delete current.oauthError;
  return {
    response,
    result: { ok: true, url: destination, kind: 'file', method: 'website-session' },
  };
}

async function confirm(
  current: Session,
  step: Step,
  context: ProviderContext,
): Promise<Resolution | null> {
  const token = csrf(current.document);
  if (!token) return fail('session-expired', 'Reload GateRush to refresh this download session.');
  context.signal?.throwIfAborted();
  const body = new URLSearchParams({ _csrf: token });
  if (step.id === 'email') {
    const email = automaticEmail;
    body.append('email', email);
    if (step.collectName) body.append('name', email.split('@')[0]!);
  } else body.append('stepId', step.id);
  context.onProgress?.({
    message:
      step.id === 'email'
        ? 'Submitting the GateRush email…'
        : 'Completing GateRush’s account-free confirmation…',
  });
  const response = await context.fetch(
    `${origin}/${step.id === 'email' ? 'save-email' : 'gate-step'}/${current.model.slug}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: requestSignal(context.signal),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-CSRF-Token': token,
      },
      body,
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    return failure(response);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    return fail('invalid-response', 'GateRush returned an unexpected confirmation.');
  }
  const value: unknown = JSON.parse(await readLimitedText(response, 16384));
  if (!record(value) || value['success'] !== true || Object.keys(value).length !== 1)
    return fail('invalid-response', 'GateRush did not confirm this gate step.');
  context.signal?.throwIfAborted();
  current.acknowledged.add(step.id);
  return null;
}

async function saveComment(
  current: Session,
  comment: string,
  context: ProviderContext,
): Promise<Resolution | null> {
  const token = csrf(current.document);
  if (!token) return fail('session-expired', 'Reload GateRush to refresh this download session.');
  context.signal?.throwIfAborted();
  context.onProgress?.({ message: 'Saving your GateRush SoundCloud comment…' });
  const response = await context.fetch(`${origin}/save-comment/${current.model.slug}`, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: requestSignal(context.signal),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-CSRF-Token': token,
    },
    body: new URLSearchParams({ commentText: comment, _csrf: token }),
  });
  await response.body?.cancel();
  context.signal?.throwIfAborted();
  // The native beforeNavigate hook accepts HTTP success, not a JSON receipt.
  if (!response.ok) return failure(response);
  current.savedComment = comment;
  return null;
}

async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  const document = gates.get(gate);
  const current = document ? session(document, context.pageUrl) : null;
  if (gate.provider !== 'gaterush' || !current || current.model.slug !== gate.id)
    return fail('not-supported', 'Open a current supported GateRush gate first.');
  const limitation = unsupported(current);
  if (limitation) return limitation;
  try {
    const initial = await checkDownload(current, context);
    if (initial.result.ok || ![401, 403].includes(initial.response.status)) return initial.result;
    const commentRequired = requiresComment(current);
    const comment = soundcloudComment(context.preferences?.soundcloudComment);
    if (commentRequired && current.savedComment !== comment) {
      delete current.authRequired;
      delete current.oauthConfirmed;
      delete current.oauthError;
      delete current.popup;
    }
    if (commentRequired && !comment)
      return fail(
        'input-required',
        'Add your SoundCloud comment in Gatebreaker’s settings, then try Download again.',
      );
    let changed = false;
    for (const step of current.model.steps) {
      if (step.allowSkip || step.id === 'soundcloud' || current.acknowledged.has(step.id)) continue;
      if (!context.automate)
        return fail(
          'server-required',
          'GateRush’s remaining steps require an explicit Download request.',
        );
      const result = await confirm(current, step, context);
      if (result) return result;
      changed = true;
    }
    if (commentRequired && comment && current.savedComment !== comment) {
      if (!context.automate)
        return fail('server-required', 'Save your comment after an explicit Download request.');
      const result = await saveComment(current, comment, context);
      if (result) return result;
      changed = true;
    }
    const final = changed ? await checkDownload(current, context) : initial;
    if (
      !final.result.ok &&
      [401, 403].includes(final.response.status) &&
      current.model.steps.some((step) => step.id === 'soundcloud' && !step.allowSkip)
    ) {
      current.authRequired = true;
      delete current.oauthConfirmed;
      return fail(
        'server-required',
        'GateRush requires SoundCloud sign-in. Complete its consent window to continue automatically.',
      );
    }
    return final.result;
  } catch (error) {
    context.signal?.throwIfAborted();
    return error instanceof TypeError ||
      (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))
      ? fail('network-error', 'GateRush could not be reached. Reload the page and try again.')
      : fail(
          'invalid-response',
          'GateRush returned unreadable confirmation data. Reload the page.',
        );
  }
}

export const gaterush: GateProvider = {
  id: 'gaterush',
  name: 'GateRush',
  matches: (url) => slugFromUrl(url) !== null,
  inspect(document, url) {
    const current = session(document, url);
    if (!current) return null;
    const gate: Gate = {
      provider: 'gaterush',
      id: current.model.slug,
      title: current.model.title,
      steps: current.model.steps.map((step) => step.id),
      ...(requiresComment(current)
        ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
        : {}),
      metadata: {},
    };
    gates.set(gate, document);
    return gate;
  },
  resolve,
};
