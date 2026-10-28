import type {
  AuthorizationOpener,
  Gate,
  GateActionProgress,
  GateProvider,
  ProviderContext,
  Resolution,
} from '../domain/provider';
import type { GatePreferences } from '../domain/preferences';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';
import { readLimitedText } from './shared/read-text';
import { soundcloudComment } from '../domain/preferences';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const apiOrigin = 'https://api.droploud.com';
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
interface Session {
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
const gates = new WeakMap<Gate, Session>();
const documents = new WeakMap<Document, Session>();

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function gateId(url: URL): string | null {
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
            ? trackUrl
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
function inspect(document: Document, url: URL): Gate | null {
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
async function post(
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
function statusValue(value: unknown): SoundcloudStatus | null {
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
  if (session.social.repost_mode !== 'manual' && session.social.like_mode !== 'manual') return null;
  if (
    session.social.steps?.['sc_repost'] === true &&
    (!like || session.social.like_mode !== 'manual' || session.social.like_verified === true)
  ) {
    verified();
    return null;
  }
  context.onProgress?.({ message: 'Verifying the SoundCloud repost with Droploud…' });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await post(
      session.id,
      'verify',
      { track_id: session.id, session_id: sid, fresh: attempt === 0 },
      context,
    );
    if (
      result.response.status === 409 &&
      object(result.value) &&
      result.value['error'] === 'actions_settling' &&
      attempt === 0
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
      return null;
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
    const sid = sessionId(session);
    if (!sid)
      return fail('session-expired', 'Reload Droploud to refresh its native download session.');
    let existingRefusal: Response | undefined;
    let changed = false;
    if (session.nativeSid) {
      // The native success-page re-download handler uses this stored SID directly.
      // Try its final server contract before introducing any additional login.
      const existing = await post(gate.id, 'download', { session_id: sid }, context);
      if (existing.response.ok) return destination(existing.value);
      if (existing.response.status !== 403) return failure(existing.response.status);
      existingRefusal = existing.response;
    }
    const needsComment = session.model.steps.some((step) => step.type === 'soundcloud_comment');
    if (needsComment && context.automate) {
      const text = soundcloudComment(context.preferences?.soundcloudComment);
      if (!text)
        return fail(
          'input-required',
          'Save a SoundCloud comment in Gatebreaker to continue. It will be posted publicly from your signed-in account.',
        );
      if (session.preparedComment !== text) {
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
      }
    }
    if (session.model.steps.some((step) => step.type.startsWith('soundcloud_'))) {
      const status = await post(gate.id, 'status', { track_id: gate.id, session_id: sid }, context);
      if (!status.response.ok) return failure(status.response.status);
      const social = statusValue(status.value);
      if (!social) return fail('invalid-response', 'Droploud returned unreadable session status.');
      session.social = social;
      session.connected = social.connected;
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
    const canSkip =
      context.automate &&
      session.model.steps.some(
        (step) => step.id === 'droploud_follow' && step.type === 'droploud_follow',
      );
    if (canSkip) {
      // This exact body is the shipped "Skip" / "I’m done, continue" contract.
      const skipped = await post(
        gate.id,
        'step',
        { session_id: sid, step: 'droploud_follow' },
        context,
      );
      if (!skipped.response.ok) return failure(skipped.response.status);
      if (
        !object(skipped.value) ||
        Object.keys(skipped.value).length !== 1 ||
        skipped.value['ok'] !== true
      )
        return fail('invalid-response', 'Droploud did not confirm the optional step.');
    }
    // Never repeat the same refused final request without a supported state change.
    if (existingRefusal && !canSkip && !changed) return failure(existingRefusal.status);
    let result = await post(gate.id, 'download', { session_id: sid }, context);
    // The native final handler retries this specific refused comment once.
    if (
      context.automate &&
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
function sessionId(session: Session): string | null {
  const view = session.document.defaultView;
  // Native success chunk 2ps2ha3qouhw5.js prefers the saved track receipt.
  const stored =
    view?.localStorage?.getItem(`dw_sid:${session.id}`) || view?.sessionStorage?.getItem('dw_sid');
  if (stored && !uuid.test(stored)) return null;
  if (stored && session.sid && stored !== session.sid) {
    delete session.preparedComment;
    delete session.social;
    delete session.connected;
  }
  session.nativeSid = !!stored;
  session.sid = stored || session.sid || crypto.randomUUID();
  return session.sid;
}
/** Poll only the native status endpoint after the explicit provider OAuth window opens. */
function poll(session: Session): void {
  const view = session.document.defaultView;
  if (session.polling || !view || typeof view.fetch !== 'function') return;
  session.polling = true;
  let attempts = 0;
  const deadline = Date.now() + 90000;
  const controller = new AbortController();
  session.pollController?.abort();
  session.pollController = controller;
  const check = async () => {
    if (
      controller.signal.aborted ||
      documents.get(session.document) !== session ||
      attempts++ >= 60 ||
      Date.now() >= deadline
    ) {
      session.polling = false;
      return;
    }
    try {
      const sid = sessionId(session);
      if (!sid) {
        session.polling = false;
        return;
      }
      const status = await post(
        session.id,
        'status',
        { track_id: session.id, session_id: sid },
        {
          pageUrl: new URL(`https://droploud.com/track/${session.id}`),
          fetch: view.fetch.bind(view),
          probePublicFile: async () => null,
          signal: controller.signal,
        },
      );
      const social = status.response.ok ? statusValue(status.value) : null;
      if (social) {
        session.social = social;
        session.connected = social.connected;
      } else if ([401, 403, 429].includes(status.response.status)) {
        session.polling = false;
        return;
      }
    } catch {
      /* A transient error is retried within the bounded native window. */
    }
    if (session.connected) {
      session.polling = false;
      return;
    }
    view.setTimeout(() => {
      void check();
    }, 1500);
  };
  void check();
}
/** The user performs the actual public action; Droploud alone verifies its result. */
function watchSocialAction(session: Session, view: Window): void {
  session.socialController?.abort();
  const controller = new AbortController();
  session.socialController = controller;
  let checking = false,
    lastCheck = 0;
  const check = async () => {
    if (controller.signal.aborted || checking || Date.now() - lastCheck < 3500) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const sid = sessionId(session);
      if (!sid) throw Error('Session expired');
      const result = await post(
        session.id,
        'verify',
        { track_id: session.id, session_id: sid, fresh: false },
        {
          pageUrl: new URL(`https://droploud.com/track/${session.id}`),
          fetch: view.fetch.bind(view),
          signal: controller.signal,
          probePublicFile: async () => null,
        },
      );
      if (controller.signal.aborted) return;
      if (
        result.response.ok &&
        object(result.value) &&
        result.value['found'] === true &&
        !(session.social?.like_mode === 'manual' && result.value['like'] === 'missing')
      ) {
        session.socialAction = {
          state: 'complete',
          message: 'Droploud verified the SoundCloud actions.',
        };
        controller.abort();
      } else
        session.socialAction = {
          state: 'error',
          retryLabel: 'Check SoundCloud actions again',
          message:
            result.response.status === 429
              ? 'Droploud is limiting verification. Wait before checking again.'
              : 'Droploud has not verified the required repost or like yet. Complete it in SoundCloud, then check again.',
        };
    } catch {
      if (!controller.signal.aborted)
        session.socialAction = {
          state: 'error',
          retryLabel: 'Check SoundCloud actions again',
          message: 'The SoundCloud action could not be verified. Try again.',
        };
    } finally {
      checking = false;
    }
  };
  view.addEventListener(
    'focus',
    () => {
      void check();
    },
    { signal: controller.signal },
  );
  const ticker = view.setInterval(() => {
    if (session.popup?.closed) {
      view.clearInterval(ticker);
      void check();
    }
  }, 500);
  const timeout = view.setTimeout(() => {
    session.socialAction = {
      state: 'error',
      retryLabel: 'Check SoundCloud actions again',
      message: 'Verification timed out. Complete the action in SoundCloud, then check again.',
    };
    controller.abort();
  }, 90000);
  controller.signal.addEventListener(
    'abort',
    () => {
      view.clearInterval(ticker);
      view.clearTimeout(timeout);
    },
    { once: true },
  );
  if (session.socialAction?.state === 'error') {
    session.socialAction = {
      state: 'waiting',
      message: 'Checking Droploud’s SoundCloud verification…',
    };
    void check();
  }
}
export const droploud: GateProvider = {
  id: 'droploud',
  name: 'Droploud',
  matches: (url) => gateId(url) !== null,
  inspect,
  resolve,
  actions(document, url) {
    const gate = inspect(document, url);
    const current = gate && gates.get(gate);
    if (current?.socialAction && current.model.soundcloudUrl)
      return [
        {
          id: 'droploud-social',
          kind: 'social',
          label: 'Complete SoundCloud actions',
          description:
            'Opens this track in SoundCloud. Complete the required repost or like; Droploud verifies it when you return.',
          required: true,
        },
      ];
    return gate &&
      gates.get(gate)?.connected === false &&
      gate.steps.some((type) => type.startsWith('soundcloud_')) &&
      (!gate.steps.includes('soundcloud_comment') || !!gates.get(gate)?.preparedComment)
      ? [
          {
            id: 'droploud-soundcloud',
            kind: 'sign-in',
            label: 'Connect SoundCloud',
            description:
              'Uses Droploud’s SoundCloud window. Review the actions and permissions in its native controls.',
            required: true,
          },
        ]
      : [];
  },
  performAction(
    id,
    document,
    url,
    mode,
    _opener?: AuthorizationOpener,
    preferences?: GatePreferences,
  ) {
    const gate = inspect(document, url),
      view = document.defaultView;
    const social = gate && gates.get(gate);
    if (
      id === 'droploud-social' &&
      social?.socialAction &&
      social.model.soundcloudUrl &&
      view &&
      mode === 'activate'
    ) {
      if (!social.popup || social.popup.closed) {
        const popup = view.open(
          social.model.soundcloudUrl,
          `gatebreaker-droploud-social-${gate!.id}`,
          'width=1000,height=800,scrollbars=yes,resizable=yes',
        );
        if (!popup) return { ok: false, message: 'Allow the SoundCloud window, then try again.' };
        social.popup = popup;
      }
      watchSocialAction(social, view);
      return {
        ok: true,
        message: 'Complete the SoundCloud action, then return here for verification.',
      };
    }
    if (
      id !== 'droploud-soundcloud' ||
      !gate ||
      !view ||
      !this.actions?.(document, url).some((action) => action.id === id)
    )
      return {
        ok: false,
        message: 'This Droploud flow cannot open a supported sign-in action.',
      };
    const session = gates.get(gate)!;
    if (
      gate.steps.includes('soundcloud_comment') &&
      soundcloudComment(preferences?.soundcloudComment) !== session.preparedComment
    )
      return {
        ok: false,
        message: 'Save your current SoundCloud comment and choose Download before signing in.',
      };
    try {
      const sid = sessionId(session);
      if (!sid)
        return {
          ok: false,
          message: 'Reload Droploud to refresh its native session.',
        };
      if (mode !== 'activate')
        return {
          ok: true,
          message: 'Review Droploud’s requested SoundCloud actions before signing in.',
        };
      const connect = new URL(`${apiOrigin}/api/soundcloud/connect`);
      connect.search = new URLSearchParams({
        track_id: gate.id,
        session_id: sid,
        disclose_droploud: session.model.advertise ? '1' : '0',
      }).toString();
      const popup = view.open(
        connect.href,
        'sc_connect',
        'width=600,height=700,scrollbars=yes,resizable=yes',
      );
      if (!popup)
        return {
          ok: false,
          message: 'Allow Droploud’s SoundCloud sign-in window, then try again.',
        };
      session.popup = popup;
      poll(session);
      return {
        ok: true,
        message: 'Review and finish Droploud’s SoundCloud authorization window.',
      };
    } catch {
      return {
        ok: false,
        message: 'Droploud’s native session could not be opened. Reload this page.',
      };
    }
  },
  cancelActions(document, url) {
    if (!gateId(url)) return;
    const current = documents.get(document);
    if (!current) return;
    current.pollController?.abort();
    current.socialController?.abort();
    const popup = current.popup;
    delete current.popup;
    delete current.preparedComment;
    delete current.connected;
    delete current.social;
    delete current.socialAction;
    current.polling = false;
    try {
      popup?.close();
    } catch {
      /* Cancellation must still discard prepared state. */
    }
  },
  actionProgress(id, document, url) {
    const gate = inspect(document, url);
    if (id === 'droploud-social' && gate) return gates.get(gate)?.socialAction ?? null;
    if (id !== 'droploud-soundcloud' || !gate) return null;
    return gates.get(gate)?.connected
      ? {
          state: 'complete',
          message: 'Droploud’s server confirmed SoundCloud authorization.',
        }
      : {
          state: 'waiting',
          message: 'Complete Droploud’s SoundCloud authorization window.',
        };
  },
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector('.dtr-caption-title');
    return anchor ? { anchor } : null;
  },
};
