import type { Gate } from '../../domain/provider';
import { readLimitedText } from '../shared/read-text';
import { buildWebsiteRequest, captureWebsiteRequest } from './request';
import { hypedditState } from './session';
import type { HypedditNativeAuth, HypedditState } from './session';
import { GATE_ID_PATTERN, safeDestination } from './urls';

function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
/** A returned/closed popup prompts the normal final JSON request, never a media fetch. */
export function checkHypedditNativeAuth(
  document: Document,
  url: URL,
  current: HypedditState,
  pending: HypedditNativeAuth,
): void {
  if (pending.checking) return;
  pending.checking = true;
  current.progress.set(pending.id, {
    state: 'waiting',
    message: 'Checking Hypeddit’s download server after sign-in…',
  });
  void verify(document, url, current, pending);
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
    )
      throw new Error('Unsupported session');
    const gate: Gate = {
      provider: 'hypeddit',
      id,
      title: '',
      steps: [],
      metadata: { websiteRequest: captureWebsiteRequest(document) },
    };
    const endpoint = new URL('/gate/download/ul', url);
    const response = await (
      document.defaultView?.fetch?.bind(document.defaultView) ?? globalThis.fetch
    )(endpoint.href, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrf,
      },
      body: buildWebsiteRequest(gate),
    });
    if (
      !response.ok ||
      response.redirected ||
      (response.url && response.url !== endpoint.href) ||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')
    ) {
      await response.body?.cancel();
      throw new Error('Server refused');
    }
    const value: unknown = JSON.parse(await readLimitedText(response, 128 * 1024));
    if (hypedditState(document) !== current || current.nativeAuth.get(pending.id) !== pending)
      return;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const destination =
        record['download_status'] === true ? safeDestination(record['URL'], url) : null;
      if (destination) {
        current.ready = {
          at: Date.now(),
          result: { ok: true, url: destination, method: 'website-session' },
        };
        current.progress.set(pending.id, {
          state: 'complete',
          message: 'Hypeddit’s server confirmed the download is ready.',
        });
        current.nativeAuth.delete(pending.id);
        return;
      }
    }
    // A final-file refusal does not identify which of several accounts is missing.
    // Only the native callback signal may let the controller continue to another auth step.
    finish(current, pending);
  } catch {
    if (hypedditState(document) === current && current.nativeAuth.get(pending.id) === pending)
      finish(current, pending);
  }
}
function finish(current: HypedditState, pending: HypedditNativeAuth): void {
  if (pending.callbackSeen)
    current.progress.set(pending.id, {
      state: 'complete',
      message:
        'Hypeddit’s native callback returned. Other requirements and the final server response still decide access.',
    });
  else
    current.progress.set(pending.id, {
      state: 'error',
      message:
        'Hypeddit did not confirm this sign-in or release the download. Try signing in again.',
    });
  current.nativeAuth.delete(pending.id);
}

/** Observe only the native nonsecret control-id flag, never storage/account token values. */
export function listenHypedditNativeAuth(
  document: Document,
  url: URL,
  current: HypedditState,
): void {
  const view = document.defaultView;
  if (!view || current.listening) return;
  current.listening = true;
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
        Date.now() - pending.started > 120000 ||
        event.newValue !== pending.elementId ||
        source.pathname !== pending.callback
      )
        continue;
      pending.callbackSeen = true;
      checkHypedditNativeAuth(document, url, current, pending);
    }
  });
}
