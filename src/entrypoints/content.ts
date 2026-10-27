import { deliveryTargets } from '../application/deliver';
import type { DeliveryState } from '../application/deliver';
import { GateResolver } from '../application/resolve-gate';
import {
  GateActions,
  pendingRequiredSignIns,
  waitForNativeAction,
} from '../application/gate-actions';
import type {
  GateActionMode,
  GateAction,
  GateActionProgress,
  Resolution,
  ResolutionProgress,
} from '../domain/provider';
import { fail } from '../domain/provider';
import { extension, isEnabled } from '../platform/browser';
import { messages, messageType } from '../platform/messages';
import type { PageStatus } from '../platform/messages';
import { providers } from '../providers';
import { createPanel } from '../ui/panel';
import type { GatePanel } from '../ui/panel';

const resolver = new GateResolver(providers);
const actions = new GateActions(providers);
let enabled = false;
let busy = false;
let result: Resolution | null = null;
let delivery: DeliveryState | null = null;
let progress: ResolutionProgress | null = null;
let cancelled = false;
let panel: GatePanel | null = null;
let identity = '';
let generation = 0;
let controller: AbortController | undefined;
let settingsChanged = false;
let actionMessage: string | null = null;
let preparedEmail: string | null = null;
let websiteSession = false;
let nativeStyle: HTMLStyleElement | null = null;
let actionRefresh: ReturnType<typeof setTimeout> | undefined;
let continuation: { identity: string; generation: number; required: readonly string[] } | undefined;
const subscribers = new Set<chrome.runtime.Port>();
let publishedState = '';
const startedActions = new Map<
  string,
  {
    startedAt: number;
    kind?: GateAction['kind'] | undefined;
    failed?: boolean;
    progress?: GateActionProgress;
    timer?: ReturnType<typeof setTimeout>;
  }
>();

function actionStates(): Readonly<Record<string, GateActionProgress>> {
  const states: Record<string, GateActionProgress> = {};
  for (const [id, tracked] of startedActions) {
    const observed = tracked.failed ? null : actions.progress(id, document, new URL(location.href));
    if (
      observed &&
      (observed.state !== tracked.progress?.state || observed.message !== tracked.progress?.message)
    ) {
      tracked.progress = observed;
      actionMessage = observed.message;
    }
    if (
      (!tracked.progress || tracked.progress.state === 'waiting') &&
      Date.now() - tracked.startedAt > (tracked.kind === 'email' ? 15000 : 120000)
    )
      tracked.progress = {
        state: 'error',
        message: 'The website has not confirmed this step. You can try it again.',
      };
    states[id] = tracked.progress ?? {
      state: 'waiting',
      message:
        tracked.kind === 'email'
          ? 'Waiting for Hypeddit to accept the email…'
          : 'Finish sign-in in the website’s window, then return here.',
    };
    if (tracked.progress && tracked.timer) clearTimeout(tracked.timer);
  }
  return states;
}

function status(): PageStatus {
  const match = resolver.inspect(document, new URL(location.href));
  const gate = match
    ? {
        provider: match.gate.provider,
        id: match.gate.id,
        title: match.gate.title,
        steps: match.gate.steps,
      }
    : null;
  const available = actions.list(document, new URL(location.href));
  const states = { ...actionStates() };
  for (const action of available) {
    const observed = actions.progress(action.id, document, new URL(location.href));
    if (!states[action.id] && observed) states[action.id] = observed;
  }
  return {
    enabled,
    busy,
    gate,
    providerName: match?.provider.name ?? null,
    progress,
    cancelled,
    result,
    delivery,
    actions: available,
    actionMessage,
    preparedEmail,
    actionStates: states,
    websiteSession,
    waitingForLogin: continuation !== undefined,
  };
}

function publish(state: PageStatus): void {
  const key = JSON.stringify(state);
  if (key === publishedState) return;
  publishedState = key;
  for (const subscriber of subscribers) {
    try {
      subscriber.postMessage(state);
    } catch {
      subscribers.delete(subscriber);
    }
  }
}

function reconcile(): void {
  const state = status();
  const nextIdentity = state.gate ? `${location.origin}${location.pathname}|${state.gate.id}` : '';
  if (nextIdentity !== identity) {
    generation++;
    controller?.abort();
    identity = nextIdentity;
    result = null;
    delivery = null;
    progress = null;
    cancelled = false;
    actionMessage = null;
    preparedEmail = null;
    websiteSession = false;
    continuation = undefined;
    clearTimeout(actionRefresh);
    actionRefresh = undefined;
    for (const tracked of startedActions.values()) if (tracked.timer) clearTimeout(tracked.timer);
    startedActions.clear();
    panel?.remove();
    panel = null;
  }
  if (!enabled || !state.gate) {
    panel?.remove();
    panel = null;
    nativeStyle?.remove();
    nativeStyle = null;
    publish(status());
    return;
  }
  const presentation = actions.presentation(document, new URL(location.href));
  if (!nativeStyle?.isConnected && presentation) {
    nativeStyle = document.createElement('style');
    document.head.append(nativeStyle);
  }
  const css = presentation?.hiddenSelectors.length
    ? `${presentation.hiddenSelectors.join(',')}{display:none!important}`
    : '';
  if (nativeStyle && nativeStyle.textContent !== css) nativeStyle.textContent = css;
  if (!panel || !document.getElementById('gatebreaker-panel')) {
    const anchor = presentation?.anchor;
    if (anchor)
      panel = createPanel(
        anchor,
        () => {
          void resolve();
        },
        (id) => {
          performAction(id, 'activate');
        },
        cancelCheck,
      );
  }
  const next = status();
  panel?.update(next);
  publish(next);
  if (
    enabled &&
    [...startedActions.keys()].some((id) => next.actionStates?.[id]?.state === 'waiting') &&
    actionRefresh === undefined
  ) {
    actionRefresh = setTimeout(() => {
      actionRefresh = undefined;
      reconcile();
    }, 200);
  }
  const pending = continuation;
  if (
    pending &&
    !busy &&
    enabled &&
    identity === pending.identity &&
    generation === pending.generation &&
    pending.required.every((id) => next.actionStates?.[id]?.state === 'complete')
  ) {
    continuation = undefined;
    queueMicrotask(() => {
      if (enabled && identity === pending.identity && generation === pending.generation)
        void resolve();
    });
  }
}

function performAction(id: unknown, mode: GateActionMode, automatic = false): PageStatus {
  if (!enabled || (busy && !automatic)) return status();
  cancelled = false;
  if (typeof id === 'string') {
    const observed = actions.progress(id, document, new URL(location.href));
    if (observed?.state === 'complete') {
      startedActions.set(id, {
        startedAt: Date.now(),
        kind: actions.list(document, new URL(location.href)).find((action) => action.id === id)
          ?.kind,
        progress: observed,
      });
      websiteSession = true;
      actionMessage = observed.message;
      reconcile();
      return status();
    }
    const progress = actionStates()[id];
    if (progress?.state === 'complete' || (id === 'prepare-email' && progress?.state === 'waiting'))
      return status();
  }
  const performed = actions.perform(id, document, new URL(location.href), mode);
  result = null;
  delivery = null;
  actionMessage = performed.message;
  if (performed.value) preparedEmail = performed.value;
  if (!performed.ok && typeof id === 'string') {
    const previous = startedActions.get(id);
    if (previous?.timer) clearTimeout(previous.timer);
    startedActions.set(id, {
      startedAt: Date.now(),
      failed: true,
      progress: { state: 'error', message: performed.message },
    });
  }
  if (performed.ok && typeof id === 'string') {
    websiteSession = true;
    const previous = startedActions.get(id);
    if (previous?.timer) clearTimeout(previous.timer);
    const kind = actions
      .list(document, new URL(location.href))
      .find((action) => action.id === id)?.kind;
    const timer = setTimeout(reconcile, kind === 'email' ? 15100 : 120100);
    startedActions.set(id, { startedAt: Date.now(), kind, timer });
  }
  reconcile();
  return status();
}

function cancelCheck(): PageStatus {
  if ((!busy && !continuation) || controller?.signal.aborted) return status();
  generation++;
  continuation = undefined;
  cancelled = true;
  progress = null;
  controller?.abort();
  reconcile();
  return status();
}

async function resolve(nativeActions = true): Promise<PageStatus> {
  if (!enabled || busy) return status();
  reconcile();
  const initial = status();
  if (nativeActions && pendingRequiredSignIns(initial.actions, initial.actionStates).length) {
    result = null;
    delivery = null;
    progress = null;
    reconcile();
    return status();
  }
  continuation = undefined;
  const requestIdentity = identity;
  const requestGeneration = generation;
  controller = new AbortController();
  const requestController = controller;
  busy = true;
  result = null;
  delivery = null;
  progress = null;
  cancelled = false;
  reconcile();
  const current = () =>
    enabled &&
    identity === requestIdentity &&
    generation === requestGeneration &&
    !requestController.signal.aborted;
  const pauseForLogins = () => {
    const state = status();
    const required = pendingRequiredSignIns(state.actions, state.actionStates);
    if (!required.length) return false;
    continuation = {
      identity: requestIdentity,
      generation: requestGeneration,
      required: required.map((action) => action.id),
    };
    result = null;
    delivery = null;
    progress = null;
    actionMessage = 'Complete the required sign-in below. Download will continue automatically.';
    return true;
  };
  const run = async () => {
    if (nativeActions) {
      const emailActions = actions
        .list(document, new URL(location.href))
        .filter((action) => action.kind === 'email');
      for (const action of emailActions) {
        if (!current()) return;
        if (actions.progress(action.id, document, new URL(location.href))?.state === 'complete')
          continue;
        let tracked = startedActions.get(action.id);
        if (actionStates()[action.id]?.state !== 'waiting') {
          progress = { message: 'Submitting the generated email through the website…' };
          performAction(action.id, 'activate', true);
          tracked = startedActions.get(action.id);
        }
        if (!tracked) {
          result = fail(
            'server-required',
            actionMessage ?? 'The website could not submit its email step.',
          );
          return;
        }
        const outcome = await waitForNativeAction(
          () => actionStates()[action.id] ?? null,
          requestController.signal,
        );
        if (!current()) return;
        tracked.progress = outcome;
        actionMessage = outcome.message;
        if (outcome.state !== 'complete') return;
      }
      if (pauseForLogins()) return;
    }
    const state = status();
    const nativeComplete =
      websiteSession ||
      Object.values(state.actionStates ?? {}).some((value) => value.state === 'complete');
    const next = await resolver.resolve(document, {
      pageUrl: new URL(location.href),
      fetch: globalThis.fetch.bind(globalThis),
      signal: requestController.signal,
      automate: nativeActions,
      onProgress: (value) => {
        if (!current()) return;
        progress = {
          message: value.message.slice(0, 300),
          ...(typeof value.remainingSeconds === 'number' && Number.isFinite(value.remainingSeconds)
            ? { remainingSeconds: Math.max(0, Math.ceil(value.remainingSeconds)) }
            : {}),
        };
        reconcile();
      },
      intent: nativeActions && nativeComplete ? 'website-session' : 'direct',
      probePublicFile: async (gateId) => {
        const response: unknown = await extension.runtime.sendMessage({
          type: messages.publicFile,
          gateId,
        });
        return response &&
          typeof response === 'object' &&
          'url' in response &&
          typeof response.url === 'string'
          ? response.url
          : null;
      },
    });
    if (!current()) return;
    result = next;
    if (nativeActions && !next.ok) pauseForLogins();
    if (
      nativeActions &&
      next.ok &&
      !pendingRequiredSignIns(status().actions, status().actionStates).length
    ) {
      const targets = deliveryTargets(next);
      if (!targets) {
        delivery = {
          state: 'failed',
          files: 0,
          message: 'The download address could not be validated. Reload the gate and try again.',
        };
        return;
      }
      progress = { message: 'Starting the download…' };
      reconcile();
      const operation = crypto.randomUUID();
      const stopDelivery = () => {
        try {
          void extension.runtime
            .sendMessage({ type: messages.cancelDelivery, operation })
            .catch(() => {});
        } catch {
          /* A reloaded extension cannot accept the cancellation message. */
        }
      };
      requestController.signal.addEventListener('abort', stopDelivery, { once: true });
      try {
        const receipt: unknown = await extension.runtime.sendMessage({
          operation,
          type: messages.deliver,
          result: next,
        });
        if (!current()) return;
        delivery =
          receipt &&
          typeof receipt === 'object' &&
          'state' in receipt &&
          (receipt.state === 'started' || receipt.state === 'failed') &&
          'files' in receipt &&
          typeof receipt.files === 'number' &&
          Number.isInteger(receipt.files) &&
          receipt.files >= 0 &&
          receipt.files <= 20 &&
          'message' in receipt &&
          typeof receipt.message === 'string' &&
          receipt.message.length <= 300
            ? (receipt as DeliveryState)
            : {
                state: 'failed',
                files: 0,
                message:
                  'The browser could not start the download. Use the link below to try again.',
              };
      } catch {
        if (current())
          delivery = {
            state: 'failed',
            files: 0,
            message: 'The browser could not start the download. Use the link below to try again.',
          };
      } finally {
        requestController.signal.removeEventListener('abort', stopDelivery);
      }
    }
  };
  try {
    await run();
  } catch {
    if (current())
      result = fail(
        'network-error',
        'The request could not finish. Reload the gate and try again.',
      );
  } finally {
    if (controller === requestController) {
      busy = false;
      progress = null;
    }
    reconcile();
  }
  return status();
}

extension.runtime.onMessage.addListener((value: unknown, sender, respond) => {
  if (sender.id !== extension.runtime.id || sender.url !== extension.runtime.getURL('popup.html'))
    return false;
  const type = messageType(value);
  if (type === messages.status) {
    reconcile();
    respond(status());
    return false;
  }
  if (type === messages.resolve) {
    void resolve((value as Record<string, unknown>)['anonymousOnly'] !== true)
      .then(respond)
      .catch(() => {
        busy = false;
        progress = null;
        result = fail(
          'network-error',
          'The request could not finish. Reload the gate and try again.',
        );
        reconcile();
        respond(status());
      });
    return true;
  }
  if (type === messages.action) {
    respond(performAction((value as Record<string, unknown>)['action'], 'activate'));
    return false;
  }
  if (type === messages.cancel) {
    respond(cancelCheck());
    return false;
  }
  return false;
});

extension.runtime.onConnect?.addListener((port) => {
  if (
    port.name !== 'gatebreaker:popup' ||
    port.sender?.id !== extension.runtime.id ||
    port.sender.url !== extension.runtime.getURL('popup.html')
  ) {
    port.disconnect();
    return;
  }
  subscribers.add(port);
  port.onDisconnect.addListener(() => {
    subscribers.delete(port);
  });
  port.postMessage(status());
});

extension.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['enabled']) {
    settingsChanged = true;
    generation++;
    controller?.abort();
    continuation = undefined;
    clearTimeout(actionRefresh);
    actionRefresh = undefined;
    enabled = changes['enabled'].newValue !== false;
    result = null;
    delivery = null;
    progress = null;
    cancelled = false;
    actionMessage = null;
    preparedEmail = null;
    reconcile();
  }
});

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver(() => {
  if (refreshTimer !== undefined) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    reconcile();
  }, 200);
});

void isEnabled()
  .then((value) => {
    if (!settingsChanged) enabled = value;
    reconcile();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled', 'hidden'],
    });
  })
  .catch(() => {
    /* Extension may have been reloaded while this tab was open. */
  });

window.addEventListener('popstate', reconcile);
window.addEventListener('focus', reconcile);
window.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted || !enabled || !(event.target instanceof Element)) return;
    const presentation = actions.presentation(document, new URL(location.href));
    if (!presentation || !event.target.closest(presentation.startControl)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void resolve();
  },
  true,
);
