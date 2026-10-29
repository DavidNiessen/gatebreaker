import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export function defaultBrowserProfile(): string {
  return path.join(homedir(), '.gatebreaker', 'browser');
}

/** Refuse existing browser directories unless this CLI previously marked ownership. */
export async function prepareBrowserProfile(input = defaultBrowserProfile()): Promise<string> {
  const directory = path.resolve(input);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
    throw new Error('Choose a regular directory for the dedicated CLI browser profile.');
  const marker = path.join(directory, '.gatebreaker-cli-profile');
  const expected = 'Gatebreaker CLI browser profile v1\n';
  const entries = await readdir(directory);
  if (!entries.length) {
    const file = await open(marker, 'wx', 0o600);
    try {
      await file.writeFile(expected);
    } finally {
      await file.close();
    }
  } else {
    const file = await open(marker, 'r').catch(() => {
      throw new Error(
        'This directory is not a Gatebreaker CLI profile. Choose an empty directory; never use your normal browser profile.',
      );
    });
    try {
      const buffer = Buffer.alloc(128);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (
        buffer.subarray(0, bytesRead).toString() !== expected ||
        (await file.stat()).size !== Buffer.byteLength(expected)
      )
        throw new Error('The CLI browser profile ownership marker is invalid.');
    } finally {
      await file.close();
    }
  }
  return directory;
}
