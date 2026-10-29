import { soundcloudComment } from '../domain/preferences';
import type {
  Gate,
  GateActionProgress,
  GateProvider,
  ProviderContext,
  Resolution,
} from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const apiOrigin = 'https://api.droploud.com';
const maxModel = 2 * 1024 * 1024;
interface Step {
  readonly id: string;
  readonly type: string;
}
interface Model {
  readonly title: string;
  readonly steps: readonly Step[];
  readonly advertise: boolean;
  readonly soundcloudUrl?: string;
}
export interface Session {
  readonly document: Document;
  readonly id: string;
  readonly model: Model;
  sid?: string;
  nativeSid?: boolean;
  connected?: boolean;
  polling?: boolean;
  preparedComment?: string;
  social?: SoundcloudStatus;
  pollController?: AbortController;
  popup?: Window;
  socialPopup?: Window;
  socialAction?: GateActionProgress;
  socialController?: AbortController;
}
interface SoundcloudStatus {
  readonly connected: boolean;
  readonly steps?: Readonly<Record<string, unknown>>;
  readonly repost_mode?: 'api' | 'manual';
  readonly repost_manual_engaged?: boolean;
  readonly like_mode?: 'api' | 'manual';
  readonly like_verified?: boolean;
}
export const gates = new WeakMap<Gate, Session>();
export const documents = new WeakMap<Document, Session>();

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function gateId(url: URL): string | null {
  if (url.origin !== 'https://droploud.com' || url.username || url.password) return null;
  const id = /^\/(?:track|gate)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  return id && uuid.test(id) ? id : null;
}
/** Parse only the observed Next Flight push JSON. Never execute scripts or Flight expressions. */
function model(document: Document, id: string): Model | null {
  const scripts = document.querySelectorAll('script:not([src])');
  if (scripts.length > 128) return null;
  let flight = '';
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (text.length > maxModel) return null;
    const match = /^self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?$/.exec(text.trim());
    if (!match) continue;
    try {
      const value: unknown = JSON.parse(match[1]!);
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        value[0] === 1 &&
        typeof value[1] === 'string'
      )
        flight += value[1];
      if (flight.length > maxModel) return null;
    } catch {
      return null;
    }
  }
  const needle = '"gateData":';
  const offset = flight.indexOf(needle);
  if (offset < 0 || flight.indexOf(needle, offset + needle.length) >= 0) return null;
  const begin = offset + needle.length;
  if (flight[begin] !== '{') return null;
  let quoted = false,
    escaped = false,
    depth = 0;
  for (let index = begin; index < flight.length; index++) {
    const char = flight[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const value: unknown = JSON.parse(flight.slice(begin, index + 1));
        if (
          !object(value) ||
          !object(value['track']) ||
          value['track']['id'] !== id ||
          typeof value['track']['title'] !== 'string' ||
          !value['track']['title'].trim() ||
          value['track']['title'].length > 10000 ||
          !Array.isArray(value['steps']) ||
          value['steps'].length > 32
        )
          return null;
        const steps: Step[] = [],
          ids = new Set<string>();
        for (const step of value['steps']) {
          if (
            !object(step) ||
            typeof step['id'] !== 'string' ||
            typeof step['type'] !== 'string' ||
            !/^[a-z][a-z0-9_]{0,79}$/.test(step['id']) ||
            !/^[a-z][a-z0-9_]{0,79}$/.test(step['type']) ||
            ids.has(step['id'])
          )
            return null;
          ids.add(step['id']);
          steps.push({ id: step['id'], type: step['type'] });
        }
        if (
          value['advertise_droploud_follow'] !== undefined &&
          typeof value['advertise_droploud_follow'] !== 'boolean'
        )
          return null;
        const trackUrl = safeHttpsUrl(value['track']['soundcloud_url']);
        const soundcloudUrl =
          trackUrl &&
          new URL(trackUrl).origin === 'https://soundcloud.com' &&
          /^\/[\w.-]{1,100}\/[\w.-]{1,200}\/?$/.test(new URL(trackUrl).pathname)
            ? `https://soundcloud.com${new URL(trackUrl).pathname.replace(/\/$/, '')}`
            : undefined;
        return {
          title: value['track']['title'].trim().slice(0, 200),
          steps,
          advertise: value['advertise_droploud_follow'] !== false,
          ...(soundcloudUrl ? { soundcloudUrl } : {}),
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}
function native(document: Document, url: URL): boolean {
  if (!document.querySelector('.dtr-caption-title, .dtr-track-header')) return false;
  const base = document.querySelector('base[href]')?.getAttribute('href');
  try {
    const origin = base ? new URL(base, url) : url;
    return [...document.querySelectorAll('script[src]')].some((script) => {
      const source = new URL(script.getAttribute('src')!, origin);
      return (
        source.origin === url.origin &&
        !source.username &&
        !source.password &&
        /^\/_next\/static\/immutable\/chunks\/[a-zA-Z0-9_-]+\.js$/.test(source.pathname)
      );
    });
  } catch {
    return false;
  }
}
export function inspect(document: Document, url: URL): Gate | null {
  const id = gateId(url);
  if (!id || !native(document, url)) return null;
  const current = model(document, id);
  if (!current) return null;
  const gate: Gate = {
    provider: 'droploud',
    id,
    title: current.title,
    steps: current.steps.map((step) => step.type),
    ...(current.steps.some((step) => step.type === 'soundcloud_comment')
      ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
      : {}),
    metadata: {},
  };
  let session = documents.get(document);
  if (!session || session.id !== id) {
    session = { document, id, model: current };
    documents.set(document, session);
  }
  gates.set(gate, session);
  return gate;
}
function failure(status: number): Resolution {
  if (status === 429)
    return fail('rate-limited', 'Droploud is limiting requests. Wait before trying again.');
  if (status === 401)
    return fail('session-expired', 'Droploud’s session expired. Reload this gate.');
  if (status === 403)
    return fail(
      'server-required',
      'Complete Droploud’s required native steps, then try Download again.',
    );
  if (status === 404 || status === 410)
    return fail('not-supported', 'This Droploud gate is unavailable.');
  return fail('network-error', 'Droploud could not process the request. Try again later.');
}
export async function post(
  id: string,
  route: 'step' | 'download' | 'status' | 'verify',
  body: Record<string, string | boolean>,
  context: ProviderContext,
): Promise<{ response: Response; value: unknown }> {
  context.signal?.throwIfAborted();
  const endpoint =
    route === 'status' || route === 'verify'
      ? `${apiOrigin}/api/soundcloud/${route === 'status' ? 'gate-status' : 'verify-repost'}`
      : `${apiOrigin}/api/gate/${id}/${route}`;
  const response = await context.fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  context.signal?.throwIfAborted();
  if (response.url && response.url !== endpoint)
    throw new Error('Unexpected response origin or route');
  if (!response.ok) {
    const json = /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '');
    if (json && [403, 409, 429, 500, 502, 503, 504].includes(response.status)) {
      try {
        return {
          response,
          value: JSON.parse(await readLimitedText(response, 64 * 1024)) as unknown,
        };
      } catch {
        return { response, value: null };
      }
    }
    await response.body?.cancel().catch(() => {});
    return { response, value: null };
  }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Unexpected response type');
  }
  const value: unknown = JSON.parse(await readLimitedText(response, 64 * 1024));
  context.signal?.throwIfAborted();
  return { response, value };
}
export function statusValue(value: unknown): SoundcloudStatus | null {
  if (!object(value) || typeof value['connected'] !== 'boolean') return null;
  for (const key of ['repost_mode', 'like_mode'])
    if (value[key] !== undefined && !['api', 'manual'].includes(value[key] as string)) return null;
  for (const key of ['repost_manual_engaged', 'like_verified'])
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return null;
  if (value['steps'] !== undefined && !object(value['steps'])) return null;
  return value as unknown as SoundcloudStatus;
}
async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', stop, { once: true });
  });
  signal?.throwIfAborted();
}
async function verifySocial(
  session: Session,
  sid: string,
  context: ProviderContext,
  verified: () => void,
): Promise<Resolution | null> {
  if (!context.automate || !session.social) return null;
  const repost = session.model.steps.some((step) => step.type === 'soundcloud_repost');
  const like = session.model.steps.some((step) => step.type === 'soundcloud_like');
  if (!repost && !(like && session.social.like_mode === 'manual')) return null;
  // Native API-mode reposts settle for at most thirteen two-second status checks.
  if (
    repost &&
    session.social.repost_mode === 'api' &&
    session.social.steps?.['sc_repost'] !== true
  ) {
    for (let count = 0; count < 13; count++) {
      context.onProgress?.({
        message: 'Waiting for Droploud to confirm the SoundCloud actions…',
        remainingSeconds: (13 - count) * 2,
      });
      await delay(2000, context.signal);
      const result = await post(
        session.id,
        'status',
        { track_id: session.id, session_id: sid },
        context,
      );
      if (!result.response.ok) return failure(result.response.status);
      const status = statusValue(result.value);
      if (!status)
        return fail('invalid-response', 'Droploud returned unreadable SoundCloud status.');
      session.social = status;
      session.connected = status.connected;
      if (!status.connected)
        return fail('session-expired', 'Droploud lost the SoundCloud connection. Sign in again.');
      if (status.steps?.['sc_repost'] === true || status.repost_mode === 'manual') break;
    }
  }
  if (
    session.social.steps?.['sc_repost'] === true &&
    (!like || session.social.like_mode !== 'manual' || session.social.like_verified === true)
  ) {
    verified();
    return null;
  }
  if (session.social.repost_mode !== 'manual' && session.social.like_mode !== 'manual') return null;
  context.onProgress?.({ message: 'Verifying the SoundCloud repost with Droploud…' });
  let repostAttempted = false;
  let settling = 0;
  let fresh = true;
  let repostChecks = 0;
  for (let attempt = 0; attempt < 7; attempt++) {
    const result = await post(
      session.id,
      'verify',
      { track_id: session.id, session_id: sid, fresh },
      context,
    );
    fresh = false;
    if (
      result.response.status === 409 &&
      object(result.value) &&
      result.value['error'] === 'actions_settling' &&
      settling++ < 2
    ) {
      await delay(2500, context.signal);
      continue;
    }
    if (
      result.response.status === 409 &&
      object(result.value) &&
      ['identity_changed', 'session_mismatch'].includes(String(result.value['error']))
    ) {
      session.connected = false;
      session.socialController?.abort();
      delete session.socialAction;
      return fail(
        'session-expired',
        'Droploud’s SoundCloud account changed. Sign in again before retrying.',
      );
    }
    if (!result.response.ok) return failure(result.response.status);
    if (!object(result.value) || typeof result.value['found'] !== 'boolean')
      return fail('invalid-response', 'Droploud returned unreadable repost verification.');
    if (
      result.value['found'] &&
      !(like && session.social.like_mode === 'manual' && result.value['like'] === 'missing')
    ) {
      verified();
      delete session.socialAction;
      return null;
    }
    if (
      !result.value['found'] &&
      repost &&
      session.social.repost_mode === 'manual' &&
      session.model.soundcloudUrl &&
      context.repostSoundcloud &&
      !repostAttempted
    ) {
      repostAttempted = true;
      delete session.socialAction;
      context.onProgress?.({ message: 'Reposting the required track on SoundCloud…' });
      const controller = new AbortController();
      session.socialController?.abort();
      session.socialController = controller;
      const stop = () => controller.abort();
      context.signal?.addEventListener('abort', stop, { once: true });
      // Native storage can change while the host is waiting for a sign-in. Stop
      // the account operation promptly, rather than only rejecting its late result.
      const sessionWatch = setInterval(() => {
        try {
          if (sessionId(session, context) !== sid) controller.abort();
        } catch {
          controller.abort();
        }
      }, 500);
      try {
        context.signal?.throwIfAborted();
        const action = await context.repostSoundcloud(
          { provider: 'droploud', gateId: session.id, url: session.model.soundcloudUrl },
          controller.signal,
          context.onProgress,
        );
        context.signal?.throwIfAborted();
        if (sessionId(session, context) !== sid || controller.signal.aborted)
          return fail('session-expired', 'Droploud’s session changed. Reload and sign in again.');
        if (action.state !== 'complete')
          return fail(
            action.state === 'rate-limited' ? 'rate-limited' : 'server-required',
            action.state === 'challenge-required'
              ? 'SoundCloud verification did not finish. Choose Download again to reopen its window and complete verification there.'
              : action.state === 'login-required'
                ? 'SoundCloud sign-in did not finish. Choose Download again and sign in when its window opens.'
                : action.state === 'rate-limited'
                  ? 'SoundCloud is limiting repost requests. Wait before trying again.'
                  : 'SoundCloud could not confirm the repost. Check its sign-in window, then try Download again.',
          );
      } finally {
        clearInterval(sessionWatch);
        context.signal?.removeEventListener('abort', stop);
        if (session.socialController === controller) delete session.socialController;
      }
      // A successful account mutation is not a download receipt. Verify again with Droploud.
      context.onProgress?.({ message: 'Waiting for Droploud to verify the repost…' });
      await delay(2500, context.signal);
      fresh = true;
      continue;
    }
    if (repostAttempted && !result.value['found']) {
      if (++repostChecks < 3) {
        await delay(2500, context.signal);
        continue;
      }
      return fail(
        'server-required',
        'SoundCloud accepted the repost, but Droploud has not verified it. Use the same SoundCloud account for both sign-ins, then try Download again.',
      );
    }
    if (session.model.soundcloudUrl)
      session.socialAction = {
        state: 'waiting',
        message:
          'Complete the required repost or like on SoundCloud. Return here for verification.',
      };
    return fail(
      'server-required',
      'Droploud has not verified the SoundCloud repost or like. Complete the required action on SoundCloud, then choose Try again.',
    );
  }
  return fail(
    'server-required',
    'Droploud is still syncing the SoundCloud actions. Try again in a moment.',
  );
}
async function resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
  context.signal?.throwIfAborted();
  if (gate.provider !== 'droploud' || gateId(context.pageUrl) !== gate.id)
    return fail('not-supported', 'Open a supported Droploud gate first.');
  const session = gates.get(gate);
  if (!session || !native(session.document, context.pageUrl))
    return fail('invalid-response', 'Reload the Droploud gate and try again.');
  try {
    const sid = sessionId(session, context);
    if (!sid)
      return fail('session-expired', 'Reload Droploud to refresh its native download session.');
    const fetch = context.fetch;
    context = {
      ...context,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (sessionId(session, context) !== sid) {
          await response.body?.cancel().catch(() => {});
          throw new DOMException('Droploud session changed', 'AbortError');
        }
        return response;
      },
    };
    let existingRefusal: Response | undefined;
    let nativeCommentRefused = false;
    let commentRetryUsed = false;
    let changed = false;
    if (session.nativeSid) {
      // The native success-page re-download handler uses this stored SID directly.
      // Try its final server contract before introducing any additional login.
      const existing = await post(gate.id, 'download', { session_id: sid }, context);
      if (existing.response.ok) return destination(existing.value);
      if (existing.response.status !== 403) return failure(existing.response.status);
      existingRefusal = existing.response;
      nativeCommentRefused =
        object(existing.value) &&
        existing.value['error'] === 'SoundCloud comment step not completed';
    }
    const needsComment = session.model.steps.some((step) => step.type === 'soundcloud_comment');
    if (needsComment && context.automate) {
      const text = soundcloudComment(context.preferences?.soundcloudComment);
      if (!text)
        return fail(
          'input-required',
          'Save a SoundCloud comment in Gatebreaker to continue. It will be posted publicly from your signed-in account.',
        );
      if (session.preparedComment !== text || nativeCommentRefused) {
        const saved = await post(
          gate.id,
          'step',
          { session_id: sid, step: 'sc_comment', value: text },
          context,
        );
        if (!saved.response.ok) return failure(saved.response.status);
        if (!object(saved.value) || saved.value['ok'] !== true)
          return fail('invalid-response', 'Droploud did not accept the SoundCloud comment.');
        session.preparedComment = text;
        changed = true;
        commentRetryUsed = nativeCommentRefused;
      }
    }
    if (session.model.steps.some((step) => step.type.startsWith('soundcloud_'))) {
      const status = await post(gate.id, 'status', { track_id: gate.id, session_id: sid }, context);
      if (!status.response.ok) return failure(status.response.status);
      const social = statusValue(status.value);
      if (!social) return fail('invalid-response', 'Droploud returned unreadable session status.');
      session.social = social;
      session.connected = social.connected;
      if (!social.connected) {
        session.socialController?.abort();
        delete session.socialAction;
      }
      if (!session.connected)
        return fail(
          'server-required',
          'Connect SoundCloud through Droploud’s sign-in action to continue automatically.',
        );
      const socialFailure = await verifySocial(session, sid, context, () => {
        changed = true;
      });
      if (socialFailure) return socialFailure;
    }
    const acknowledgements = context.automate
      ? session.model.steps.filter(
          (step) =>
            (step.id === 'instagram' && step.type === 'instagram_follow') ||
            (step.id === 'droploud_follow' && step.type === 'droploud_follow'),
        )
      : [];
    for (const step of acknowledgements) {
      // Native Instagram "I've done it" and optional Droploud "Skip" both
      // call complete(step.id) with no value, consent or account credentials.
      const acknowledged = await post(gate.id, 'step', { session_id: sid, step: step.id }, context);
      if (!acknowledged.response.ok) return failure(acknowledged.response.status);
      if (
        !object(acknowledged.value) ||
        Object.keys(acknowledged.value).length !== 1 ||
        acknowledged.value['ok'] !== true
      )
        return fail(
          'invalid-response',
          step.id === 'instagram'
            ? 'Droploud did not confirm its Instagram step.'
            : 'Droploud did not confirm the optional step.',
        );
    }
    // Never repeat the same refused final request without a supported state change.
    if (existingRefusal && acknowledgements.length === 0 && !changed)
      return failure(existingRefusal.status);
    let result = await post(gate.id, 'download', { session_id: sid }, context);
    // The native final handler retries this specific refused comment once.
    if (
      context.automate &&
      !commentRetryUsed &&
      needsComment &&
      session.preparedComment &&
      result.response.status === 403 &&
      object(result.value) &&
      result.value['error'] === 'SoundCloud comment step not completed'
    ) {
      const saved = await post(
        gate.id,
        'step',
        { session_id: sid, step: 'sc_comment', value: session.preparedComment },
        context,
      );
      if (!saved.response.ok) return failure(saved.response.status);
      if (!object(saved.value) || saved.value['ok'] !== true)
        return fail('invalid-response', 'Droploud did not accept the SoundCloud comment.');
      result = await post(gate.id, 'download', { session_id: sid }, context);
    }
    if (!result.response.ok) return failure(result.response.status);
    return destination(result.value);
  } catch (error) {
    context.signal?.throwIfAborted();
    return error instanceof TypeError ||
      (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))
      ? fail('network-error', 'Droploud could not be reached. Reload and try again.')
      : fail('invalid-response', 'Droploud returned unreadable or oversized data.');
  }
}
/** Both native handlers pass this exact server-issued field directly to their download link. */
function destination(value: unknown): Resolution {
  if (
    !object(value) ||
    typeof value['download_url'] !== 'string' ||
    value['download_url'].length > 16384 ||
    (value['type'] !== undefined && !['native', 'external'].includes(value['type'] as string))
  )
    return fail('invalid-response', 'Droploud returned unreadable download details.');
  const target = safeHttpsUrl(value['download_url']);
  if (!target) return fail('unsafe-destination', 'Droploud returned an unsafe destination.');
  const url = new URL(target);
  // Preserve provider-hosted files supplied by the exact native API. Reject only
  // known page/auth/control routes; no storage host or file path is invented.
  if (
    (url.origin === 'https://droploud.com' &&
      (url.pathname === '/' || /^\/(?:track|gate|auth)(?:\/|$)/.test(url.pathname))) ||
    (url.origin === apiOrigin &&
      /^\/api\/(?:auth|soundcloud|spotify)(?:\/|$)/.test(url.pathname)) ||
    (url.origin === apiOrigin && /^\/api\/gate\/[^/]+\/(?:step|download)\/?$/.test(url.pathname))
  )
    return fail('unsafe-destination', 'Droploud returned a recursive or control destination.');
  return {
    ok: true,
    url: target,
    kind: value['type'] === 'external' ? 'page' : 'file',
    method: 'provider-request',
  };
}
export function sessionId(
  session: Session,
  context: Pick<ProviderContext, 'readNativeSession'> = {},
): string | null {
  const stored = context.readNativeSession?.('droploud', session.id);
  if (stored && !uuid.test(stored)) return null;
  if (stored && session.sid && stored !== session.sid) {
    session.pollController?.abort();
    session.socialController?.abort();
    session.polling = false;
    delete session.preparedComment;
    delete session.social;
    delete session.connected;
    delete session.socialAction;
    delete session.popup;
    delete session.socialPopup;
  }
  session.nativeSid = !!stored;
  session.sid = stored || session.sid || crypto.randomUUID();
  return session.sid;
}
export const droploud: GateProvider = {
  id: 'droploud',
  name: 'Droploud',
  matches: (url) => gateId(url) !== null,
  inspect,
  resolve,
};
