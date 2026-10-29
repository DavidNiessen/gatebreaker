import { createRequire } from 'node:module';
import { createGatebreaker, providers, safeHttpsUrl } from '../core';
import type { CoreProvider, Resolution, GateSummary } from '../core';
import { readLimitedText } from '../core/providers/shared/read-text';
import { publicFileUrl } from '../core/providers/hypeddit/urls';
import { help, parseArguments, UsageError } from './args';
import { HttpClient } from './http';
import { loadSession } from './session';
import { downloadFile } from './download';
import type { BrowserResolver, BrowserOptions } from './browser';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: { document: Document; close(): void } };
};
export interface CliHost {
  stdout(text: string): void;
  stderr(text: string): void;
  fetch: typeof fetch;
  signal: AbortSignal;
  version: string;
  providers?: readonly CoreProvider[];
  browserFactory?: (options: BrowserOptions) => BrowserResolver;
}

export async function run(argv: readonly string[], host: CliHost): Promise<number> {
  let args;
  try {
    args = parseArguments(argv);
  } catch (error) {
    host.stderr(`${error instanceof UsageError ? error.message : 'Invalid arguments.'}\n`);
    return 2;
  }
  if (args.command === 'help') {
    host.stdout(help);
    return 0;
  }
  if (args.command === 'version') {
    host.stdout(`${host.version}\n`);
    return 0;
  }
  if (args.command === 'install-browser') {
    const { installBrowser } = await import('./install-browser');
    return installBrowser(host.signal);
  }
  const adapters = host.providers ?? providers;
  if (args.command === 'providers') {
    host.stdout(
      args.json
        ? `${JSON.stringify(adapters.map(({ id, name }) => ({ id, name })))}\n`
        : adapters.map(({ id, name }) => `${id}\t${name}\n`).join(''),
    );
    return 0;
  }
  let status = 0;
  let browser: BrowserResolver | undefined;
  try {
    for (const input of args.urls) {
      if (host.signal.aborted) return 130;
      const signal = AbortSignal.any([host.signal, AbortSignal.timeout(args.timeout * 1000)]);
      const client = new HttpClient(host.fetch, signal);
      const windows: { close(): void }[] = [];
      let stage = 'request';
      const files: string[] = [];
      try {
        const supported = adapters.some((adapter) => {
          try {
            return !!safeHttpsUrl(input) && adapter.matches(new URL(input));
          } catch {
            return false;
          }
        });
        if (!supported) throw new UsageError('This URL is not a supported public HTTPS gate.');
        let gate: GateSummary | null;
        let result: Resolution | undefined;
        if (args.browser) {
          stage = 'browser';
          if (!browser) {
            const options: BrowserOptions = args.profile ? { profile: args.profile } : {};
            const factory =
              host.browserFactory ?? (await import('./browser')).createBrowserResolver;
            browser = factory(options);
          }
          const response = await browser.resolve(input, {
            signal,
            inspect: args.inspect,
            ...(args.comment ? { comment: args.comment } : {}),
            progress: (message) => {
              if (!args.quiet) host.stderr(`${message}\n`);
            },
          });
          gate = response.gate;
          result = response.result;
        } else {
          stage = 'session';
          const sessions = await loadSession(args.session, client);
          stage = 'request';
          // Only follow supported gate pages, keeping provider context aligned with the final URL.
          let pageUrl = input;
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
            if (!location || hop === 5) throw new Error('Invalid redirect.');
            pageUrl = new URL(location, pageUrl).href;
            if (
              !safeHttpsUrl(pageUrl) ||
              !adapters.some((adapter) => adapter.matches(new URL(pageUrl)))
            )
              throw new Error('The gate redirected to an unsupported page.');
          }
          if (!response?.ok) {
            await response?.body?.cancel();
            throw new Error('Gate request failed.');
          }
          const html = await readLimitedText(response, 4 * 1024 * 1024);
          signal.throwIfAborted();
          // The fetch closure follows the canonical gate's same-origin credential rules.
          const canonicalClient = createGatebreaker({
            providers: adapters,
            fetch: client.forPage(new URL(pageUrl).origin),
            parseHtml: (source, url) => {
              const dom = new JSDOM(source, { url: url.href });
              windows.push(dom.window);
              return dom.window.document;
            },
            probePublicFile: async (id) => {
              const address = publicFileUrl(id);
              if (!address) return null;
              let check: Response;
              try {
                check = await client.request(address, {
                  method: 'HEAD',
                  credentials: 'omit',
                  redirect: 'error',
                });
              } catch {
                signal.throwIfAborted();
                return null;
              }
              return check.ok && !/(?:html|xml)/i.test(check.headers.get('content-type') ?? '')
                ? address
                : null;
            },
            readNativeSession: (provider, gateId) =>
              sessions.find((entry) => entry.provider === provider && entry.gateId === gateId)
                ?.value ?? null,
          });
          const session = canonicalClient.createSession({ url: pageUrl, html });
          gate = session.inspect();
          if (!args.inspect)
            result = await session.resolve({
              signal,
              automate: true,
              ...(args.comment ? { preferences: { soundcloudComment: args.comment } } : {}),
              onProgress: ({ message }) => {
                if (!args.quiet) host.stderr(`${message}\n`);
              },
            });
        }
        if (args.inspect) {
          if (!gate) throw new Error('No readable gate metadata.');
          host.stdout(`${JSON.stringify({ input, ok: true, gate })}\n`);
          continue;
        }
        if (!result) throw new Error('The gate did not return a result.');
        signal.throwIfAborted();
        if (!result.ok) {
          status = 1;
          if (args.json) host.stdout(`${JSON.stringify({ input, ...result })}\n`);
          else host.stderr(`${result.code}: ${result.message}\n`);
          continue;
        }
        const targets = result.destinations?.length
          ? result.destinations.map(({ url }) => url)
          : [result.url];
        if (targets.some((url) => !safeHttpsUrl(url))) throw new Error('Unsafe destination.');
        if (args.download && result.kind !== 'page') {
          stage = 'download';
          for (const url of targets)
            files.push(await downloadFile(client, url, args.directory, signal));
        }
        signal.throwIfAborted();
        host.stdout(
          args.json
            ? `${JSON.stringify({ input, ...result, ...(files.length ? { files } : {}) })}\n`
            : `${(files.length ? files : targets).join('\n')}\n`,
        );
      } catch (error) {
        if (host.signal.aborted) return 130;
        const code =
          error instanceof UsageError
            ? 'not-supported'
            : signal.aborted
              ? 'timeout'
              : stage === 'session'
                ? 'invalid-session'
                : stage === 'download'
                  ? 'download-error'
                  : stage === 'browser'
                    ? 'browser-error'
                    : 'network-error';
        const message =
          error instanceof UsageError
            ? error.message
            : signal.aborted
              ? 'The gate exceeded its deadline. Increase --timeout if needed.'
              : stage === 'session'
                ? 'Could not read the session file. Check its version, format and cookie domains.'
                : stage === 'download'
                  ? 'Could not save the file. Check the destination, available space and existing filenames.'
                  : stage === 'browser'
                    ? 'The dedicated browser could not finish. Run gatebreaker --install-browser first; use an empty or previously marked CLI --profile directory. Complete sign-in/CAPTCHA in its window and keep it open. Linux needs a desktop and Chromium libraries.'
                    : 'Could not load or resolve this gate. Check the connection and try its native website flow.';
        status = 1;
        if (args.json)
          host.stdout(
            `${JSON.stringify({ input, ok: false, code, message, ...(files.length ? { files } : {}) })}\n`,
          );
        else {
          if (files.length) host.stdout(`${files.join('\n')}\n`);
          host.stderr(`${code}: ${message}\n`);
        }
      } finally {
        for (const window of windows) window.close();
      }
    }
    return status;
  } finally {
    await browser?.close();
  }
}
