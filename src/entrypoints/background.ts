import { GATE_ID_PATTERN, isHypedditPage, publicFileUrl } from '../providers/hypeddit/urls';
import { extension } from '../platform/browser';
import { messages, messageType } from '../platform/messages';

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
