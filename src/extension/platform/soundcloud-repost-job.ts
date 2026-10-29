import type { SoundcloudRepostResult } from '../../core/domain/soundcloud';
import { extension, isEnabled } from './browser';
import { performSoundcloudRepost } from './soundcloud-page';

type State = SoundcloudRepostResult['state'];
interface Parent {
  readonly tab: number;
  readonly path: string;
  readonly gate: string;
  readonly document?: string;
}
interface Job extends Parent {
  readonly operation: string;
  readonly target: string;
  readonly deadline: number;
  readonly respond: (result: SoundcloudRepostResult) => void;
  lease: number;
  active: boolean;
  state: State;
  window?: number;
  child?: number;
  detached?: boolean;
  running?: boolean;
  focused?: boolean;
  tick?: ReturnType<typeof setTimeout>;
  watchdog?: ReturnType<typeof setTimeout>;
  saving?: Promise<void>;
  finishing?: Promise<void>;
}
interface Terminal extends Parent {
  readonly state: State;
  readonly until: number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const gateUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const origin = 'https://droploud.com';
const prefix = 'soundcloudRepostWindow:';
const jobs = new Map<string, Job>();
const parents = new Map<number, Job>();
const terminal = new Map<string, Terminal>();
const states = new Set<State>([
  'complete',
  'login-required',
  'challenge-required',
  'rate-limited',
  'failed',
  'cancelled',
  'loading',
]);

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function parent(sender: chrome.runtime.MessageSender): Parent | null {
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    !Number.isSafeInteger(sender.tab?.id) ||
    !sender.url
  )
    return null;
  if (
    sender.documentId !== undefined &&
    (typeof sender.documentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sender.documentId))
  )
    return null;
  try {
    const url = new URL(sender.url);
    const gate = /^\/(?:track|gate)\/([a-f0-9-]{36})\/?$/.exec(url.pathname)?.[1];
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.port ||
      !gate ||
      !gateUuid.test(gate)
    )
      return null;
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
function sameOwner(first: Parent, second: Parent): boolean {
  return (
    first.tab === second.tab &&
    first.path === second.path &&
    first.gate === second.gate &&
    first.document === second.document
  );
}
function track(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== 'https://soundcloud.com' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^\/[\w.-]{1,100}\/[\w.-]{1,200}\/?$/.test(url.pathname)
    )
      return null;
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.href;
  } catch {
    return null;
  }
}
function soundcloud(url: string | undefined): boolean {
  try {
    const value = new URL(url ?? '');
    return (
      value.origin === 'https://soundcloud.com' && !value.username && !value.password && !value.port
    );
  } catch {
    return false;
  }
}
function state(value: unknown): State {
  if (
    !object(value) ||
    Object.keys(value).length !== 1 ||
    typeof value['state'] !== 'string' ||
    !states.has(value['state'] as State)
  )
    return 'failed';
  return value['state'] as State;
}
async function active(job: Job): Promise<boolean> {
  if (!job.active || Date.now() >= job.deadline || Date.now() >= job.lease || !(await isEnabled()))
    return false;
  try {
    const tab = await extension.tabs.get(job.tab);
    const url = new URL(tab.url ?? '');
    const document = (tab as chrome.tabs.Tab & { documentId?: string }).documentId;
    return (
      job.active &&
      tab.status !== 'loading' &&
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === job.path &&
      (document === undefined || job.document === undefined || document === job.document)
    );
  } catch {
    return false;
  }
}
async function child(job: Pick<Job, 'child' | 'window'>): Promise<chrome.tabs.Tab | null> {
  if (job.child === undefined || job.window === undefined) return null;
  try {
    const tab = await extension.tabs.get(job.child);
    return tab.id === job.child && tab.windowId === job.window ? tab : null;
  } catch {
    return null;
  }
}
async function close(job: Pick<Job, 'child' | 'window' | 'detached'>): Promise<void> {
  // Close only the owned child. User-added tabs in that window remain untouched.
  if (job.detached) return;
  const tab = await child(job);
  if (tab?.id !== undefined) await extension.tabs.remove(tab.id).catch(() => {});
}
async function cancelInjected(
  job: Pick<Job, 'child' | 'window' | 'operation' | 'target'>,
): Promise<void> {
  // A dragged owned tab must still abort its exact nonce, but must never receive
  // another run or be closed after it leaves the owned window.
  let tab: chrome.tabs.Tab | null = null;
  if (job.child !== undefined)
    try {
      tab = await extension.tabs.get(job.child);
    } catch {
      /* Already closed. */
    }
  if (!tab || !soundcloud(tab.url)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    extension.scripting
      .executeScript({
        target: { tabId: tab.id!, frameIds: [0] },
        world: 'MAIN',
        func: performSoundcloudRepost,
        args: [job.target, job.operation, 'cancel'],
      })
      .catch(() => {}),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 1500);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
function remember(job: Job, result: State): void {
  terminal.set(job.operation, {
    tab: job.tab,
    path: job.path,
    gate: job.gate,
    ...(job.document ? { document: job.document } : {}),
    state: result,
    until: Date.now() + 5000,
  });
  for (const [key, value] of terminal)
    if (value.until <= Date.now() || terminal.size > 32) terminal.delete(key);
}
function reply(
  respond: (value: SoundcloudRepostResult) => void,
  value: SoundcloudRepostResult,
): void {
  try {
    respond(value);
  } catch {
    /* The owning content document may have closed. */
  }
}
function end(job: Job, result: State): Promise<void> {
  if (job.finishing) return job.finishing;
  job.active = false;
  job.state = result;
  if (job.tick) clearTimeout(job.tick);
  if (job.watchdog) clearTimeout(job.watchdog);
  job.finishing = (async () => {
    await job.saving?.catch(() => {});
    await cancelInjected(job);
    await close(job);
    await extension.storage?.session?.remove(prefix + job.operation).catch(() => {});
    remember(job, result);
    if (jobs.get(job.operation) === job) jobs.delete(job.operation);
    if (parents.get(job.tab) === job) parents.delete(job.tab);
    reply(job.respond, { state: result });
  })().catch(() => {
    if (jobs.get(job.operation) === job) jobs.delete(job.operation);
    if (parents.get(job.tab) === job) parents.delete(job.tab);
    remember(job, result);
    reply(job.respond, { state: result });
  });
  return job.finishing;
}
function arm(job: Job): void {
  if (job.watchdog) clearTimeout(job.watchdog);
  job.watchdog = setTimeout(
    () => {
      void end(job, 'cancelled');
    },
    Math.max(0, Math.min(job.deadline, job.lease) - Date.now()),
  );
}
async function focus(job: Job): Promise<void> {
  if (job.focused || job.window === undefined || !(await active(job))) return;
  const tab = await child(job);
  if (!tab) return;
  job.focused = true;
  await extension.windows.update(job.window, { focused: true }).catch(() => {});
  if (tab.id !== undefined) await extension.tabs.update(tab.id, { active: true }).catch(() => {});
}
async function run(job: Job): Promise<void> {
  if (!job.active || job.running) return;
  job.running = true;
  try {
    if (!(await active(job))) {
      await end(job, 'cancelled');
      return;
    }
    const tab = await child(job);
    if (!tab) {
      await end(job, 'cancelled');
      return;
    }
    if (!soundcloud(tab.url)) {
      if (tab.url && tab.url !== 'about:blank') {
        job.state = 'login-required';
        await focus(job);
      } else job.state = 'loading';
    } else {
      const execution = await extension.scripting.executeScript({
        target: { tabId: tab.id!, frameIds: [0] },
        world: 'MAIN',
        func: performSoundcloudRepost,
        args: [job.target, job.operation, 'run'],
      });
      if (!job.active) return;
      if (!(await active(job)) || !(await child(job))) {
        await end(job, 'cancelled');
        return;
      }
      job.state =
        Array.isArray(execution) && execution.length === 1 && execution[0]?.frameId === 0
          ? state(execution[0].result)
          : 'failed';
      if (['complete', 'failed', 'cancelled', 'rate-limited'].includes(job.state)) {
        await end(job, job.state);
        return;
      }
      if (job.state === 'login-required' || job.state === 'challenge-required') await focus(job);
    }
  } catch {
    if (job.active) await end(job, 'failed');
  } finally {
    job.running = false;
    if (job.active)
      job.tick = setTimeout(() => {
        void run(job);
      }, 2000);
  }
}
async function start(job: Job): Promise<void> {
  try {
    if (!(await active(job))) {
      await end(job, 'cancelled');
      return;
    }
    const popup = await extension.windows.create({
      url: 'about:blank',
      type: 'popup',
      focused: false,
      width: 1000,
      height: 800,
    });
    const windowId = popup?.id;
    const tabId = popup?.tabs?.[0]?.id;
    if (windowId === undefined || tabId === undefined) {
      await end(job, 'failed');
      return;
    }
    job.window = windowId;
    job.child = tabId;
    if (!job.active) {
      await close(job);
      return;
    }
    if (extension.storage?.session) {
      job.saving = extension.storage.session.set({
        [prefix + job.operation]: { window: job.window, child: job.child },
      });
      await job.saving;
    }
    if (!(await active(job))) {
      await end(job, 'cancelled');
      return;
    }
    await extension.tabs.update(job.child, { url: job.target });
    if (!(await active(job))) {
      await end(job, 'cancelled');
      return;
    }
    void run(job);
  } catch {
    if (job.active) await end(job, 'failed');
    else await close(job);
  }
}

async function cleanup(): Promise<void> {
  if (!extension.storage?.session) return;
  const saved = await extension.storage.session.get(null);
  for (const [key, value] of Object.entries(saved)) {
    if (!key.startsWith(prefix)) continue;
    const operation = key.slice(prefix.length);
    if (
      uuid.test(operation) &&
      object(value) &&
      Object.keys(value).length === 2 &&
      Number.isSafeInteger(value['window']) &&
      Number.isSafeInteger(value['child'])
    ) {
      const orphan = { window: value['window'] as number, child: value['child'] as number };
      const tab = await child(orphan);
      if (tab) {
        if (soundcloud(tab.url))
          await cancelInjected({
            ...orphan,
            operation,
            target: track(tab.url) ?? 'https://soundcloud.com/invalid/orphan',
          });
        await close(orphan);
      }
    }
    await extension.storage.session.remove(key).catch(() => {});
  }
}
const ready = cleanup().catch(() => {});
extension.tabs?.onRemoved?.addListener((id) => {
  for (const job of jobs.values())
    if (job.tab === id || job.child === id) void end(job, 'cancelled');
});
extension.tabs?.onUpdated?.addListener((id, change) => {
  for (const job of jobs.values())
    if (job.tab === id && (change.status === 'loading' || change.url !== undefined))
      void end(job, 'cancelled');
});
extension.tabs?.onDetached?.addListener((id) => {
  for (const job of jobs.values())
    if (job.child === id) {
      job.detached = true;
      void end(job, 'cancelled');
    }
});
extension.windows?.onRemoved?.addListener((id) => {
  for (const job of jobs.values()) if (job.window === id) void end(job, 'cancelled');
});
extension.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes['enabled']?.newValue === false)
    for (const job of jobs.values()) void end(job, 'cancelled');
});

/** Only a trusted current Droploud top frame can own a new isolated repost operation. */
export function soundcloudRepostMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
): boolean | undefined {
  if (
    !object(value) ||
    ![
      'gatebreaker:soundcloud-repost',
      'gatebreaker:soundcloud-repost-heartbeat',
      'gatebreaker:cancel-soundcloud-repost',
    ].includes(String(value['type']))
  )
    return undefined;
  const owner = parent(sender);
  const operation = value['operation'];
  if (!owner || typeof operation !== 'string' || !uuid.test(operation)) return false;
  const type = value['type'];
  const keys =
    type === 'gatebreaker:soundcloud-repost'
      ? ['type', 'operation', 'provider', 'gateId', 'url']
      : ['type', 'operation'];
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    return false;
  if (type === 'gatebreaker:soundcloud-repost') {
    const target = track(value['url']);
    if (value['provider'] !== 'droploud' || value['gateId'] !== owner.gate || !target) return false;
    if (parents.has(owner.tab) || jobs.has(operation)) {
      respond({ state: 'failed' });
      return false;
    }
    const job: Job = {
      ...owner,
      operation,
      target,
      deadline: Date.now() + 120000,
      lease: Date.now() + 8000,
      active: true,
      state: 'loading',
      respond,
    };
    jobs.set(operation, job);
    parents.set(owner.tab, job);
    arm(job);
    void ready.then(() => start(job));
    return true;
  }
  void ready
    .then(async () => {
      const job = jobs.get(operation);
      if (!job || !sameOwner(job, owner)) {
        const previous = terminal.get(operation);
        respond({
          state:
            previous && previous.until > Date.now() && sameOwner(previous, owner)
              ? previous.state
              : 'cancelled',
        });
        return;
      }
      if (type === 'gatebreaker:cancel-soundcloud-repost') {
        await end(job, 'cancelled');
        respond({ state: 'cancelled' });
        return;
      }
      if (!job.active) {
        respond({ state: job.state });
        return;
      }
      if (!(await active(job))) {
        await end(job, 'cancelled');
        respond({ state: 'cancelled' });
        return;
      }
      job.lease = Date.now() + 8000;
      arm(job);
      respond({ state: job.state });
    })
    .catch(() => respond({ state: 'cancelled' }));
  return true;
}
