import type {
  Gate,
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
} from '../domain/provider';
import { readLimitedText } from './shared/read-text';

export const clickAcknowledgements = new Set([
  'twitter-follow',
  'youtube-subscribe',
  'soundcloud-follow',
  'instagram-follow',
  'tiktok-follow',
]);
const spotifyLabels: Readonly<Record<string, readonly [string, string]>> = {
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
interface NativeConfirmation {
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
const documents = new WeakMap<Document, PushSession>();
const gates = new WeakMap<Gate, PushSession>();

function session(document: Document): PushSession {
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
function object(value: unknown): value is Record<string, unknown> {
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
function oauthAction(action: PushAction): boolean {
  return (
    !!spotifyLabels[action.driver] &&
    !action.provider.client_authentication &&
    !action.provider.client_execution
  );
}
function nativeButton(document: Document, driver: string): HTMLButtonElement | null {
  const labels = spotifyLabels[driver];
  if (!labels) return null;
  const matches = [...document.querySelectorAll<HTMLButtonElement>('button.btn-spotify')].filter(
    (button) => {
      const text = button.textContent?.replace(/\s+/g, ' ').trim();
      return text === labels[0] || text === labels[1];
    },
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** Required or minimum-count login choices, after every account-free native action. */
function requiredOAuth(model: PushModel): readonly PushAction[] {
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
export function pushActions(document: Document): readonly GateAction[] {
  const current = session(document);
  if (!current.authRequired) return [];
  if (current.model) {
    return requiredOAuth(current.model).map((action) => ({
      id: `push-login-${action.driver}`,
      kind: 'sign-in',
      label: `Sign in with Spotify: ${spotifyLabels[action.driver]![0]}`,
      description: 'Uses PUSH.fm’s Spotify window. Review its requested actions and permissions.',
      required: true,
    }));
  }
  // Native asterisks represent explicit requirements or a minimum equal to all steps.
  // The metadata API is deliberately not requested while inspecting the page.
  return Object.entries(spotifyLabels).flatMap(([driver, labels]) => {
    const button = nativeButton(document, driver);
    return button?.closest('.action-required')
      ? [
          {
            id: `push-login-${driver}`,
            kind: 'sign-in' as const,
            label: `Sign in with Spotify: ${labels[0]}`,
            description:
              'Uses PUSH.fm’s Spotify window. Review its requested actions and permissions.',
            required: true,
          },
        ]
      : [];
  });
}

/** Listen only to PUSH gate receipts, never account credentials or provider OAuth tokens. */
function listen(current: PushSession): void {
  const view = current.document.defaultView;
  if (!view || current.listening) return;
  current.listening = true;
  view.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.origin !== 'https://push.fm' ||
      !event.source ||
      event.source === view ||
      !object(event.data)
    )
      return;
    const driver = event.data['driver'];
    if (typeof driver !== 'string') return;
    const pending = current.pending.get(driver);
    if (
      !pending ||
      !pending.ready ||
      event.source !== pending.popup ||
      Date.now() - pending.started > 120000 ||
      documents.get(current.document) !== current
    )
      return;
    if (event.data['error']) {
      pending.error = true;
      return;
    }
    const token = event.data['token'];
    if (
      typeof token === 'string' &&
      token.length > 0 &&
      token.length <= 8192 &&
      !/[\u0000-\u0020\u007f]/.test(token)
    )
      pending.token = token;
  });
}
export function performPushAction(
  id: string,
  document: Document,
  mode: GateActionMode,
): GateActionResult {
  const action = pushActions(document).find((action) => action.id === id);
  const driver = id.slice('push-login-'.length);
  if (!action)
    return {
      ok: false,
      message: 'This PUSH.fm sign-in is unavailable. Reload the gate.',
    };
  if (mode !== 'activate')
    return {
      ok: false,
      message: 'Use the sign-in button to open PUSH.fm’s Spotify window.',
    };
  const current = session(document);
  if (current.completed[driver] || pushActionProgress(id, document)?.state === 'complete')
    return { ok: true, message: 'PUSH.fm has confirmed this Spotify step.' };
  const pending = current.pending.get(driver);
  if (pending && !pending.error && !pending.popup.closed && Date.now() - pending.started <= 120000)
    return {
      ok: true,
      message: 'Complete sign-in in the existing PUSH.fm window.',
    };
  // Reserve the owned window synchronously while the user's activation is present.
  const popup = document.defaultView?.open('about:blank', '_blank', 'popup,width=720,height=480');
  if (!popup) return { ok: false, message: 'Allow this sign-in popup, then try again.' };
  const confirmation: NativeConfirmation = {
    driver,
    popup,
    started: Date.now(),
  };
  current.pending.set(driver, confirmation);
  listen(current);
  void openNativeAction(current, confirmation);
  return {
    ok: true,
    message: 'Complete sign-in in PUSH.fm’s Spotify window, then return here.',
  };
}
/** Load public gate metadata only; OAuth credentials remain in the native window. */
async function openNativeAction(current: PushSession, pending: NativeConfirmation): Promise<void> {
  try {
    const slug = current.gateId;
    if (!slug || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(slug)) throw new Error('Invalid gate');
    const endpoint = `https://push.fm/api/guest/unlock/${encodeURIComponent(slug)}`;
    const response = await (
      current.document.defaultView?.fetch?.bind(current.document.defaultView) ?? globalThis.fetch
    )(endpoint, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (
      !response.ok ||
      response.redirected ||
      (response.url && response.url !== endpoint) ||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')
    )
      throw new Error('Metadata unavailable');
    const value: unknown = JSON.parse(await readLimitedText(response, 256 * 1024));
    if (!object(value) || value['slug'] !== slug || value['isSoftDeleted'] === true)
      throw new Error('Wrong gate');
    const model = pushModel(value);
    const action = model && requiredOAuth(model).find((action) => action.driver === pending.driver);
    if (
      !model ||
      !action ||
      !oauthAction(action) ||
      documents.get(current.document) !== current ||
      current.pending.get(pending.driver) !== pending ||
      pending.popup.closed
    )
      throw new Error('Action unavailable');
    current.model = model;
    // The exact public Eo mixin opens this GET route for server-managed auth/actions.
    pending.ready = true;
    pending.popup.location.replace(
      `https://push.fm/unlock/${encodeURIComponent(slug)}/action/${action.id}`,
    );
  } catch {
    pending.error = true;
    try {
      pending.popup.close();
    } catch {
      /* Window ownership may have ended. */
    }
  }
}
/** Reuse only PUSH's own completed receipt for this exact gate and native driver. */
function nativeCookieReceipt(current: PushSession, driver: string): string | null {
  const slug = current.gateId;
  if (!slug || !Object.hasOwn(spotifyLabels, driver)) return null;
  try {
    const prefix = `${slug}=`;
    const cookie = current.document.cookie
      .split(';')
      .map((value) => value.trimStart())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length);
    if (!cookie || cookie.length > 16 * 1024) return null;
    const state: unknown = JSON.parse(cookie);
    if (!object(state) || !Object.hasOwn(state, `${slug}${driver}`)) return null;
    const receipt: unknown = state[`${slug}${driver}`];
    if (
      !object(receipt) ||
      Object.keys(receipt).length !== 3 ||
      receipt['link'] !== `cu/${slug}` ||
      receipt['serviceId'] !== `${slug}${driver}` ||
      !object(receipt['status']) ||
      Object.keys(receipt['status']).length !== 2 ||
      receipt['status']['driver'] !== driver
    )
      return null;
    const token = receipt['status']['token'];
    return typeof token === 'string' &&
      token.length > 0 &&
      token.length <= 8192 &&
      !/[\u0000-\u0020\u007f]/.test(token)
      ? token
      : null;
  } catch {
    // Disabled storage, an expired receipt, or a changed native shape is not sign-in proof.
    return null;
  }
}

export function pushActionProgress(id: string, document: Document): GateActionProgress | null {
  const driver = id.slice('push-login-'.length);
  const current = session(document);
  const button = nativeButton(document, driver);
  if (!pushActions(document).some((action) => action.id === id)) return null;
  if (button?.disabled && !current.completed[driver]) {
    const restored = nativeCookieReceipt(current, driver);
    if (restored) {
      current.completed[driver] = restored;
      current.pending.delete(driver);
    }
  }
  const pending = current.pending.get(driver);
  if (pending?.error)
    return {
      state: 'error',
      message: 'PUSH.fm could not confirm this Spotify step. Try signing in again.',
    };
  // New receipts require the exact owned source, origin and driver callback.
  if (pending?.token) {
    current.completed[driver] = pending.token;
    current.pending.delete(driver);
  }
  if (pending && pending.popup.closed && !current.completed[driver])
    return {
      state: 'error',
      message: 'The PUSH.fm sign-in window closed without a confirmed gate receipt. Try again.',
    };
  return current.completed[driver]
    ? { state: 'complete', message: 'PUSH.fm confirmed this Spotify step.' }
    : {
        state: 'waiting',
        message: 'Complete sign-in in PUSH.fm’s Spotify window.',
      };
}

export function pushCsrf(current: PushSession): string | null {
  const value = current.document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  return value && /^[\x21-\x7e]{16,4096}$/.test(value) ? value : null;
}
