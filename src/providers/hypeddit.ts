import { fail } from '../domain/provider';
import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { GATE_ID_PATTERN, isHypedditPage, safeDestination } from './hypeddit/urls';
import {
  listHypedditActions,
  performHypedditAction,
  hypedditActionProgress,
} from './hypeddit/actions';
import { captureWebsiteRequest, buildWebsiteRequest } from './hypeddit/request';
import { hypedditPresentation } from './hypeddit/presentation';
import { bindHypedditSession, hypedditGateState, hypedditReady } from './hypeddit/session';

function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}

export function buildSkipRequest(gate: Gate): URLSearchParams {
  const body = new URLSearchParams({
    file: gate.id,
    wrndk: gate.metadata['wrndk'] ?? '',
    download_action: 'DOWNLOAD',
    download_visit: 'true',
    profile_downloads: 'true',
    page: 'nonsingle',
    time: '0',
    is_skippable: '1',
    steps: gate.steps.join(','),
    gvf: '0',
    lifetime_fan_spotify: '0',
    lifetime_fan_deezer: '0',
    lifetime_fan_apple: '0',
  });
  for (const step of gate.steps) body.append('skip_gate_steps[]', step);
  return body;
}

function serverRequired(): Resolution {
  return fail(
    'server-required',
    'Hypeddit did not release a download link. Complete any required sign-in in Gatebreaker, then try Download. Some gates enforce additional requirements.',
  );
}

export function parseDownloadResponse(value: unknown, pageUrl: URL): Resolution {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail(
      'invalid-response',
      'Hypeddit returned an unexpected response. Reload the page and try again.',
    );
  const result = value as Record<string, unknown>;
  if (result['download_status'] !== true) return serverRequired();
  if (typeof result['URL'] !== 'string' || !result['URL'].trim()) return serverRequired();
  const url = safeDestination(result['URL'], pageUrl);
  return url
    ? { ok: true, url, method: 'skip-request' }
    : fail(
        'unsafe-destination',
        'Hypeddit returned an unrecognized download address. No link was opened.',
      );
}

export const hypeddit: GateProvider = {
  id: 'hypeddit',
  name: 'Hypeddit',
  matches: isHypedditPage,
  actions: listHypedditActions,
  performAction: performHypedditAction,
  actionProgress: hypedditActionProgress,
  presentation: hypedditPresentation,
  inspect(document, url) {
    if (!isHypedditPage(url)) return null;
    const id = field(document, 'current_download_file_listner');
    if (
      !GATE_ID_PATTERN.test(id) ||
      !document.querySelector('#downloadProcess, #gateDownloadButton')
    )
      return null;
    // Link Gates, commerce and account pages have different contracts.
    if (document.querySelector('#gateDownloadButton[data-type="linkGate"]')) return null;
    const steps = [
      ...new Set(
        field(document, 'nwSteps')
          .split(',')
          .map((step) => step.trim())
          .filter((step) => /^[a-zA-Z0-9_-]{1,32}$/.test(step)),
      ),
    ];
    return bindHypedditSession(
      {
        provider: 'hypeddit',
        id,
        title: (
          document.querySelector('h1')?.textContent?.trim() ||
          document.title.replace(/\s*\|.*$/, '').trim() ||
          'Download gate'
        ).slice(0, 200),
        steps,
        metadata: {
          wrndk: field(document, 'wrndk'),
          csrf: document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
          unlimited: field(document, 'is_unlimited'),
          websiteRequest: captureWebsiteRequest(document),
        },
      },
      document,
    );
  },
  async resolve(gate: Gate, context: ProviderContext): Promise<Resolution> {
    const current = hypedditGateState(gate);
    const ready = current && hypedditReady(current);
    if (ready) return ready;
    // Historical public main objects still exist on some gates. A HEAD probe
    // verifies access; a preview URL is never substituted for the original.
    if (context.intent !== 'website-session')
      try {
        const url = await context.probePublicFile(gate.id);
        context.signal?.throwIfAborted();
        const destination = safeDestination(url, context.pageUrl);
        if (destination) return { ok: true, url: destination, method: 'public-file' };
      } catch {
        /* A missing public object does not prevent the same-origin request. */
      }
    context.signal?.throwIfAborted();
    if (gate.metadata['unlimited'] !== '1')
      return fail(
        'not-supported',
        'This gate uses a layout Gatebreaker does not support yet. Use the original download button.',
      );
    if (!gate.metadata['wrndk'] || !gate.metadata['csrf'])
      return fail(
        'session-expired',
        'Gate session details are missing. Reload this page before trying again.',
      );
    const endpoint = new URL('/gate/download/ul', context.pageUrl);
    const response = await context.fetch(endpoint.href, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: context.signal
        ? AbortSignal.any([context.signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': gate.metadata['csrf'],
      },
      body:
        context.intent === 'website-session' ? buildWebsiteRequest(gate) : buildSkipRequest(gate),
    });
    if (response.status === 401 || response.status === 403 || response.status === 419)
      return fail(
        'session-expired',
        'Hypeddit rejected this session. Reload the page; complete any browser check yourself.',
      );
    if (response.status === 429)
      return fail('rate-limited', 'Hypeddit is limiting requests. Wait before trying again.');
    if (!response.ok)
      return fail('network-error', 'Hypeddit could not process the request. Try again later.');
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
      return fail(
        'invalid-response',
        'Hypeddit returned a page instead of a download response. Reload the gate and complete any browser check yourself.',
      );
    // Bound untrusted response parsing; signed destination URLs can be long.
    const text = await response.text();
    if (text.length > 128 * 1024)
      return fail(
        'invalid-response',
        'Hypeddit returned an unusually large response. No link was opened.',
      );
    try {
      const result = parseDownloadResponse(JSON.parse(text) as unknown, context.pageUrl);
      if (!result.ok && result.code === 'server-required' && current) current.authRequired = true;
      return result.ok && context.intent === 'website-session'
        ? { ...result, method: 'website-session' }
        : result;
    } catch {
      return fail(
        'invalid-response',
        'Hypeddit returned unreadable download data. Reload the gate and try again.',
      );
    }
  },
};
