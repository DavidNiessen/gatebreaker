import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { access } from 'node:fs/promises';

export async function ensureBrowserInstalled(
  executable: string,
  signal: AbortSignal,
  progress: (message: string) => void,
  install: typeof installBrowser = installBrowser,
): Promise<void> {
  signal.throwIfAborted();
  try {
    await access(executable);
    return;
  } catch {
    /* First-use setup below. */
  }
  progress('Downloading compatible Chromium for the first browser-required gate...');
  const status = await install(signal);
  signal.throwIfAborted();
  if (status !== 0)
    throw new Error('Chromium installation failed. Check your connection and retry.');
  await access(executable);
}

export async function installBrowser(signal: AbortSignal): Promise<number> {
  const metadata = createRequire(import.meta.url).resolve('playwright/package.json');
  const child = spawn(
    process.execPath,
    [path.join(path.dirname(metadata), 'cli.js'), 'install', 'chromium', '--no-shell'],
    {
      stdio: ['inherit', 2, 2],
      signal,
    },
  );
  return new Promise((resolve) => {
    child.once('error', () => resolve(signal.aborted ? 130 : 1));
    child.once('exit', (status) => resolve(signal.aborted ? 130 : status === 0 ? 0 : 1));
  });
}
