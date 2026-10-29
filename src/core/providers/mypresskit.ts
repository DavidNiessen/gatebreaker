import type {
  Gate,
  GateProvider,
  ProviderContext,
  Resolution,
  FailureCode,
} from '../domain/provider';
import { fail } from '../domain/provider';
import { soundcloudComment } from '../domain/preferences';
import { automaticEmail } from './shared/automatic-email';
import { readLimitedText } from './shared/read-text';

const hosts = new Set(['mypresskit.info', 'www.mypresskit.info']);
const ordinary = new Set([
  'instagram-follow',
  'facebook-follow',
  'twitter-follow',
  'tiktok-follow',
  'youtube-like',
  'youtube-subscribe',
]);
const account = new Set([
  'soundcloud-follow',
  'soundcloud-like',
  'soundcloud-repost',
  'soundcloud-comment',
  'spotify-follow',
  'spotify-save',
  'spotify-presave',
]);
interface Step {
  index: number;
  type: string;
  required: boolean;
}
interface Model {
  id: string;
  handle: string;
  title: string;
  available: boolean;
  steps: Step[];
  combine: boolean;
  soundcloud: boolean;
  spotify: boolean;
}
class ProtocolError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
  }
}
export interface Verification {
  unlocked: boolean;
  remaining: number[];
  completed: number[];
  token: string | null;
}
export interface Pending {
  id: string;
  service: 'soundcloud' | 'spotify';
  indexes: number[];
  step: number;
  comment?: string;
}
export interface Session {
  document: Document;
  model: Model;
  attempted: Set<number>;
  pending?: Pending;
  verification?: Verification;
  preferences?: ProviderContext['preferences'];
  popup?: Window;
  authController?: AbortController;
  progress?: { state: 'waiting' | 'complete' | 'error'; message: string };
}
export const documents = new WeakMap<Document, Session>();
const gates = new WeakMap<Gate, Session>();
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function handleFromUrl(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    !hosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  return /^\/gate\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,199})\/?$/.exec(url.pathname)?.[1] ?? null;
}
function model(document: Document, url: URL): Model | null {
  const handle = handleFromUrl(url);
  if (
    !handle ||
    ![...document.querySelectorAll('script[src]')].some((script) => {
      try {
        const source = new URL(script.getAttribute('src')!, url);
        return (
          source.origin === url.origin &&
          /^\/_next\/static\/chunks\/app\/\(frontend\)\/gate\/\[handle\]\/page-[\w-]+\.js$/.test(
            decodeURIComponent(source.pathname),
          )
        );
      } catch {
        return false;
      }
    })
  )
    return null;
  let flight = '';
  const scripts = document.querySelectorAll('script:not([src])');
  if (scripts.length > 256) return null;
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (text.length > 2 * 1024 * 1024) return null;
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
    } catch {
      return null;
    }
    if (flight.length > 2 * 1024 * 1024) return null;
  }
  let result: Model | null = null;
  for (const line of flight.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let row: unknown;
    try {
      row = JSON.parse(line.slice(colon + 1)) as unknown;
    } catch {
      continue;
    }
    if (
      !Array.isArray(row) ||
      row.length !== 4 ||
      row[0] !== '$' ||
      !record(row[3]) ||
      !record(row[3]['gate']) ||
      !record(row[3]['providers'])
    )
      continue;
    const gate = row[3]['gate'],
      providers = row[3]['providers'];
    if (
      gate['handle'] !== handle ||
      typeof gate['id'] !== 'string' ||
      !/^[1-9]\d{0,15}$/.test(gate['id']) ||
      typeof gate['title'] !== 'string' ||
      !gate['title'].trim() ||
      gate['title'].length > 2000 ||
      !Array.isArray(gate['gateSteps']) ||
      gate['gateSteps'].length > 32 ||
      !record(gate['availability']) ||
      !['available', 'paused', 'expired', 'download-limit-reached', 'unavailable'].includes(
        String(gate['availability']['state']),
      ) ||
      typeof providers['soundcloudOAuth'] !== 'boolean' ||
      typeof providers['spotifyOAuth'] !== 'boolean' ||
      typeof gate['combineSoundCloudSteps'] !== 'boolean'
    )
      return null;
    const seen = new Set<number>(),
      steps: Step[] = [];
    for (const step of gate['gateSteps']) {
      if (
        !record(step) ||
        !Number.isSafeInteger(step['index']) ||
        (step['index'] as number) < 0 ||
        (step['index'] as number) > 100 ||
        seen.has(step['index'] as number) ||
        typeof step['type'] !== 'string' ||
        !/^[a-z-]{1,64}$/.test(step['type']) ||
        typeof step['required'] !== 'boolean'
      )
        return null;
      seen.add(step['index'] as number);
      steps.push({
        index: step['index'] as number,
        type: step['type'],
        required: step['required'],
      });
    }
    if (result) return null;
    result = {
      id: gate['id'],
      handle,
      title: gate['title'].trim().slice(0, 200),
      available: gate['availability']['state'] === 'available',
      steps,
      combine: gate['combineSoundCloudSteps'],
      soundcloud: providers['soundcloudOAuth'],
      spotify: providers['spotifyOAuth'],
    };
  }
  return result;
}
export function inspect(document: Document, url: URL): Gate | null {
  const value = model(document, url);
  if (!value) return null;
  let current = documents.get(document);
  if (!current || JSON.stringify(current.model) !== JSON.stringify(value)) {
    current?.authController?.abort();
    current = { document, model: value, attempted: new Set() };
    documents.set(document, current);
  }
  const gate: Gate = {
    provider: 'mypresskit',
    id: value.id,
    title: value.title,
    steps: value.steps.map((step) => step.type),
    ...(value.steps.some((step) => step.type === 'soundcloud-comment')
      ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
      : {}),
    metadata: {},
  };
  gates.set(gate, current);
  return gate;
}
export async function verify(
  current: Session,
  context: Pick<ProviderContext, 'fetch' | 'pageUrl' | 'signal'>,
): Promise<Verification> {
  const address = new URL(`/api/download-gates/${current.model.id}/verify-step`, context.pageUrl)
    .href;
  const response = await context.fetch(address, {
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (
    !response.ok ||
    response.redirected ||
    (response.url && response.url !== address) ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
  ) {
    await response.body?.cancel();
    throw new ProtocolError(
      response.status === 429
        ? 'rate-limited'
        : [401, 403, 419].includes(response.status)
          ? 'session-expired'
          : [404, 410].includes(response.status)
            ? 'not-supported'
            : response.ok
              ? 'invalid-response'
              : 'network-error',
      'MyPressKit could not verify this gate session. Reload or complete its native flow.',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(await readLimitedText(response, 64 * 1024)) as unknown;
  } catch {
    context.signal?.throwIfAborted();
    throw new ProtocolError(
      'invalid-response',
      'MyPressKit returned unreadable verification details.',
    );
  }
  const validIndexes = new Set(current.model.steps.map((step) => step.index));
  const indexes = (value: unknown): value is number[] =>
    Array.isArray(value) &&
    value.length <= 32 &&
    new Set(value).size === value.length &&
    value.every((entry) => Number.isSafeInteger(entry) && validIndexes.has(entry as number));
  if (
    !record(value) ||
    !record(value['unlockState']) ||
    typeof value['unlockState']['unlocked'] !== 'boolean' ||
    !indexes(value['unlockState']['remaining']) ||
    !indexes(value['completedStepIndexes']) ||
    (value['downloadToken'] !== null &&
      value['downloadToken'] !== undefined &&
      (typeof value['downloadToken'] !== 'string' ||
        !/^[\x21-\x7e]{1,8192}$/.test(value['downloadToken'])))
  )
    throw new ProtocolError(
      'invalid-response',
      'MyPressKit returned unreadable verification details.',
    );
  context.signal?.throwIfAborted();
  const result = {
    unlocked: value['unlockState']['unlocked'],
    remaining: value['unlockState']['remaining'],
    completed: value['completedStepIndexes'],
    token: typeof value['downloadToken'] === 'string' ? value['downloadToken'] : null,
  };
  current.verification = result;
  return result;
}
async function submit(current: Session, context: ProviderContext, step: Step): Promise<boolean> {
  const route = step.type === 'email-capture' ? 'email' : 'track-step';
  const address = new URL(`/api/download-gates/${current.model.id}/${route}`, context.pageUrl).href;
  const response = await context.fetch(address, {
    method: 'POST',
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stepIndex: step.index,
      ...(route === 'email' ? { email: automaticEmail } : {}),
    }),
  });
  await response.body?.cancel();
  context.signal?.throwIfAborted();
  if (response.status === 429)
    throw new ProtocolError(
      'rate-limited',
      'MyPressKit is limiting requests. Wait before retrying.',
    );
  if ([401, 403, 419].includes(response.status))
    throw new ProtocolError(
      'session-expired',
      'MyPressKit requires a fresh browser session for this step.',
    );
  return response.ok && !response.redirected && (!response.url || response.url === address);
}
export const mypresskit: GateProvider = {
  id: 'mypresskit',
  name: 'MyPressKit',
  matches: (url) => handleFromUrl(url) !== null,
  inspect,
  async resolve(gate, context): Promise<Resolution> {
    const current = gates.get(gate);
    if (
      gate.provider !== 'mypresskit' ||
      !current ||
      current.model.handle !== handleFromUrl(context.pageUrl)
    )
      return fail('not-supported', 'Open a supported MyPressKit gate.');
    if (!current.model.available)
      return fail('not-supported', 'This MyPressKit gate is paused or unavailable.');
    if (context.preferences) current.preferences = { ...context.preferences };
    try {
      for (let round = 0; round < 33; round++) {
        context.signal?.throwIfAborted();
        const status = await verify(current, context);
        if (
          current.pending &&
          (status.unlocked ||
            current.pending.indexes.every((index) => status.completed.includes(index)))
        ) {
          current.authController?.abort();
          delete current.authController;
          delete current.pending;
          delete current.progress;
        }
        if (status.unlocked && status.token)
          return {
            ok: true,
            kind: 'file',
            method: 'provider-request',
            url: new URL(
              `/api/download-gates/${current.model.id}/download?token=${encodeURIComponent(status.token)}`,
              context.pageUrl,
            ).href,
          };
        const remaining = current.model.steps.filter((step) =>
          status.remaining.includes(step.index),
        );
        if (!remaining.length)
          return fail(
            'server-required',
            'MyPressKit has not issued a download grant. Complete its native verification.',
          );
        const step =
          remaining.find((step) => ordinary.has(step.type) || step.type === 'email-capture') ??
          remaining[0]!;
        if (ordinary.has(step.type) || step.type === 'email-capture') {
          if (!context.automate)
            return fail(
              'server-required',
              'Choose Download to complete MyPressKit’s supported steps.',
            );
          if (current.attempted.has(step.index))
            return fail(
              'server-required',
              'MyPressKit did not confirm its submitted step. Retry its native flow.',
            );
          if (!(await submit(current, context, step)))
            return fail(
              'server-required',
              'MyPressKit refused this required step. Complete any native browser verification.',
            );
          current.attempted.add(step.index);
          continue;
        }
        if (!account.has(step.type))
          return fail(
            'server-required',
            'MyPressKit requires an unsupported native step. Complete it on the website.',
          );
        const service = step.type.startsWith('soundcloud-') ? 'soundcloud' : 'spotify';
        if (!(service === 'soundcloud' ? current.model.soundcloud : current.model.spotify))
          return fail(
            'server-required',
            'MyPressKit has not enabled the required account connection.',
          );
        const combined =
          service === 'soundcloud' && current.model.combine
            ? remaining.filter((step) => step.type.startsWith('soundcloud-'))
            : [step];
        const commentRequired = combined.some((step) => step.type === 'soundcloud-comment');
        const comment = soundcloudComment(current.preferences?.soundcloudComment);
        if (commentRequired && !comment) {
          delete current.pending;
          delete current.progress;
          return fail(
            'input-required',
            'Save your SoundCloud comment in Gatebreaker before connecting MyPressKit. It may be posted publicly.',
          );
        }
        const pending: Pending = {
          id: `mypresskit-${service}-${combined.length > 1 ? 'combo' : step.index}`,
          service,
          indexes: combined.map((step) => step.index),
          step: combined.length > 1 ? -1 : step.index,
          ...(commentRequired && comment ? { comment } : {}),
        };
        if (current.pending?.id !== pending.id || current.progress?.state === 'complete')
          delete current.progress;
        current.pending = pending;
        return fail(
          'server-required',
          `MyPressKit requires ${service === 'soundcloud' ? 'SoundCloud' : 'Spotify'} authorization. Review and complete its sign-in action.`,
        );
      }
      return fail('server-required', 'MyPressKit did not finish verifying this gate.');
    } catch (error) {
      context.signal?.throwIfAborted();
      return error instanceof ProtocolError
        ? fail(error.code, error.message)
        : fail(
            'network-error',
            'MyPressKit could not finish the request. Check your connection and retry.',
          );
    }
  },
};
