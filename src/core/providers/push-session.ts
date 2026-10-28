import type { Gate } from '../domain/provider';

export const clickAcknowledgements = new Set([
  'twitter-follow',
  'youtube-subscribe',
  'soundcloud-follow',
  'instagram-follow',
  'tiktok-follow',
]);
export const spotifyLabels: Readonly<Record<string, readonly [string, string]>> = {
  'spotify-save': ['Save on Spotify', 'Saved on Spotify'],
  'spotify-follow': ['Follow on Spotify', 'Followed on Spotify'],
  'spotify-follow-playlist': ['Follow playlist on Spotify', 'Followed playlist on Spotify'],
  'spotify-play': ['Play on Spotify', 'Playing on Spotify'],
};

export interface PushAction {
  readonly id: number;
  readonly driver: string;
  readonly required: boolean;
  readonly provider: {
    readonly client_authentication: boolean;
    readonly client_execution: boolean;
  };
}
export interface PushModel {
  readonly actions: readonly PushAction[];
  readonly minimum: number;
}
export interface NativeConfirmation {
  readonly driver: string;
  readonly popup: Window;
  ready?: boolean;
  readonly started: number;
  token?: string;
  error?: boolean;
}
export interface PushSession {
  readonly document: Document;
  gateId?: string;
  readonly root: Element | null;
  model?: PushModel;
  authRequired?: boolean;
  readonly completed: Record<string, string>;
  readonly pending: Map<string, NativeConfirmation>;
  listening?: boolean;
}
export const documents = new WeakMap<Document, PushSession>();
const gates = new WeakMap<Gate, PushSession>();

export function session(document: Document): PushSession {
  let value = documents.get(document);
  const root =
    document.querySelector('#app') ??
    document.querySelector(
      'span.leading-normal.inline-block.w-full.text-xl.font-bold.text-black.break-word',
    )?.parentElement ??
    null;
  if (!value || value.root !== root) {
    value = {
      document,
      root,
      completed: Object.create(null) as Record<string, string>,
      pending: new Map(),
    };
    documents.set(document, value);
  }
  return value;
}
export function bindPushSession(gate: Gate, document: Document): Gate {
  let current = session(document);
  if (current.gateId && current.gateId !== gate.id) {
    documents.delete(document);
    current = session(document);
  }
  current.gateId = gate.id;
  gates.set(gate, current);
  return gate;
}
export function pushSession(gate: Gate): PushSession | undefined {
  return gates.get(gate);
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A bounded model from the exact current guest API; never infer OAuth from brand alone. */
export function pushModel(value: unknown): PushModel | null {
  if (
    !object(value) ||
    !Array.isArray(value['actions']) ||
    value['actions'].length > 32 ||
    !Number.isInteger(value['minimum_actions']) ||
    (value['minimum_actions'] as number) < 0 ||
    (value['minimum_actions'] as number) > value['actions'].length
  )
    return null;
  const drivers = new Set<string>();
  const ids = new Set<number>();
  const actions: PushAction[] = [];
  for (const action of value['actions']) {
    if (
      !object(action) ||
      !Number.isSafeInteger(action['id']) ||
      (action['id'] as number) < 1 ||
      ids.has(action['id'] as number) ||
      typeof action['driver'] !== 'string' ||
      !/^[a-z][a-z0-9-]{0,79}$/.test(action['driver']) ||
      drivers.has(action['driver']) ||
      typeof action['required'] !== 'boolean' ||
      !object(action['provider']) ||
      typeof action['provider']['client_authentication'] !== 'boolean' ||
      typeof action['provider']['client_execution'] !== 'boolean'
    )
      return null;
    drivers.add(action['driver']);
    ids.add(action['id'] as number);
    actions.push({
      id: action['id'] as number,
      driver: action['driver'],
      required: action['required'],
      provider: {
        client_authentication: action['provider']['client_authentication'],
        client_execution: action['provider']['client_execution'],
      },
    });
  }
  return { actions, minimum: value['minimum_actions'] as number };
}

export function ordinaryPushAction(action: PushAction): boolean {
  return (
    clickAcknowledgements.has(action.driver) &&
    action.provider.client_authentication &&
    action.provider.client_execution
  );
}
export function oauthAction(action: PushAction): boolean {
  return (
    !!spotifyLabels[action.driver] &&
    !action.provider.client_authentication &&
    !action.provider.client_execution
  );
}

/** Required or minimum-count login choices, after every account-free native action. */
export function requiredOAuth(model: PushModel): readonly PushAction[] {
  const result = model.actions.filter((action) => oauthAction(action) && action.required);
  const availableWithoutMoreLogins =
    model.actions.filter(ordinaryPushAction).length + result.length;
  const remaining = Math.max(0, model.minimum - availableWithoutMoreLogins);
  result.push(
    ...model.actions
      .filter((action) => oauthAction(action) && !action.required)
      .slice(0, remaining),
  );
  return result;
}

export function pushCsrf(current: PushSession): string | null {
  const value = current.document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  return value && /^[\x21-\x7e]{16,4096}$/.test(value) ? value : null;
}
