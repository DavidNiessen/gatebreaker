import { gateId, object, origin, receipt } from '../../../core/providers/downloadgater';
import type { Driver } from '../../../core/providers/downloadgater';
import { extension, isEnabled } from '../../platform/browser';
import { authorizationUrl } from './auth-address';
import { authOpen, authHeartbeat, authCancel } from './auth-protocol';

interface Owner {
  readonly tab: number;
  readonly path: string;
  readonly gate: string;
  readonly document?: string;
}
interface Job extends Owner {
  readonly key: string;
  readonly operation: string;
  readonly driver: Driver;
  readonly started: number;
  readonly deadline: number;
  active: boolean;
  lease: number;
  child?: number;
  window?: number;
  receipt?: string;
  polling?: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
const jobs = new Map<string, Job>();
function owner(sender: chrome.runtime.MessageSender): Owner | null {
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    !Number.isSafeInteger(sender.tab?.id) ||
    !sender.url
  )
    return null;
  if (sender.documentId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(sender.documentId))
    return null;
  try {
    const url = new URL(sender.url),
      gate = gateId(url);
    if (!gate) return null;
    return {
      tab: sender.tab!.id!,
      path: url.pathname,
      gate,
      ...(sender.documentId ? { document: sender.documentId } : {}),
    };
  } catch {
    return null;
  }
}
function sameOwner(a: Owner, b: Owner): boolean {
  return a.tab === b.tab && a.path === b.path && a.gate === b.gate && a.document === b.document;
}
async function active(job: Job): Promise<boolean> {
  if (!job.active || Date.now() > job.deadline || Date.now() > job.lease || !(await isEnabled()))
    return false;
  try {
    const tab = await extension.tabs.get(job.tab),
      url = new URL(tab.url ?? '');
    return (
      job.active &&
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === job.path
    );
  } catch {
    return false;
  }
}
async function close(job: Job): Promise<void> {
  if (job.child === undefined || job.window === undefined) return;
  try {
    const tab = await extension.tabs.get(job.child);
    if (tab.windowId === job.window) await extension.tabs.remove(job.child);
  } catch {
    /* A user-closed or detached child cannot be closed again. */
  }
}
function end(job: Job): void {
  job.active = false;
  if (job.timer) clearTimeout(job.timer);
  if (jobs.get(job.key) === job) jobs.delete(job.key);
  void close(job);
}
function arm(job: Job): void {
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(
    () => end(job),
    Math.max(0, Math.min(job.deadline, job.lease) - Date.now()),
  );
}
/** Runs only after the exact owned child has returned to the exact gate origin/path. */
function recoverReceipt(driver: Driver, gate: string, started: number): string | null {
  try {
    const address = new URL(location.href);
    if (
      address.origin !== 'https://downloadgater.com' ||
      address.username ||
      address.password ||
      address.port ||
      address.pathname.replace(/\/$/, '') !== `/g/${gate}`
    )
      return null;
    const raw = sessionStorage.getItem(`downloadgater.${driver}Unlock.${gate}`);
    if (!raw || raw.length > 8192) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return typeof record['token'] === 'string' &&
      /^[A-Za-z0-9._~-]{16,4096}$/.test(record['token']) &&
      typeof record['createdAt'] === 'number' &&
      Number.isFinite(record['createdAt']) &&
      record['createdAt'] >= started - 5000 &&
      record['createdAt'] <= Date.now() + 5000 &&
      Date.now() - record['createdAt'] <= 14 * 60 * 1000
      ? record['token']
      : null;
  } catch {
    return null;
  }
}
async function poll(job: Job): Promise<void> {
  if (job.polling || job.receipt) return;
  job.polling = true;
  try {
    if (!(await active(job))) {
      end(job);
      return;
    }
    if (job.child === undefined || job.window === undefined) return;
    const tab = await extension.tabs.get(job.child);
    if (tab.windowId !== job.window) {
      end(job);
      return;
    }
    const url = new URL(tab.url ?? '');
    if (url.origin !== origin || gateId(url) !== job.gate) return;
    const results = await extension.scripting.executeScript({
      target: { tabId: job.child, frameIds: [0] },
      func: recoverReceipt,
      args: [job.driver, job.gate, job.started],
    });
    if (!(await active(job))) return;
    const again = await extension.tabs.get(job.child),
      current = new URL(again.url ?? '');
    if (again.windowId !== job.window || current.origin !== origin || gateId(current) !== job.gate)
      return;
    const value = results.find((item) => item.frameId === 0)?.result;
    if (receipt(value)) {
      job.receipt = value;
      await close(job);
    }
  } catch {
    if (job.active && job.child !== undefined) {
      try {
        await extension.tabs.get(job.child);
      } catch {
        end(job);
      }
    }
  } finally {
    job.polling = false;
  }
}
extension.tabs?.onRemoved?.addListener((id) => {
  for (const job of jobs.values())
    if (job.tab === id || (job.child === id && !job.receipt)) end(job);
});
extension.tabs?.onUpdated?.addListener((id, change) => {
  for (const job of jobs.values()) {
    if (job.tab === id && (change.status === 'loading' || change.url)) {
      end(job);
      continue;
    }
    if (job.child === id && (change.status === 'complete' || change.url)) void poll(job);
  }
});
/** Narrow DG authorization job; never reads or injects code on account origins. */
export function downloadgaterAuthMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
): boolean | undefined {
  if (!object(value) || ![authOpen, authHeartbeat, authCancel].includes(String(value['type'])))
    return undefined;
  const source = owner(sender),
    operation = value['operation'];
  if (!source || typeof operation !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(operation))
    return false;
  const key = `${source.tab}:${operation}`,
    job = jobs.get(key);
  if (value['type'] === authCancel) {
    if (job && sameOwner(job, source)) end(job);
    respond({ cancelled: true });
    return false;
  }
  if (value['type'] === authHeartbeat) {
    if (!job || !sameOwner(job, source)) {
      respond({ active: false });
      return false;
    }
    void (async () => {
      if (!(await active(job))) {
        end(job);
        return { active: false };
      }
      job.lease = Date.now() + 10000;
      arm(job);
      await poll(job);
      return job.active
        ? { active: true, ...(job.receipt ? { receipt: job.receipt } : {}) }
        : { active: false };
    })()
      .then(respond)
      .catch(() => respond({ active: false }));
    return true;
  }
  const driver = value['driver'],
    gate = value['gateId'];
  if ((driver !== 'soundcloud' && driver !== 'spotify') || gate !== source.gate) return false;
  const address = authorizationUrl(value['address'], driver);
  if (!address) return false;
  if (job || jobs.size >= 10 || [...jobs.values()].some((item) => item.tab === source.tab)) {
    respond({ opened: false });
    return false;
  }
  const created: Job = {
    ...source,
    key,
    operation,
    driver,
    started: Date.now(),
    deadline: Date.now() + 125000,
    lease: Date.now() + 10000,
    active: true,
  };
  jobs.set(key, created);
  arm(created);
  void (async () => {
    if (!(await active(created))) {
      end(created);
      return false;
    }
    const popup = await extension.windows.create({
      url: 'about:blank',
      type: 'popup',
      width: 620,
      height: 720,
      focused: true,
    });
    if (!popup) {
      end(created);
      return false;
    }
    if (popup.id !== undefined) created.window = popup.id;
    if (popup.tabs?.[0]?.id !== undefined) created.child = popup.tabs[0].id;
    if (created.window === undefined || created.child === undefined || !(await active(created))) {
      end(created);
      return false;
    }
    await extension.tabs.update(created.child, { url: address });
    return created.active;
  })()
    .then((opened) => respond({ opened }))
    .catch(() => {
      end(created);
      respond({ opened: false });
    });
  return true;
}
