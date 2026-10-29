import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { soundcloudComment } from '../domain/preferences';
import { safeHttpsUrl } from '../domain/urls';
import { automaticEmail } from './shared/automatic-email';
import { readLimitedText } from './shared/read-text';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const identifier = /^[A-Za-z0-9_-]{1,80}$/;
const ordinary = new Set([
  'instagram_follow',
  'tiktok_follow',
  'twitter_follow',
  'youtube_follow',
  'website_visit',
]);
const soundcloud = new Set([
  'soundcloud_follow',
  'soundcloud_follow_artist',
  'soundcloud_like',
  'soundcloud_repost',
  'soundcloud_comment',
  'soundcloud_bundle',
]);
export interface StillhypeStep {
  readonly id: string;
  readonly type: string;
  readonly required: boolean;
  readonly targetUser: string;
  readonly targetTrack: string;
  readonly comment: boolean;
  readonly units: readonly string[];
}
export interface StillhypeSession {
  readonly document: Document;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly external: boolean;
  readonly steps: readonly StillhypeStep[];
  readonly completed: Set<string>;
  fan?: string;
  authStep?: StillhypeStep;
  comment?: string;
}
export const documents = new WeakMap<Document, StillhypeSession>();
export const gates = new WeakMap<Gate, StillhypeSession>();
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function slugFromUrl(url: URL): string | null {
  if (
    url.protocol !== 'https:' ||
    !['stillhype.io', 'www.stillhype.io'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    return null;
  return /^\/g\/([A-Za-z0-9_-]{1,240})\/?$/.exec(url.pathname)?.[1] ?? null;
}
function campaign(document: Document): Record<string, unknown> | null {
  let text = '';
  const scripts = document.querySelectorAll('script:not([src])');
  if (scripts.length > 128) return null;
  for (const script of scripts) {
    const source = script.textContent ?? '';
    if (source.length > 2 * 1024 * 1024) return null;
    const match = /^self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?$/.exec(source.trim());
    if (!match) continue;
    try {
      const value: unknown = JSON.parse(match[1]!);
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        value[0] === 1 &&
        typeof value[1] === 'string'
      )
        text += value[1];
    } catch {
      return null;
    }
    if (text.length > 2 * 1024 * 1024) return null;
  }
  const needle = '"campaign":';
  const offset = text.indexOf(needle);
  if (offset < 0 || text.indexOf(needle, offset + needle.length) >= 0) return null;
  const start = offset + needle.length;
  if (text[start] !== '{') return null;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const value: unknown = JSON.parse(text.slice(start, index + 1));
        return object(value) ? value : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
function model(document: Document, slug: string): StillhypeSession | null {
  const data = campaign(document);
  if (
    !data ||
    data['slug'] !== slug ||
    typeof data['id'] !== 'string' ||
    !uuid.test(data['id']) ||
    data['is_published'] !== true ||
    typeof data['title'] !== 'string' ||
    !data['title'].trim() ||
    data['title'].length > 2000 ||
    !Array.isArray(data['gate_steps']) ||
    data['gate_steps'].length > 32 ||
    (data['is_external_download'] !== undefined &&
      typeof data['is_external_download'] !== 'boolean')
  )
    return null;
  const steps: StillhypeStep[] = [],
    seen = new Set<string>();
  for (const raw of data['gate_steps']) {
    if (
      !object(raw) ||
      typeof raw['id'] !== 'string' ||
      !identifier.test(raw['id']) ||
      seen.has(raw['id']) ||
      typeof raw['type'] !== 'string' ||
      !identifier.test(raw['type']) ||
      typeof raw['required'] !== 'boolean'
    )
      return null;
    seen.add(raw['id']);
    const targetUser = typeof raw['target_user_id'] === 'string' ? raw['target_user_id'] : '';
    const targetTrack = typeof raw['target_track_id'] === 'string' ? raw['target_track_id'] : '';
    if (targetUser.length > 2048 || targetTrack.length > 2048) return null;
    const units = [raw['id']];
    if (
      ordinary.has(raw['type']) &&
      Array.isArray(raw['follow_accounts']) &&
      raw['follow_accounts'].length > 1
    ) {
      if (raw['follow_accounts'].length > 20) return null;
      units.splice(0);
      for (const account of raw['follow_accounts']) {
        if (
          !object(account) ||
          typeof account['url'] !== 'string' ||
          account['url'].length > 2048 ||
          !safeHttpsUrl(account['url'])
        )
          return null;
        units.push(`${raw['id']}:${encodeURIComponent(account['url'])}`);
      }
      if (new Set(units).size !== units.length) return null;
    }
    steps.push({
      id: raw['id'],
      type: raw['type'],
      required: raw['required'],
      targetUser,
      targetTrack,
      comment:
        raw['type'] === 'soundcloud_comment' ||
        (raw['type'] === 'soundcloud_bundle' && raw['sc_comment'] === true),
      units,
    });
  }
  return {
    document,
    id: data['id'],
    slug,
    title: data['title'].trim().slice(0, 200),
    external: data['is_external_download'] === true,
    steps,
    completed: new Set(),
  };
}
export function session(document: Document, url: URL): StillhypeSession | null {
  const slug = slugFromUrl(url);
  if (!slug) return null;
  const current = model(document, slug);
  if (!current) return null;
  let stored = documents.get(document);
  if (
    !stored ||
    stored.id !== current.id ||
    JSON.stringify(stored.steps) !== JSON.stringify(current.steps)
  ) {
    stored = current;
    documents.set(document, stored);
  }
  return stored;
}
export function inspect(document: Document, url: URL): Gate | null {
  const current = session(document, url);
  if (!current) return null;
  const gate: Gate = {
    provider: 'stillhype',
    id: current.id,
    title: current.title,
    steps: current.steps.map((step) => step.type),
    metadata: {},
    ...(current.steps.some((step) => step.required && step.comment)
      ? { inputs: [{ kind: 'soundcloud-comment' as const, required: true as const }] }
      : {}),
  };
  gates.set(gate, current);
  return gate;
}
export async function post(
  current: StillhypeSession,
  path: 'init' | 'submit-email' | 'mark-complete' | 'sc-action' | 'verify-action' | 'unlock',
  body: Record<string, unknown>,
  context: ProviderContext,
): Promise<{ value: Record<string, unknown>; status: number }> {
  context.signal?.throwIfAborted();
  const response = await context.fetch(new URL(`/api/gate/${path}`, context.pageUrl).href, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, campaign_id: current.id }),
  });
  context.signal?.throwIfAborted();
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new Error('Unexpected native response');
  }
  const value: unknown = JSON.parse(await readLimitedText(response, 64 * 1024));
  if (!object(value)) throw new Error('Invalid native response');
  return { value, status: response.status };
}
function rememberCompletions(current: StillhypeSession, completed: unknown): void {
  const known = new Set(current.steps.flatMap((step) => [...step.units]));
  if (Array.isArray(completed))
    for (const id of completed)
      if (typeof id === 'string' && known.has(id)) current.completed.add(id);
}
function refused(status: number): Resolution {
  return status === 429
    ? fail('rate-limited', 'StillHype is limiting requests. Try again later.')
    : [401, 403].includes(status)
      ? fail('server-required', 'StillHype requires its native sign-in or verification.')
      : fail('invalid-response', 'StillHype did not confirm the required gate step.');
}
export async function verifySoundcloud(
  current: StillhypeSession,
  step: StillhypeStep,
  context: ProviderContext,
): Promise<boolean> {
  if (!current.fan) return false;
  const result = await post(
    current,
    'verify-action',
    {
      fan_id: current.fan,
      step_id: step.id,
      comment_text: step.comment ? (current.comment ?? null) : null,
    },
    context,
  );
  if (result.status === 429) throw new Error('Rate limited');
  if (result.status >= 200 && result.status < 300 && result.value['verified'] === true) {
    current.completed.add(step.id);
    return true;
  }
  return false;
}
export function authorizationUrl(current: StillhypeSession, pageUrl: URL): string | null {
  const step = current.authStep;
  if (!step || !current.fan || !uuid.test(current.fan) || !slugFromUrl(pageUrl)) return null;
  const url = new URL('/api/oauth/soundcloud', pageUrl);
  url.search = new URLSearchParams({
    fan_id: current.fan,
    campaign_id: current.id,
    step_id: step.id,
    step_type: step.type,
    target_user_id: step.targetUser,
    target_track_id: step.targetTrack,
    ...(step.comment && current.comment ? { comment_text: current.comment } : {}),
  }).toString();
  return url.href;
}
export const stillhype: GateProvider = {
  id: 'stillhype',
  name: 'StillHype',
  matches: (url) => slugFromUrl(url) !== null,
  inspect,
  async resolve(gate, context) {
    const current = gates.get(gate);
    if (!current || current.id !== gate.id || current.slug !== slugFromUrl(context.pageUrl))
      return fail('not-supported', 'Open a current StillHype gate.');
    if (!context.automate)
      return fail('server-required', 'Choose Download to process this StillHype gate.');
    if (
      current.steps.some(
        (step) =>
          step.required &&
          !ordinary.has(step.type) &&
          !soundcloud.has(step.type) &&
          step.type !== 'email_capture',
      )
    )
      return fail('not-supported', 'This StillHype gate declares an unsupported required step.');
    const comment = soundcloudComment(context.preferences?.soundcloudComment);
    if (current.steps.some((step) => step.required && step.comment) && !comment)
      return fail(
        'input-required',
        'Save your SoundCloud comment in Gatebreaker. StillHype may post it publicly after sign-in.',
      );
    if (comment) current.comment = comment;
    if (!current.fan) {
      const existing = context.readNativeSession?.('stillhype', current.id);
      const initialized = await post(
        current,
        'init',
        { existing_fan_id: existing && uuid.test(existing) ? existing : null },
        context,
      );
      if (initialized.status < 200 || initialized.status >= 300) return refused(initialized.status);
      const fan = initialized.value['fan_id'];
      if (typeof fan !== 'string' || !uuid.test(fan))
        return fail('invalid-response', 'StillHype did not return a valid gate session.');
      current.fan = fan;
      rememberCompletions(current, initialized.value['completed_steps']);
    }
    const required = current.steps.filter((step) => step.required);
    const emailSteps = required.filter((step) => step.type === 'email_capture');
    // Native email capture establishes the fan identity before social steps.
    // A known email can legitimately replace the anonymous fan returned by init.
    if (emailSteps.some((step) => !current.completed.has(step.id))) {
      context.onProgress?.({ message: 'Preparing the StillHype email step...' });
      const result = await post(
        current,
        'submit-email',
        { fan_id: current.fan, name: 'Listener', email: automaticEmail },
        context,
      );
      if (result.status < 200 || result.status >= 300) return refused(result.status);
      const fan = result.value['fan_id'];
      if (typeof fan !== 'string' || !uuid.test(fan))
        return fail('invalid-response', 'StillHype did not confirm a valid email session.');
      if (fan !== current.fan) {
        current.fan = fan;
        current.completed.clear();
        delete current.authStep;
        const confirmed = await post(current, 'init', { existing_fan_id: fan }, context);
        if (confirmed.status < 200 || confirmed.status >= 300) return refused(confirmed.status);
        if (confirmed.value['fan_id'] !== fan)
          return fail(
            'invalid-response',
            'StillHype did not confirm its email session. Reload this gate.',
          );
        rememberCompletions(current, confirmed.value['completed_steps']);
      }
      for (const step of emailSteps) current.completed.add(step.id);
    }
    for (const step of required.filter((step) => step.type !== 'email_capture')) {
      context.signal?.throwIfAborted();
      if (step.units.every((id) => current.completed.has(id))) continue;
      context.onProgress?.({ message: 'Completing the current StillHype gate step...' });
      if (ordinary.has(step.type)) {
        for (const unit of step.units) {
          if (current.completed.has(unit)) continue;
          const result = await post(
            current,
            'mark-complete',
            { fan_id: current.fan, step_id: step.id, unit_id: unit },
            context,
          );
          if (result.status < 200 || result.status >= 300) return refused(result.status);
          current.completed.add(unit);
        }
      } else {
        const result = await post(
          current,
          'sc-action',
          {
            fan_id: current.fan,
            step_id: step.id,
            step_type: step.type,
            target_user_id: step.targetUser || null,
            target_track_id: step.targetTrack || null,
            comment_text: step.comment ? (current.comment ?? null) : null,
            confirm: false,
          },
          context,
        );
        if (result.status === 429) return refused(429);
        if (result.value['ok'] === true && result.status >= 200 && result.status < 300)
          current.completed.add(step.id);
        else if (result.value['needs_auth'] === true) {
          current.authStep = step;
          return fail('server-required', 'Sign in with SoundCloud through StillHype to continue.');
        } else
          return fail(
            'server-required',
            'StillHype requires a verified SoundCloud action or manual challenge. Complete its native verification.',
          );
      }
    }
    const result = await post(
      current,
      'unlock',
      { fan_id: current.fan, completed_steps: [...current.completed] },
      context,
    );
    if (result.status < 200 || result.status >= 300) return refused(result.status);
    const destination = safeHttpsUrl(result.value['download_url']);
    if (
      !destination ||
      destination.length > 16384 ||
      /\/storage\/v1\/object\/public\/(?:previews|covers)\//.test(new URL(destination).pathname) ||
      ['stillhype.io', 'www.stillhype.io'].includes(new URL(destination).hostname)
    )
      return fail(
        'unsafe-destination',
        'StillHype did not release a valid original download address.',
      );
    return {
      ok: true,
      url: destination,
      kind: current.external ? 'page' : 'file',
      method: 'provider-request',
    };
  },
};
