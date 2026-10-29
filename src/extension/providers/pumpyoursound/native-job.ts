import { soundcloudComment } from '../../../core/domain/preferences';
import { pumpId } from '../../../core/providers/pumpyoursound';
import { extension, isEnabled } from '../../platform/browser';
import { cancelPumpNativeAction, performPumpNativeAction } from './native-page';

import { pumpNativeStart, pumpNativeCancel } from './protocol';
const jobs = new Map<
  string,
  { readonly tab: number; readonly path: string; readonly document?: string; active: boolean }
>();

/** Root background listener delegates only these two fixed, private message types. */
export function pumpYourSoundMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record['type'] !== pumpNativeStart && record['type'] !== pumpNativeCancel) return undefined;
  const allowed =
    record['type'] === pumpNativeStart
      ? ['type', 'operation', 'gate', 'comment']
      : ['type', 'operation'];
  if (Object.keys(record).some((key) => !allowed.includes(key))) return false;
  if (
    sender.id !== extension.runtime.id ||
    sender.frameId !== 0 ||
    !Number.isSafeInteger(sender.tab?.id) ||
    sender.tab!.id! < 0 ||
    (sender.documentId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(sender.documentId)) ||
    !sender.url ||
    typeof record['operation'] !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(record['operation'])
  )
    return false;
  let page: URL;
  try {
    page = new URL(sender.url);
  } catch {
    return false;
  }
  const gate = pumpId(page);
  if (!gate) return false;
  const operation = record['operation'];
  const tab = sender.tab!.id!;
  const key = `${tab}:${operation}`;
  const existing = jobs.get(key);
  if (record['type'] === pumpNativeCancel) {
    if (!existing || existing.path !== page.href || existing.document !== sender.documentId)
      return false;
    existing.active = false;
    void extension.scripting
      .executeScript({
        target: sender.documentId
          ? { tabId: tab, documentIds: [sender.documentId] }
          : { tabId: tab, frameIds: [0] },
        world: 'MAIN',
        func: cancelPumpNativeAction,
        args: [operation],
      })
      .then(() => respond({ state: 'cancelled' }))
      .catch(() => respond({ state: 'cancelled' }));
    return true;
  }
  if (
    existing ||
    [...jobs.values()].some((job) => job.tab === tab && job.active) ||
    record['gate'] !== gate ||
    (record['comment'] !== undefined && typeof record['comment'] !== 'string')
  )
    return false;
  const comment = record['comment'] === undefined ? '' : soundcloudComment(record['comment']);
  if (comment === null) return false;
  const job = {
    tab,
    path: page.href,
    ...(sender.documentId ? { document: sender.documentId } : {}),
    active: true,
  };
  jobs.set(key, job);
  void (async () => {
    if (!(await isEnabled())) return { state: 'cancelled' };
    const current = await extension.tabs.get(tab);
    if (!job.active || current.url !== page.href) return { state: 'cancelled' };
    const results = await extension.scripting.executeScript({
      target: sender.documentId
        ? { tabId: tab, documentIds: [sender.documentId] }
        : { tabId: tab, frameIds: [0] },
      world: 'MAIN',
      func: performPumpNativeAction,
      args: [gate, operation, comment],
    });
    const after = await extension.tabs.get(tab);
    if (!job.active || after.url !== page.href || !(await isEnabled()))
      return { state: 'cancelled' };
    const result: unknown = results[0]?.result;
    if (
      !result ||
      typeof result !== 'object' ||
      Object.keys(result).length !== 1 ||
      !('state' in result) ||
      !['complete', 'failed', 'cancelled'].includes(String(result.state))
    )
      return { state: 'failed' };
    return result;
  })()
    .then(respond)
    .catch(() => respond({ state: 'failed' }))
    .finally(() => jobs.delete(key));
  return true;
}
