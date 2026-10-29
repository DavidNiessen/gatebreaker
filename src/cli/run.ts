import { providers, safeHttpsUrl } from '../core';
import type { CoreProvider } from '../core';
import { fail } from '../core/domain/provider';
import { help, parseArguments, UsageError } from './args';
import { HttpClient } from './http';
import { loadSession } from './session';
import { downloadFile } from './download';
import type { BrowserResolver, BrowserOptions } from './browser';
import { resolveHttp, supportsGate, needsBrowser } from './resolve-http';

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
      let stage = 'request';
      const files: string[] = [];
      try {
        if (!supportsGate(input, adapters))
          throw new UsageError('This URL is not a supported public HTTPS gate.');
        stage = 'session';
        const sessions = await loadSession(args.session, client);
        stage = 'request';
        const progress = (message: string) => {
          if (!args.quiet) host.stderr(`${message}\n`);
        };
        const http = await resolveHttp(input, {
          client,
          providers: adapters,
          sessions,
          signal,
          inspect: args.inspect,
          ...(args.comment ? { comment: args.comment } : {}),
          progress,
        });
        let { gate, result } = http;
        if (!args.inspect && needsBrowser(http)) {
          stage = 'browser';
          progress(
            'This gate requires browser verification. Opening the dedicated Gatebreaker browser...',
          );
          if (!browser) {
            const options: BrowserOptions = args.profile ? { profile: args.profile } : {};
            const factory =
              host.browserFactory ?? (await import('./browser')).createBrowserResolver;
            browser = factory(options);
          }
          const response = await browser.resolve(http.url, {
            signal,
            inspect: false,
            ...(args.comment ? { comment: args.comment } : {}),
            progress,
          });
          gate = response.gate;
          result = response.result;
        }
        if (args.inspect) {
          if (!gate) {
            const failure =
              result && !result.ok
                ? result
                : fail(
                    'invalid-response',
                    'No readable gate metadata was available without browser rendering.',
                  );
            status = 1;
            if (args.json) host.stdout(`${JSON.stringify({ input, ...failure })}\n`);
            else if (!failure.ok) host.stderr(`${failure.code}: ${failure.message}\n`);
            continue;
          }
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
                    ? 'The dedicated browser could not finish. Use an empty or previously marked CLI --profile directory. Check the Chromium installation and close any other CLI using that profile. Complete sign-in/CAPTCHA in its window and keep it open. Linux needs a desktop and Chromium libraries.'
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
      }
    }
    return status;
  } finally {
    await browser?.close();
  }
}
