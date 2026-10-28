import { deliveryTargets, deliver } from '../application/deliver';
import type { Resolution } from '../domain/provider';
import { providers } from '../providers';
import { GATE_ID_PATTERN, isHypedditPage, publicFileUrl } from '../providers/hypeddit/urls';
import { extension, isEnabled } from '../platform/browser';
import { messages, messageType } from '../platform/messages';
import { spotifyPopupMessage } from '../platform/spotify-popup';

const deliveryJobs = new Map<string, { active: boolean }>();

const probes = new Map<string, Promise<string | null>>();

async function probe(gateId: string): Promise<string | null> {
  const url = publicFileUrl(gateId);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const mime = response.headers.get('content-type')?.toLowerCase() ?? '';
    return response.ok && !mime.includes('text/html') && !mime.includes('xml') ? url : null;
  } catch {
    return null;
  }
}

extension.runtime.onMessage.addListener((value: unknown, sender, respond) => {
  const authorization = spotifyPopupMessage(value, sender, respond);
  if (authorization !== undefined) return authorization;
  if (messageType(value) === messages.cancelDelivery) {
    if (
      sender.id !== extension.runtime.id ||
      sender.frameId !== 0 ||
      typeof sender.tab?.id !== 'number'
    )
      return false;
    const operation = (value as Record<string, unknown>)['operation'];
    if (typeof operation !== 'string') return false;
    const job = deliveryJobs.get(`${sender.tab.id}:${operation}`);
    if (!job) return false;
    job.active = false;
    respond({ cancelled: true });
    return false;
  }
  if (messageType(value) === messages.deliver) {
    if (
      sender.id !== extension.runtime.id ||
      sender.frameId !== 0 ||
      typeof sender.tab?.id !== 'number' ||
      !sender.url
    )
      return false;
    try {
      const page = new URL(sender.url);
      if (
        page.protocol !== 'https:' ||
        page.username ||
        page.password ||
        page.port ||
        !providers.some((provider) => provider.matches(page))
      )
        return false;
    } catch {
      return false;
    }
    const operation = (value as Record<string, unknown>)['operation'];
    if (typeof operation !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(operation)) return false;
    const key = `${sender.tab.id}:${operation}`;
    if (deliveryJobs.has(key)) return false;
    const result = (value as Record<string, unknown>)['result'];
    if (
      !result ||
      typeof result !== 'object' ||
      !('ok' in result) ||
      result.ok !== true ||
      !('method' in result) ||
      ![
        'public-file',
        'skip-request',
        'website-session',
        'embedded-link',
        'provider-request',
      ].includes(String(result.method))
    )
      return false;
    const targets = deliveryTargets(result as Resolution);
    if (!targets) return false;
    const job = { active: true };
    deliveryJobs.set(key, job);
    const tabId = sender.tab.id;
    const original = new URL(sender.url);
    void (async () => {
      if (!(await isEnabled()))
        return {
          state: 'failed',
          files: 0,
          message: 'Gatebreaker is disabled. Enable it to download.',
        };
      return deliver(
        targets,
        (url) => extension.downloads.download({ url, saveAs: false, conflictAction: 'uniquify' }),
        (url) => extension.tabs.create({ url, active: true }),
        async () => {
          if (!job.active || !(await isEnabled())) return false;
          try {
            const tab = await extension.tabs.get(tabId);
            const current = new URL(tab.url ?? '');
            return (
              job.active &&
              current.origin === original.origin &&
              current.pathname === original.pathname
            );
          } catch {
            return false;
          }
        },
      );
    })()
      .finally(() => deliveryJobs.delete(key))
      .then(respond)
      .catch(() =>
        respond({
          state: 'failed',
          files: 0,
          message: 'The browser could not start the download. Use the link below to try again.',
        }),
      );
    return true;
  }
  if (messageType(value) !== messages.publicFile) return false;
  if (sender.id !== extension.runtime.id || sender.frameId !== 0 || !sender.tab || !sender.url)
    return false;
  try {
    if (!isHypedditPage(new URL(sender.url))) return false;
  } catch {
    return false;
  }
  const gateId = (value as Record<string, unknown>)['gateId'];
  if (typeof gateId !== 'string' || !GATE_ID_PATTERN.test(gateId)) return false;
  // Only fixed provider objects can be requested, never arbitrary URLs.
  let pending = probes.get(gateId);
  if (!pending) {
    pending = probe(gateId).finally(() => {
      probes.delete(gateId);
    });
    probes.set(gateId, pending);
  }
  void pending.then((url) => respond({ url }));
  return true;
});
