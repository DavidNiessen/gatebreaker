import { describe, expect, it } from 'vitest';
import { safeHttpsUrl } from '../src/domain/urls';
import { readLimitedText } from '../src/providers/shared/read-text';

describe('cross-provider destination boundary', () => {
  it.each([
    'https://mega.nz/file/fixture#key',
    'https://drive.google.com/file/d/example/view?usp=sharing',
    'https://www.mediafire.com/file/example/a.zip/file',
  ])('preserves public file links: %s', (url) => expect(safeHttpsUrl(url)).toBe(url));
  it.each([
    'https://localhost/x',
    'https://x.localhost/x',
    'https://printer.local/x',
    'https://service.internal/x',
    'https://127.1/x',
    'https://0x7f000001/x',
    'https://10.0.0.1/x',
    'https://172.16.1.1/x',
    'https://192.168.1.1/x',
    'https://169.254.169.254/x',
    'https://100.64.0.1/x',
    'https://198.18.0.1/x',
    'https://[::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'file:///tmp/x',
    'https://user:secret@example.com/x',
    'https://example.com:444/x',
  ])('rejects private/local or privileged destinations: %s', (url) =>
    expect(safeHttpsUrl(url)).toBeNull(),
  );
});
describe('bounded provider response reader', () => {
  it('reassembles UTF-8 split between chunks', async () => {
    const bytes = new TextEncoder().encode('a🎵b');
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 3));
          c.enqueue(bytes.slice(3));
          c.close();
        },
      }),
    );
    expect(await readLimitedText(response, 6)).toBe('a🎵b');
  });
  it('counts bytes and cancels a stream that exceeds the limit', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('🎵🎵'));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(readLimitedText(response, 7)).rejects.toThrow('size');
    expect(cancelled).toBe(true);
  });
  it('rejects a declared oversized response before reading its body', async () => {
    const response = new Response('large', { headers: { 'content-length': '99999' } });
    await expect(readLimitedText(response, 10)).rejects.toThrow('size');
  });
});
