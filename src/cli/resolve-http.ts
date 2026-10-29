import { createRequire } from 'node:module';
import { createGatebreaker } from '../core';
import type { CoreProvider, GateSummary, Resolution } from '../core';
import { fail } from '../core/domain/provider';
import { safeHttpsUrl } from '../core/domain/urls';
import { readLimitedText } from '../core/providers/shared/read-text';
import { publicFileUrl } from '../core/providers/hypeddit/urls';
import type { HttpClient } from './http';
import type { loadSession } from './session';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: { document: Document; close(): void } };
};
export interface HttpResolution {
  readonly url: string;
  readonly gate: GateSummary | null;
  readonly result?: Resolution;
}
interface Options {
  readonly client: HttpClient;
  readonly providers: readonly CoreProvider[];
  readonly sessions: Awaited<ReturnType<typeof loadSession>>;
  readonly signal: AbortSignal;
  readonly inspect: boolean;
  readonly comment?: string;
  readonly progress: (message: string) => void;
}

export function supportsGate(input: string, providers: readonly CoreProvider[]): boolean {
  try {
    return !!safeHttpsUrl(input) && providers.some((provider) => provider.matches(new URL(input)));
  } catch {
    return false;
  }
}

/** HTTP fast path. Its DOM is inert and all windows are closed before returning. */
export async function resolveHttp(input: string, options: Options): Promise<HttpResolution> {
  const { client, providers, sessions, signal } = options;
  const windows: { close(): void }[] = [];
  let pageUrl = input;
  try {
    let response: Response | undefined;
    for (let hop = 0; hop <= 5; hop++) {
      response = await client.request(pageUrl, {
        credentials: 'include',
        redirect: 'manual',
        headers: { accept: 'text/html' },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || hop === 5) throw new Error('Invalid gate redirect chain.');
      pageUrl = new URL(location, pageUrl).href;
      if (!supportsGate(pageUrl, providers))
        throw new Error('The gate redirected to an unsupported page.');
    }
    signal.throwIfAborted();
    if (!response?.ok) {
      await response?.body?.cancel();
      return {
        url: pageUrl,
        gate: null,
        result:
          response && [401, 403, 419].includes(response.status)
            ? fail('session-expired', 'The gate requires a browser session or manual verification.')
            : response?.status === 429
              ? fail('rate-limited', 'The gate is limiting requests. Try again later.')
              : fail('network-error', 'The gate could not be loaded. Try again later.'),
      };
    }
    const html = await readLimitedText(response, 4 * 1024 * 1024);
    signal.throwIfAborted();
    const engine = createGatebreaker({
      providers,
      fetch: client.forPage(new URL(pageUrl).origin),
      parseHtml(source, url) {
        const dom = new JSDOM(source, { url: url.href });
        windows.push(dom.window);
        return dom.window.document;
      },
      async probePublicFile(id) {
        const address = publicFileUrl(id);
        if (!address) return null;
        try {
          const check = await client.request(address, {
            method: 'HEAD',
            credentials: 'omit',
            redirect: 'error',
          });
          return check.ok && !/(?:html|xml)/i.test(check.headers.get('content-type') ?? '')
            ? address
            : null;
        } catch {
          signal.throwIfAborted();
          return null;
        }
      },
      readNativeSession: (provider, gateId) =>
        sessions.find((entry) => entry.provider === provider && entry.gateId === gateId)?.value ??
        null,
    });
    const session = engine.createSession({ url: pageUrl, html });
    const gate = session.inspect();
    if (options.inspect) return { url: pageUrl, gate };
    const result = await session.resolve({
      signal,
      automate: true,
      ...(options.comment ? { preferences: { soundcloudComment: options.comment } } : {}),
      onProgress: ({ message }) => options.progress(message),
    });
    signal.throwIfAborted();
    return { url: pageUrl, gate, result };
  } finally {
    for (const window of windows) window.close();
  }
}

export function needsBrowser(value: HttpResolution): boolean {
  return (
    !!value.result &&
    !value.result.ok &&
    (value.result.code === 'server-required' ||
      value.result.code === 'session-expired' ||
      (value.result.code === 'not-supported' && value.gate === null))
  );
}
