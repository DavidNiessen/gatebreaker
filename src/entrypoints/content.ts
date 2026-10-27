import { GateResolver } from '../application/resolve-gate';
import { GateActions } from '../application/gate-actions';
import type {
  GateActionMode,
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
let progress: ResolutionProgress | null = null;
let panel: GatePanel | null = null;
let identity = '';
let generation = 0;
let controller: AbortController | undefined;
let settingsChanged = false;
let actionMessage: string | null = null;
let preparedEmail: string | null = null;
let websiteSession = false;
let nativeStyle: HTMLStyleElement | null = null;
const subscribers = new Set<chrome.runtime.Port>();
let publishedState = '';
const startedActions = new Map<
  string,
  { startedAt: number; progress?: GateActionProgress; timer?: ReturnType<typeof setTimeout> }
>();

function actionStates(): Readonly<Record<string, GateActionProgress>> {
  const states: Record<string, GateActionProgress> = {};
  for (const [id, tracked] of startedActions) {
    const observed = actions.progress(id, document, new URL(location.href));
    if (
      observed &&
      (observed.state !== tracked.progress?.state || observed.message !== tracked.progress?.message)
    ) {
      tracked.progress = observed;
      actionMessage = observed.message;
    }
    if (
      !tracked.progress &&
      Date.now() - tracked.startedAt > (id === 'prepare-email' ? 15000 : 120000)
    )
      tracked.progress = {
        state: 'error',
        message: 'Hypeddit has not confirmed this step. You can try it again.',
      };
    states[id] = tracked.progress ?? {
      state: 'waiting',
      message:
        id === 'prepare-email'
          ? 'Waiting for Hypeddit to accept the email…'
          : 'Finish sign-in in Hypeddit’s window, then return here.',
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
  const states = actionStates();
  return {
    enabled,
    busy,
    gate,
    providerName: match?.provider.name ?? null,
    progress,
    result,
    actions: actions.list(document, new URL(location.href)),
    actionMessage,
    preparedEmail,
    actionStates: states,
    websiteSession,
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
    progress = null;
    actionMessage = null;
    preparedEmail = null;
    websiteSession = false;
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
      );
  }
  const next = status();
  panel?.update(next);
  publish(next);
}

function performAction(id: unknown, mode: GateActionMode): PageStatus {
  if (!enabled || busy) return status();
  if (typeof id === 'string') {
    const observed = actions.progress(id, document, new URL(location.href));
    if (observed?.state === 'complete') {
      startedActions.set(id, { startedAt: Date.now(), progress: observed });
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
  actionMessage = performed.message;
  if (performed.value) preparedEmail = performed.value;
  if (performed.ok && typeof id === 'string') {
    websiteSession = true;
    const previous = startedActions.get(id);
    if (previous?.timer) clearTimeout(previous.timer);
    const timer = setTimeout(reconcile, id === 'prepare-email' ? 15100 : 120100);
    startedActions.set(id, { startedAt: Date.now(), timer });
  }
  reconcile();
  return status();
}

async function resolve(nativeActions = true): Promise<PageStatus> {
  if (!enabled || busy || (nativeActions && actionStates()['prepare-email']?.state === 'waiting'))
    return status();
  reconcile();
  const requestIdentity = identity;
  const requestGeneration = generation;
  controller = new AbortController();
  const requestController = controller;
  busy = true;
  result = null;
  progress = null;
  reconcile();
  const next = await resolver.resolve(document, {
    pageUrl: new URL(location.href),
    fetch: globalThis.fetch.bind(globalThis),
    signal: controller.signal,
    onProgress: (value) => {
      if (
        !enabled ||
        requestController.signal.aborted ||
        identity !== requestIdentity ||
        generation !== requestGeneration
      )
        return;
      progress = {
        message: value.message.slice(0, 300),
        ...(typeof value.remainingSeconds === 'number' && Number.isFinite(value.remainingSeconds)
          ? { remainingSeconds: Math.max(0, Math.ceil(value.remainingSeconds)) }
          : {}),
      };
      reconcile();
    },
    intent: nativeActions && websiteSession ? 'website-session' : 'direct',
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
  busy = false;
  progress = null;
  reconcile();
  if (identity === requestIdentity && generation === requestGeneration && enabled) result = next;
  if (
    nativeActions &&
    result &&
    !result.ok &&
    result.code === 'server-required' &&
    !startedActions.has('prepare-email') &&
    actions
      .list(document, new URL(location.href))
      .some((action) => action.id === 'prepare-email' && action.required)
  )
    performAction('prepare-email', 'activate');
  reconcile();
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
    enabled = changes['enabled'].newValue !== false;
    result = null;
    progress = null;
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
    if (!enabled || !(event.target instanceof Element)) return;
    const presentation = actions.presentation(document, new URL(location.href));
    if (!presentation || !event.target.closest(presentation.startControl)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void resolve();
  },
  true,
);
