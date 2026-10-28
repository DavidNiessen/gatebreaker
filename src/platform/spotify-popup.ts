import { extension, isEnabled } from './browser';
import { canReuseSpotify, reusableSpotifyAddress } from './spotify-reuse';
import { messages, messageType } from './messages';
import { GATE_ID_PATTERN, isHypedditPage } from '../providers/hypeddit/urls';

interface Job {
  readonly key: string;
  readonly operation: string;
  readonly tab: number;
  readonly origin: string;
  readonly path: string;
  readonly deadline: number;
  active: boolean;
  window?: number;
  child?: number;
  returnedAt?: number;
  closedAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}
const prefix = 'spotifyReuseJob:';
const jobs = new Map<string, Job>();
const earlyReturns = new Map<number, { window: number; at: number }>();
function storageKey(job: Job): string {
  return prefix + job.key;
}
function record(job: Job) {
  return {
    version: 1,
    operation: job.operation,
    tab: job.tab,
    origin: job.origin,
    path: job.path,
    deadline: job.deadline,
    window: job.window,
    child: job.child,
    ...(job.returnedAt ? { returnedAt: job.returnedAt } : {}),
    ...(job.closedAt ? { closedAt: job.closedAt } : {}),
  };
}
async function save(job: Job): Promise<void> {
  if (job.active && job.window !== undefined && job.child !== undefined)
    await extension.storage.session.set({ [storageKey(job)]: record(job) });
}
function end(job: Job, close = true): void {
  job.active = false;
  if (job.timer) clearTimeout(job.timer);
  if (jobs.get(job.key) === job) jobs.delete(job.key);
  void extension.storage?.session?.remove(storageKey(job)).catch(() => {});
  const windowId = job.window;
  delete job.window;
  if (close && !job.closedAt && windowId !== undefined)
    void extension.windows.remove(windowId).catch(() => {});
}
function arm(job: Job): void {
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => end(job), Math.max(0, job.deadline - Date.now()));
}
async function samePage(job: Job): Promise<boolean> {
  if (!job.active || Date.now() > job.deadline || !(await isEnabled())) return false;
  try {
    const tab = await extension.tabs.get(job.tab),
      url = new URL(tab.url ?? '');
    return job.active && url.origin === job.origin && url.pathname === job.path;
  } catch {
    return false;
  }
}
function parseRecord(key: string, value: unknown): Job | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data['version'] !== 1 ||
    typeof data['operation'] !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(data['operation']) ||
    !Number.isSafeInteger(data['tab']) ||
    !Number.isSafeInteger(data['window']) ||
    !Number.isSafeInteger(data['child']) ||
    typeof data['origin'] !== 'string' ||
    typeof data['path'] !== 'string' ||
    !data['path'].startsWith('/') ||
    data['path'].length > 2048 ||
    typeof data['deadline'] !== 'number' ||
    !Number.isSafeInteger(data['deadline'])
  )
    return null;
  try {
    if (
      !isHypedditPage(new URL(data['origin'])) ||
      new URL(data['origin']).origin !== data['origin']
    )
      return null;
  } catch {
    return null;
  }
  const job: Job = {
    key: String(data['tab']) + ':' + data['operation'],
    operation: data['operation'],
    tab: data['tab'] as number,
    origin: data['origin'],
    path: data['path'],
    deadline: data['deadline'],
    window: data['window'] as number,
    child: data['child'] as number,
    active: true,
  };
  if (key !== storageKey(job)) return null;
  for (const field of ['returnedAt', 'closedAt'] as const)
    if (typeof data[field] === 'number' && Number.isSafeInteger(data[field]))
      job[field] = data[field];
  return job;
}
async function restore(): Promise<boolean> {
  if (!extension.storage?.session) return false;
  const saved = await extension.storage.session.get(null);
  for (const [key, value] of Object.entries(saved))
    if (key.startsWith(prefix)) {
      const job = parseRecord(key, value);
      if (!job) {
        await extension.storage.session.remove(key);
        continue;
      }
      jobs.set(job.key, job);
      if (job.deadline > Date.now() + 125000 || !(await samePage(job))) {
        end(job);
        continue;
      }
      if (!job.closedAt) {
        try {
          await extension.windows.get(job.window!);
        } catch {
          job.closedAt = Date.now();
          await save(job);
        }
      }
      arm(job);
    }
  return true;
}
const ready = restore().catch(() => false);
// Register at module load so browser events can wake and recover an idle/restarted worker.
extension.tabs?.onRemoved?.addListener((id) => {
  void ready.then(() => {
    for (const job of jobs.values()) if (job.tab === id) end(job);
  });
});
extension.tabs?.onUpdated?.addListener((id, change) => {
  void ready.then(() => {
    for (const job of jobs.values())
      if (job.tab === id) {
        if (change.status === 'loading') {
          end(job);
          continue;
        }
        if (change.url) {
          try {
            const url = new URL(change.url);
            if (url.origin !== job.origin || url.pathname !== job.path) end(job);
          } catch {
            end(job);
          }
        }
      }
  });
});
extension.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes['enabled']?.newValue === false)
    void ready.then(() => {
      for (const job of jobs.values()) end(job);
    });
});
extension.windows?.onRemoved?.addListener((id) => {
  void ready.then(() => {
    for (const job of jobs.values())
      if (job.window === id) {
        job.closedAt = Date.now();
        void save(job);
      }
  });
});
function owner(sender: chrome.runtime.MessageSender): { tab: number; page: URL } | null {
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    typeof sender.tab?.id !== 'number' ||
    !sender.url
  )
    return null;
  try {
    const page = new URL(sender.url);
    return isHypedditPage(page) ? { tab: sender.tab.id, page } : null;
  } catch {
    return null;
  }
}
function callbackSender(sender: chrome.runtime.MessageSender): boolean {
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    typeof sender.tab?.id !== 'number' ||
    typeof sender.tab.windowId !== 'number' ||
    !sender.url
  )
    return false;
  try {
    const url = new URL(sender.url);
    return (
      url.origin === 'https://hypeddit.com' &&
      url.pathname === '/spotify_callback' &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
/** Auth return is correlated by the owned popup identity, never its global storage flag. */
export function spotifyPopupMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
): boolean | undefined {
  const type = messageType(value);
  if (type === messages.spotifyReturned) {
    if (!callbackSender(sender)) return false;
    void ready
      .then(async () => {
        const at = Date.now(),
          tab = sender.tab!;
        let found = false;
        for (const job of jobs.values())
          if (
            job.active &&
            job.child === tab.id &&
            job.window === tab.windowId &&
            at <= job.deadline
          ) {
            job.returnedAt = at;
            await save(job);
            found = true;
          }
        if (!found) {
          earlyReturns.set(tab.id!, { window: tab.windowId, at });
          for (const [id, entry] of earlyReturns)
            if (at - entry.at > 10000 || earlyReturns.size > 10) earlyReturns.delete(id);
        }
        respond({ received: true });
      })
      .catch(() => respond({ received: false }));
    return true;
  }
  if (
    type !== messages.reuseSpotify &&
    type !== messages.openSpotify &&
    type !== messages.cancelSpotify &&
    type !== messages.spotifyHeartbeat
  )
    return undefined;
  const source = owner(sender);
  if (!source) return false;
  const fields = value as Record<string, unknown>,
    operation = fields['operation'];
  if (typeof operation !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(operation)) return false;
  const key = source.tab + ':' + operation;
  if (type === messages.cancelSpotify) {
    void ready.then(() => {
      const job = jobs.get(key);
      if (job && job.origin === source.page.origin && job.path === source.page.pathname) end(job);
      respond({ cancelled: true });
    });
    return true;
  }
  if (type === messages.spotifyHeartbeat) {
    void ready
      .then(async () => {
        const job = jobs.get(key);
        if (
          !job ||
          job.origin !== source.page.origin ||
          job.path !== source.page.pathname ||
          !(await samePage(job))
        ) {
          if (job) end(job);
          respond({ active: false, returned: false });
          return;
        }
        if (job.window !== undefined && !job.closedAt) {
          try {
            await extension.windows.get(job.window);
          } catch {
            job.closedAt = Date.now();
            await save(job);
          }
        }
        respond({ active: !job.closedAt, returned: !!job.returnedAt });
      })
      .catch(() => respond({ active: false, returned: false }));
    return true;
  }
  const address = reusableSpotifyAddress(fields['address']),
    gate = fields['gateId'];
  if (!address || typeof gate !== 'string' || !GATE_ID_PATTERN.test(gate)) return false;
  void ready
    .then(async (available) => {
      if (
        !available ||
        jobs.has(key) ||
        jobs.size >= 10 ||
        [...jobs.values()].some((job) => job.tab === source.tab)
      )
        return false;
      const job: Job = {
        key,
        operation,
        tab: source.tab,
        origin: source.page.origin,
        path: source.page.pathname,
        deadline: Date.now() + 125000,
        active: true,
      };
      jobs.set(key, job);
      try {
        if (
          (type === messages.reuseSpotify && !(await canReuseSpotify())) ||
          !(await samePage(job))
        ) {
          end(job);
          return false;
        }
        const popup = await extension.windows.create({
          url: 'about:blank',
          type: 'popup',
          width: 720,
          height: 640,
          focused: true,
        });
        if (typeof popup?.id !== 'number') {
          end(job);
          return false;
        }
        job.window = popup.id;
        const child = popup.tabs?.[0]?.id;
        if (typeof child !== 'number') {
          end(job);
          return false;
        }
        job.child = child;
        const early = earlyReturns.get(child);
        if (early && early.window === job.window && Date.now() - early.at <= 10000) {
          job.returnedAt = early.at;
          earlyReturns.delete(child);
        }
        if (!(await samePage(job))) {
          end(job);
          return false;
        }
        await save(job);
        if (!job.active) {
          end(job);
          return false;
        }
        arm(job);
        await extension.tabs.update(child, { url: address });
        return job.active;
      } catch {
        end(job);
        return false;
      }
    })
    .then((opened) => respond({ opened }))
    .catch(() => respond({ opened: false }));
  return true;
}
