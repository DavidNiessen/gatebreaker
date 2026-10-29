import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';
import type { HttpClient } from './http';

export function filenameFor(response: Response, address: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  let name = plain?.[1] ?? plain?.[2]?.trim() ?? new URL(address).pathname.split('/').pop() ?? '';
  try {
    name = decodeURIComponent(encoded ?? name);
  } catch {
    /* Use the literal fallback. */
  }
  name = name
    .split(/[/\\]/)
    .pop()!
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  if (!name || /^\.+$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = 'download';
  return name;
}

export async function downloadFile(
  client: HttpClient,
  address: string,
  directory: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await client.request(address, { credentials: 'omit' });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('The file server did not return a downloadable file.');
  }
  if (
    /^(?:text\/html|application\/(?:json|xhtml\+xml))(?:;|$)/i.test(
      response.headers.get('content-type') ?? '',
    )
  ) {
    await response.body.cancel();
    throw new Error('The destination returned a web page instead of a file.');
  }
  const folder = path.resolve(directory);
  let temporary: string | undefined;
  try {
    await mkdir(folder, { recursive: true });
    temporary = await mkdtemp(path.join(folder, '.gatebreaker-'));
    const part = path.join(temporary, 'download.part');
    const file = await open(part, 'wx', 0o600);
    const reader = response.body.getReader();
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        await file.writeFile(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      await file.close();
    }
    signal.throwIfAborted();
    const filename = path.join(folder, filenameFor(response, address));
    try {
      await copyFile(part, filename, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('A file with this name already exists. Choose a different directory.');
      throw new Error('Could not save the file to the requested directory.');
    }
    return filename;
  } finally {
    if (!response.body.locked) await response.body.cancel().catch(() => {});
    // This path is created by mkdtemp within the resolved user-selected directory.
    if (
      temporary &&
      path.dirname(temporary) === folder &&
      path.basename(temporary).startsWith('.gatebreaker-')
    )
      await rm(temporary, { recursive: true, force: true });
  }
}
