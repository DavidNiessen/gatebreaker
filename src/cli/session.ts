import { open } from 'node:fs/promises';
import { safeHttpsUrl } from '../core';
import type { HttpClient } from './http';

interface NativeSession {
  provider: string;
  gateId: string;
  value: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Explicit, read-only import. No automatic browser profile access or session persistence. */
export async function loadSession(
  filename: string | undefined,
  client: HttpClient,
): Promise<NativeSession[]> {
  if (!filename) return [];
  const handle = await open(filename, 'r');
  let file: Buffer;
  try {
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 1024 * 1024) throw new Error('Session file exceeds 1 MiB.');
    file = buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
  let value: unknown;
  try {
    value = JSON.parse(file.toString('utf8')) as unknown;
  } catch {
    throw new Error('Session file must contain valid JSON.');
  }
  if (
    !object(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['cookies']) ||
    !Array.isArray(value['nativeSessions'])
  )
    throw new Error('Session file must use version 1 with cookies and nativeSessions arrays.');
  if (value['cookies'].length > 1000 || value['nativeSessions'].length > 1000)
    throw new Error('Session file contains too many entries.');
  for (const cookie of value['cookies']) {
    if (
      !object(cookie) ||
      !safeHttpsUrl(cookie['url']) ||
      typeof cookie['cookie'] !== 'string' ||
      cookie['cookie'].length > 8192
    )
      throw new Error('Invalid session cookie entry.');
    try {
      await client.jar.setCookie(cookie['cookie'], cookie['url'] as string);
    } catch {
      throw new Error('Session cookie could not be accepted for its declared URL.');
    }
  }
  return value['nativeSessions'].map((entry: unknown) => {
    if (
      !object(entry) ||
      typeof entry['provider'] !== 'string' ||
      !/^[a-z0-9-]{1,64}$/.test(entry['provider']) ||
      typeof entry['gateId'] !== 'string' ||
      !/^[\w-]{1,128}$/.test(entry['gateId']) ||
      typeof entry['value'] !== 'string' ||
      !entry['value'] ||
      entry['value'].length > 4096 ||
      /[\r\n\0]/.test(entry['value'])
    )
      throw new Error('Invalid native session entry.');
    return { provider: entry['provider'], gateId: entry['gateId'], value: entry['value'] };
  });
}
