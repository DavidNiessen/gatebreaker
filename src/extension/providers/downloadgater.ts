import { soundcloudComment } from '../../core/domain/preferences';
import {
  downloadgater as coreProvider,
  documents,
  gates,
  gateId,
  object,
  origin,
  receipt,
  session,
} from '../../core/providers/downloadgater';
import type { Driver, Session } from '../../core/providers/downloadgater';
import { readLimitedText } from '../../core/providers/shared/read-text';
import type { GateActionProgress, GateProvider } from '../domain/provider';
import { providerUpdateEvent } from '../platform/messages';
import { extension } from '../platform/browser';
import { authorizationUrl } from './downloadgater/auth-address';
import { authOpen, authHeartbeat, authCancel } from './downloadgater/auth-protocol';
export { authorizationUrl } from './downloadgater/auth-address';
export * from '../../core/providers/downloadgater';

interface Pending {
  readonly operation: string;
  readonly controller: AbortController;
  readonly started: number;
  readonly driver: Driver;
  opened?: boolean;
  timer?: ReturnType<typeof setInterval>;
  error?: boolean;
  complete?: boolean;
}
const pending = new WeakMap<Session, Map<Driver, Pending>>();
const lifetime = 14 * 60 * 1000;

function nativeReceipt(
  current: Session,
  driver: Driver,
  view: Window | null = current.document.defaultView,
): string | null {
  if (!view) return null;
  try {
    const value: unknown = JSON.parse(
      view.sessionStorage.getItem(`downloadgater.${driver}Unlock.${current.id}`) ?? 'null',
    );
    if (
      !object(value) ||
      !receipt(value['token']) ||
      typeof value['createdAt'] !== 'number' ||
      !Number.isFinite(value['createdAt']) ||
      value['createdAt'] > Date.now() + 5000 ||
      Date.now() - value['createdAt'] > lifetime ||
      value['token'] === current.rejected[driver]
    )
      return null;
    return value['token'];
  } catch {
    return null;
  }
}
function notify(current: Session): void {
  current.document.defaultView?.dispatchEvent(new Event(providerUpdateEvent));
}
function stop(job: Pending): void {
  job.controller.abort();
  if (job.timer) clearInterval(job.timer);
  void extension.runtime
    .sendMessage({ type: authCancel, operation: job.operation })
    .catch(() => {});
}
async function check(current: Session, job: Pending): Promise<void> {
  if (!job.opened) return;
  if (
    documents.get(current.document) !== current ||
    !current.root.isConnected ||
    job.controller.signal.aborted
  ) {
    stop(job);
    return;
  }
  try {
    const value: unknown = await extension.runtime.sendMessage({
      type: authHeartbeat,
      operation: job.operation,
    });
    if (job.controller.signal.aborted || documents.get(current.document) !== current) return;
    if (
      object(value) &&
      receipt(value['receipt']) &&
      value['receipt'] !== current.rejected[job.driver]
    ) {
      current.receipts[job.driver] = value['receipt'];
      current.required.delete(job.driver);
      job.complete = true;
      stop(job);
      notify(current);
      return;
    }
    if (!object(value) || value['active'] !== true || Date.now() - job.started > 120000) {
      job.error = true;
      stop(job);
      notify(current);
    }
  } catch {
    if (!job.controller.signal.aborted) {
      job.error = true;
      stop(job);
      notify(current);
    }
  }
}
async function start(current: Session, job: Pending): Promise<void> {
  const active = () =>
    documents.get(current.document) === current && !job.controller.signal.aborted;
  try {
    const text = soundcloudComment(current.preferences?.soundcloudComment);
    if (job.driver === 'soundcloud' && current.model?.comment && !text)
      throw new Error('Required comment missing');
    const fetch =
      current.document.defaultView?.fetch?.bind(current.document.defaultView) ?? globalThis.fetch;
    const response = await fetch(`${origin}/api/${job.driver}/start`, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(20000)]),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkId: current.id,
        ...(job.driver === 'soundcloud' && current.model?.comment
          ? { soundCloudComment: text }
          : {}),
      }),
    });
    if (!active()) {
      await response.body?.cancel();
      stop(job);
      return;
    }
    if (
      !response.ok ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
    )
      throw new Error('Invalid authorization response');
    const value: unknown = JSON.parse(await readLimitedText(response, 65536));
    const address = object(value) ? authorizationUrl(value['authorizationUrl'], job.driver) : null;
    if (!active()) {
      stop(job);
      return;
    }
    if (!address) throw new Error('Unsupported authorization URL');
    const opened: unknown = await extension.runtime.sendMessage({
      type: authOpen,
      operation: job.operation,
      driver: job.driver,
      gateId: current.id,
      address,
    });
    if (!active()) {
      stop(job);
      return;
    }
    if (!object(opened) || opened['opened'] !== true)
      throw new Error('Owned authorization window unavailable');
    job.opened = true;
    job.timer = setInterval(() => {
      void check(current, job);
    }, 1000);
    void check(current, job);
  } catch {
    if (active()) {
      job.error = true;
      stop(job);
      notify(current);
    }
  }
}

export const downloadgater: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    const current = gates.get(gate);
    return coreProvider.resolve(gate, {
      ...context,
      parseHtml:
        context.parseHtml ?? ((html) => new DOMParser().parseFromString(html, 'text/html')),
      readNativeReceipt:
        context.readNativeReceipt ??
        ((provider, id, driver) => {
          if (
            provider !== 'downloadgater' ||
            id !== gate.id ||
            !['soundcloud', 'spotify'].includes(driver)
          )
            return null;
          if (!current || gateId(context.pageUrl) !== current.id) return null;
          return current.receipts[driver as Driver] ?? nativeReceipt(current, driver as Driver);
        }),
    });
  },
  actions(document, url) {
    const current = session(document, url);
    if (
      !current?.model ||
      (current.model.comment && !soundcloudComment(current.preferences?.soundcloudComment))
    )
      return [];
    return [...current.required].map((driver) => ({
      id: `downloadgater-${driver}`,
      kind: 'sign-in' as const,
      label: `Sign in with ${driver === 'soundcloud' ? 'SoundCloud' : 'Spotify'}`,
      description:
        'Opens DownloadGater’s native authorization. Review its requested actions and permissions.',
      required: true,
    }));
  },
  performAction(id, document, url, mode) {
    const current = session(document, url),
      view = document.defaultView;
    const driver =
      id === 'downloadgater-soundcloud'
        ? 'soundcloud'
        : id === 'downloadgater-spotify'
          ? 'spotify'
          : null;
    if (
      !current ||
      !view ||
      !driver ||
      !this.actions?.(document, url).some((action) => action.id === id)
    )
      return { ok: false, message: 'This DownloadGater sign-in is unavailable.' };
    if (mode !== 'activate')
      return { ok: false, message: 'Use the sign-in button to open DownloadGater’s consent.' };
    let jobs = pending.get(current);
    if (!jobs) {
      jobs = new Map();
      pending.set(current, jobs);
    }
    const existing = jobs.get(driver);
    if (existing && !existing.error && !existing.complete && !existing.controller.signal.aborted)
      return { ok: true, message: 'Complete the existing DownloadGater sign-in window.' };
    if (existing) stop(existing);
    const job: Pending = {
      operation: crypto.randomUUID(),
      driver,
      controller: new AbortController(),
      started: Date.now(),
    };
    jobs.set(driver, job);
    void start(current, job);
    return { ok: true, message: 'Review and complete DownloadGater’s native sign-in window.' };
  },
  actionProgress(id, document, url): GateActionProgress | null {
    const current = session(document, url);
    const driver =
      id === 'downloadgater-soundcloud'
        ? 'soundcloud'
        : id === 'downloadgater-spotify'
          ? 'spotify'
          : null;
    if (!current || !driver) return null;
    const job = pending.get(current)?.get(driver);
    if (job && !job.controller.signal.aborted) void check(current, job);
    const value = current.receipts[driver] ?? nativeReceipt(current, driver);
    if (receipt(value) && value !== current.rejected[driver])
      return {
        state: 'complete',
        message:
          'DownloadGater returned its gate receipt. Its server must still approve the download.',
      };
    if (!job) return null;
    return job.error
      ? {
          state: 'error',
          message: 'DownloadGater did not confirm this sign-in. Try signing in again.',
        }
      : { state: 'waiting', message: 'Complete DownloadGater’s native sign-in and verification.' };
  },
  cancelActions(document) {
    const current = documents.get(document);
    if (!current) return;
    for (const job of pending.get(current)?.values() ?? []) stop(job);
    pending.delete(current);
  },
  presentation(document, url) {
    if (!this.inspect(document, url)) return null;
    // The native title is absolutely positioned inside the start-screen hero.
    // Keep our controls in normal flow, outside its clipped/overlapping layout.
    const content = document.querySelector('.gate-landing')?.firstElementChild;
    if (content) return { anchor: content, placement: 'before' };
    const anchor = document.querySelector('.gate-card') ?? document.querySelector('h1');
    return anchor ? { anchor } : null;
  },
};
