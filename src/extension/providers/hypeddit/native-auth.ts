import type { Gate } from '../../../core/domain/provider';
import {
  parseNativeHypedditReply,
  requestHypedditDownload,
} from '../../../core/providers/hypeddit/http';
import {
  buildWebsiteRequest,
  captureWebsiteRequest,
} from '../../../core/providers/hypeddit/request';
import type { HypedditNativeAuth, HypedditState } from '../../../core/providers/hypeddit/session';
import { hypedditState } from '../../../core/providers/hypeddit/session';
import { confirmSpotifyReturn } from '../../../core/providers/hypeddit/spotify-confirmation';
import { GATE_ID_PATTERN } from '../../../core/providers/hypeddit/urls';
import { readLimitedText } from '../../../core/providers/shared/read-text';
import { providerUpdateEvent } from '../../platform/messages';

const lifetime = 120000;
const maxChecks = 6;
/** Public state changed by Hypeddit's native callback on its older layout. */
export function nativeFinalUnavailable(element: HTMLElement): boolean {
  return (
    element.hidden ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.style.display === 'none' ||
    ['hide', 'disabled', 'disable', 'hy-btn-lightgray'].some((name) =>
      element.classList.contains(name),
    )
  );
}
function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
function active(document: Document, current: HypedditState, pending: HypedditNativeAuth): boolean {
  return (
    hypedditState(document) === current &&
    current.nativeAuth.get(pending.id) === pending &&
    !pending.controller.signal.aborted
  );
}
function stop(current: HypedditState, pending: HypedditNativeAuth, message: string): void {
  if (current.nativeAuth.get(pending.id) !== pending) return;
  current.nativeAuth.delete(pending.id);
  if (pending.closeTimer) clearTimeout(pending.closeTimer);
  pending.controller.abort();
  current.progress.set(pending.id, { state: 'error', message });
}
export function cancelHypedditNativeAuth(document: Document): void {
  const current = hypedditState(document);
  delete current.spotifyReturnSeen;
  for (const pending of current.nativeAuth.values())
    stop(current, pending, 'The sign-in check was cancelled. Choose Sign in to try again.');
}

/** A return signal requests final JSON; neither a closed handle nor focus proves login. */
export function checkHypedditNativeAuth(
  document: Document,
  url: URL,
  current: HypedditState,
  pending: HypedditNativeAuth,
): void {
  if (!active(document, current, pending)) return;
  // A focus return, elapsed timer or COOP-closed handle is not a callback.
  if (!pending.callbackSeen && !pending.returnObserved) return;
  if (pending.closeTimer) {
    clearTimeout(pending.closeTimer);
    delete pending.closeTimer;
  }
  if (pending.id === 'sign-in-spotify') current.spotifyReturnSeen = true;
  const now = Date.now();
  if (now - pending.started > lifetime) {
    stop(
      current,
      pending,
      pending.lastFailure ??
        'Hypeddit has not confirmed the sign-in return. Reload this gate before trying again.',
    );
    return;
  }
  if (pending.checking || (pending.lastCheckAt !== undefined && now - pending.lastCheckAt < 1000)) {
    pending.recheckAt = Math.max(now, (pending.lastCheckAt ?? now) + 1000);
    return;
  }
  if ((pending.checks ?? 0) >= maxChecks) {
    stop(
      current,
      pending,
      pending.lastFailure ??
        'Hypeddit could not confirm this download after several checks. Reload this gate.',
    );
    return;
  }
  delete pending.recheckAt;
  pending.checks = (pending.checks ?? 0) + 1;
  pending.lastCheckAt = now;
  pending.checking = true;
  current.progress.set(pending.id, {
    state: 'waiting',
    message: 'Checking Hypeddit’s download server after sign-in…',
  });
  void verify(document, url, current, pending);
}
/** Recover a lost native callback without polling indefinitely or exhausting signal checks. */
function scheduleReturnCheck(pending: HypedditNativeAuth): void {
  if (!pending.callbackSeen && (pending.checks ?? 0) < 4 && pending.recheckAt === undefined)
    pending.recheckAt = Date.now() + 1000 * 4 ** Math.max(0, (pending.checks ?? 1) - 1);
}
async function verify(
  document: Document,
  url: URL,
  current: HypedditState,
  pending: HypedditNativeAuth,
): Promise<void> {
  try {
    const id = field(document, 'current_download_file_listner');
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
    if (
      !GATE_ID_PATTERN.test(id) ||
      field(document, 'is_unlimited') !== '1' ||
      !field(document, 'wrndk') ||
      !/^[\x21-\x7e]{16,4096}$/.test(csrf)
    ) {
      stop(current, pending, 'Hypeddit’s gate session is incomplete. Reload the starting page.');
      return;
    }
    const gate: Gate = {
      provider: 'hypeddit',
      id,
      title: '',
      steps: [],
      metadata: { websiteRequest: captureWebsiteRequest(document) },
    };
    const endpoint = new URL('/gate/download/ul', url);
    const response = await requestHypedditDownload(
      {
        pageUrl: url,
        fetch: document.defaultView?.fetch?.bind(document.defaultView) ?? globalThis.fetch,
        signal: pending.controller.signal,
      },
      csrf,
      buildWebsiteRequest(gate, current.preferences),
      true,
    );
    if (!active(document, current, pending)) {
      await response.body?.cancel();
      return;
    }
    if (!response.ok) {
      await response.body?.cancel();
      stop(
        current,
        pending,
        response.status === 429
          ? 'Hypeddit is limiting download checks. Wait before trying again.'
          : [401, 403, 419].includes(response.status)
            ? 'Hypeddit rejected the gate session after sign-in. Reload the starting page.'
            : `Hypeddit’s download check failed (HTTP ${response.status}). Try again later.`,
      );
      return;
    }
    if (
      response.redirected ||
      (response.url && response.url !== endpoint.href) ||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')
    ) {
      await response.body?.cancel();
      stop(
        current,
        pending,
        'Hypeddit returned a browser check or unexpected download response. Reload the gate.',
      );
      return;
    }
    const value: unknown = JSON.parse(await readLimitedText(response, 128 * 1024));
    if (!active(document, current, pending)) return;
    const reply = parseNativeHypedditReply(value, url);
    if (reply.kind === 'invalid') {
      stop(
        current,
        pending,
        'Hypeddit returned unreadable download verification data. Reload the gate.',
      );
      return;
    }
    const destination = reply.kind === 'ready' ? reply.url : null;
    if (destination) {
      current.ready = {
        at: Date.now(),
        result: { ok: true, url: destination, method: 'website-session' },
      };
      current.progress.set(pending.id, {
        state: 'complete',
        message: 'Hypeddit’s server confirmed the download is ready.',
      });
      confirmSpotifyReturn(current);
      current.nativeAuth.delete(pending.id);
      pending.controller.abort();
      return;
    }
    if (reply.kind === 'unsafe') {
      stop(
        current,
        pending,
        'Hypeddit returned an unrecognized download address. No download was started.',
      );
      return;
    }
    pending.lastFailure =
      'Hypeddit still refused the download after the sign-in checks. Finish any open sign-in window, then check again or reload this gate.';
    if (pending.callbackSeen && pending.recheckAt === undefined) {
      // The native nonsecret callback may let another required sign-in proceed.
      // It never authorizes a file: the final server response still does that.
      current.progress.set(pending.id, {
        state: 'complete',
        message:
          'Hypeddit’s callback returned; its remaining requirements and final server response still decide access.',
      });
      current.nativeAuth.delete(pending.id);
      pending.controller.abort();
    } else {
      scheduleReturnCheck(pending);
      // COOP can report a live popup as closed. Retain this attempt for its later
      // native callback or the user's focus return instead of declaring failure.
      current.progress.set(pending.id, {
        state: (pending.checks ?? 0) >= 4 && pending.recheckAt === undefined ? 'error' : 'waiting',
        message:
          (pending.checks ?? 0) >= 4 && pending.recheckAt === undefined
            ? pending.lastFailure
            : 'Waiting for Hypeddit’s sign-in return and download confirmation…',
        ...((pending.checks ?? 0) >= 4 && pending.recheckAt === undefined
          ? { retryLabel: 'Check download again' }
          : {}),
      });
    }
  } catch {
    if (!active(document, current, pending)) return;
    scheduleReturnCheck(pending);
    pending.lastFailure =
      'Hypeddit’s download check could not finish after sign-in. Reload the gate and try again.';
    current.progress.set(pending.id, {
      state: (pending.checks ?? 0) >= 4 && pending.recheckAt === undefined ? 'error' : 'waiting',
      message:
        (pending.checks ?? 0) >= 4 && pending.recheckAt === undefined
          ? pending.lastFailure
          : 'Waiting for Hypeddit’s sign-in return; its last download check could not finish.',
      ...((pending.checks ?? 0) >= 4 && pending.recheckAt === undefined
        ? { retryLabel: 'Check download again' }
        : {}),
    });
  } finally {
    pending.checking = false;
    if (hypedditState(document) === current)
      document.defaultView?.dispatchEvent(new Event(providerUpdateEvent));
  }
}

/** Observe native return effects or the owned handle's public path, never its OAuth query. */
export function observeHypedditNativeAuth(
  document: Document,
  url: URL,
  current: HypedditState,
  pending: HypedditNativeAuth,
): void {
  if (!active(document, current, pending)) return;
  if (Date.now() - pending.started > lifetime) {
    stop(
      current,
      pending,
      pending.lastFailure ??
        'Hypeddit has not confirmed the sign-in return. Reload this gate before trying again.',
    );
    return;
  }
  // The successful callback either advances its native slide, enables the old
  // final control, or emits the native storage flag when opener access fails.
  // These are only triggers: the server must still approve the file.
  let returned =
    !pending.correlatedReturn &&
    !!(
      (pending.step?.isConnected &&
        pending.step.classList.contains('move-left') !== pending.stepWasAdvanced) ||
      (pending.finalWasUnavailable &&
        pending.finalButton?.isConnected &&
        !nativeFinalUnavailable(pending.finalButton))
    );
  try {
    returned ||=
      !pending.correlatedReturn &&
      pending.window?.location.origin === 'https://hypeddit.com' &&
      pending.window?.location.pathname === pending.callback;
  } catch {
    /* Normal cross-origin consent. */
  }
  let changed = false;
  if (returned && !pending.returnObserved) {
    pending.returnObserved = true;
    changed = true;
  }
  if (changed) checkHypedditNativeAuth(document, url, current, pending);
  else if (!pending.checking && pending.recheckAt !== undefined && Date.now() >= pending.recheckAt)
    checkHypedditNativeAuth(document, url, current, pending);
}

/** Storage has no source Window; bind only its native flag, origin/path and active attempt. */
export function listenHypedditNativeAuth(
  document: Document,
  url: URL,
  current: HypedditState,
): void {
  const view = document.defaultView;
  if (!view || current.listening) return;
  current.listening = true;
  view.addEventListener('focus', (event: FocusEvent) => {
    if (!event.isTrusted || hypedditState(document) !== current) return;
    for (const pending of current.nativeAuth.values())
      checkHypedditNativeAuth(document, url, current, pending);
  });
  view.addEventListener('storage', (event: StorageEvent) => {
    if (!event.isTrusted || event.key !== 'hypeChildWindow' || hypedditState(document) !== current)
      return;
    let source: URL;
    try {
      if (event.storageArea !== view.localStorage) return;
      source = new URL(event.url);
    } catch {
      return;
    }
    if (
      source.origin !== 'https://hypeddit.com' ||
      source.username ||
      source.password ||
      source.port
    )
      return;
    for (const pending of current.nativeAuth.values()) {
      if (
        pending.correlatedReturn ||
        Date.now() - pending.started > lifetime ||
        event.newValue !== pending.elementId ||
        source.pathname !== pending.callback
      )
        continue;
      pending.callbackSeen = true;
      checkHypedditNativeAuth(document, url, current, pending);
    }
  });
}
