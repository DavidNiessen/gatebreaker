import { GateResolver } from '../application/resolve-gate';
import type { Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { extension, isEnabled } from '../platform/browser';
import { messages, messageType } from '../platform/messages';
import type { PageStatus } from '../platform/messages';
import { providers } from '../providers';
import { createPanel } from '../ui/panel';
import type { GatePanel } from '../ui/panel';

const resolver = new GateResolver(providers);
let enabled = false;
let busy = false;
let result: Resolution | null = null;
let panel: GatePanel | null = null;
let identity = '';
let generation = 0;
let controller: AbortController | undefined;
let settingsChanged = false;

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
  return { enabled, busy, gate, result };
}

function reconcile(): void {
  const state = status();
  const nextIdentity = state.gate ? `${location.href}|${state.gate.id}` : '';
  if (nextIdentity !== identity) {
    generation++;
    controller?.abort();
    identity = nextIdentity;
    result = null;
    panel?.remove();
    panel = null;
  }
  if (!enabled || !state.gate) {
    panel?.remove();
    panel = null;
    return;
  }
  if (!panel || !document.getElementById('gatebreaker-panel')) {
    const anchor = document.querySelector('#downloadProcess, #gateDownloadButton');
    if (anchor)
      panel = createPanel(anchor, () => {
        void resolve();
      });
  }
  panel?.update(status());
}

async function resolve(): Promise<PageStatus> {
  if (!enabled || busy) return status();
  reconcile();
  const requestIdentity = identity;
  const requestGeneration = generation;
  controller = new AbortController();
  busy = true;
  result = null;
  reconcile();
  const next = await resolver.resolve(document, {
    pageUrl: new URL(location.href),
    fetch: globalThis.fetch.bind(globalThis),
    signal: controller.signal,
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
  reconcile();
  if (identity === requestIdentity && generation === requestGeneration && enabled) result = next;
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
    void resolve()
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
  return false;
});

extension.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['enabled']) {
    settingsChanged = true;
    generation++;
    controller?.abort();
    enabled = changes['enabled'].newValue !== false;
    result = null;
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
    observer.observe(document.documentElement, { childList: true, subtree: true });
  })
  .catch(() => {
    /* Extension may have been reloaded while this tab was open. */
  });

window.addEventListener('popstate', reconcile);
