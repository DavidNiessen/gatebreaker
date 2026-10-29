// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/cli/run';
import { parseArguments } from '../src/cli/args';
import { HttpClient } from '../src/cli/http';
import { downloadFile, filenameFor } from '../src/cli/download';
import { loadSession } from '../src/cli/session';
import type { CoreProvider } from '../src/core';

const url = 'https://boost.ink/fixture-01';
const target = 'https://files.example/audio.wav?signature=authored%2Fvalue';
const html = `<button class="complete_btn">Proceed</button><script>throw new Error('Must not execute')</script><script src="/assets/js/unlock.js?v=3.5.10" bufpsvdhmjybvgfncqfa="${btoa(target)}"></script>`;
const directories: string[] = [];
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatebreaker-cli-test-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
function setup(
  transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
  provider?: CoreProvider,
) {
  let stdout = '';
  let stderr = '';
  const controller = new AbortController();
  return {
    transport,
    controller,
    output: () => ({ stdout, stderr }),
    run: (args: string[]) =>
      run(args, {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
        fetch: transport,
        signal: controller.signal,
        version: '0.10.0',
        ...(provider ? { providers: [provider] } : {}),
      }),
  };
}
function synthetic(resolve: CoreProvider['resolve']): CoreProvider {
  return {
    id: 'fixture',
    name: 'Fixture',
    matches: (page) => page.origin === 'https://boost.ink',
    inspect: () => ({ provider: 'fixture', id: 'one', title: 'Fixture', steps: [], metadata: {} }),
    resolve,
  };
}

describe('CLI arguments and output contract', () => {
  it.each(['--help', '--version', '--providers'])('handles %s without requests', async (arg) => {
    const test = setup();
    expect(await test.run([arg])).toBe(0);
    expect(test.output().stdout).not.toBe('');
    expect(test.transport).not.toHaveBeenCalled();
  });
  it.each([
    { args: [] },
    { args: ['--unknown'] },
    { args: ['--timeout', '0', url] },
    { args: ['--timeout', 'NaN', url] },
    { args: ['--timeout', '3601', url] },
    { args: ['--session'] },
    { args: ['--download', '--inspect', url] },
  ])('rejects invalid arguments $args', async ({ args }) => {
    const test = setup();
    expect(await test.run(args)).toBe(2);
    expect(test.transport).not.toHaveBeenCalled();
  });
  it('parses options after URLs, short options and the positional separator', () => {
    expect(
      parseArguments([url, '-d', '-o', 'my files', '--timeout', '30', '--json', '-q']),
    ).toMatchObject({
      urls: [url],
      download: true,
      directory: 'my files',
      timeout: 30,
      json: true,
      quiet: true,
    });
    expect(parseArguments(['--', '--literal'])).toMatchObject({ urls: ['--literal'] });
  });
  it('resolves real Boost metadata without executing scripts or fetching a reward', async () => {
    const test = setup();
    expect(await test.run([url])).toBe(0);
    expect(test.output()).toEqual({ stdout: target + '\n', stderr: '' });
    expect(test.transport).toHaveBeenCalledTimes(1);
  });
  it('resolves the real Sub2Unlock adapter', async () => {
    const data = {
      page: '/[uniquer]',
      props: {
        pageProps: {
          sink: { data: { uniquer: 'fixture', title: 'Song', unlocked_link: target, blocks: [] } },
        },
      },
    };
    const test = setup(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`,
          ),
        ),
    );
    expect(await test.run(['https://sub2unlock.com/fixture', '--json'])).toBe(0);
    expect(JSON.parse(test.output().stdout)).toMatchObject({ ok: true, url: target });
  });
  it('inspects without resolving or submitting', async () => {
    const resolve = vi.fn<CoreProvider['resolve']>();
    const test = setup(undefined, synthetic(resolve));
    expect(await test.run(['--inspect', url])).toBe(0);
    expect(JSON.parse(test.output().stdout)).toMatchObject({ ok: true, gate: { id: 'one' } });
    expect(resolve).not.toHaveBeenCalled();
    expect(test.transport).toHaveBeenCalledTimes(1);
  });
  it('keeps progress on stderr and returns honest login failures', async () => {
    const test = setup(
      undefined,
      synthetic(async (_, context) => {
        expect(context.automate).toBe(true);
        context.onProgress?.({ message: 'Checking gate' });
        return { ok: false, code: 'server-required', message: 'Sign in using the native website.' };
      }),
    );
    expect(await test.run(['--json', url])).toBe(1);
    expect(JSON.parse(test.output().stdout)).toMatchObject({ ok: false, code: 'server-required' });
    expect(test.output().stderr).toBe('Checking gate\n');
  });
  it('continues after a failed input, producing one JSON line per gate', async () => {
    const test = setup();
    expect(await test.run(['--json', 'https://unsupported.example/abc', url])).toBe(1);
    const lines = test
      .output()
      .stdout.trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ ok: false });
    expect(lines[1]).toMatchObject({ ok: true });
  });
  it('does not expose raw transport exceptions', async () => {
    const test = setup(
      vi.fn<typeof fetch>().mockRejectedValue(new Error('Cookie: secret, signed token')),
    );
    expect(await test.run([url, '--json'])).toBe(1);
    expect(test.output().stdout + test.output().stderr).not.toContain('secret');
  });
  it('does not download page rewards', async () => {
    const test = setup(
      undefined,
      synthetic(async () => ({ ok: true, url: target, kind: 'page', method: 'provider-request' })),
    );
    expect(await test.run([url, '--download'])).toBe(0);
    expect(test.transport).toHaveBeenCalledTimes(1);
    expect(test.output().stdout).toBe(target + '\n');
  });
  it('returns 130 when interrupted', async () => {
    const test = setup();
    test.controller.abort();
    expect(await test.run([url])).toBe(130);
    expect(test.transport).not.toHaveBeenCalled();
  });
  it('enforces a per-gate deadline', async () => {
    const test = setup(
      vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
        await new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        );
        return new Response();
      }),
    );
    expect(await test.run([url, '--json', '--timeout', '1'])).toBe(1);
    expect(JSON.parse(test.output().stdout)).toMatchObject({ code: 'timeout' });
  });
});

describe('HTTP sessions and redirects', () => {
  it('sends cookies only under the requested credential mode and origin', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response());
    const client = new HttpClient(transport, new AbortController().signal);
    await client.jar.setCookie('sid=own; Secure; Path=/', url);
    await client.forPage('https://boost.ink')(url);
    expect(new Headers(transport.mock.calls[0]![1]?.headers).get('cookie')).toBe('sid=own');
    await client.request(url, { credentials: 'omit' });
    expect(new Headers(transport.mock.calls[1]![1]?.headers).has('cookie')).toBe(false);
    await client.forPage('https://other.example')(url);
    expect(new Headers(transport.mock.calls[2]![1]?.headers).has('cookie')).toBe(false);
  });
  it('stores provider Set-Cookie and adds Origin on same-origin POSTs', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response('', { headers: { 'set-cookie': 'sid=own; Secure; Path=/' } }),
      );
    const client = new HttpClient(transport, new AbortController().signal);
    await client.forPage('https://boost.ink')(url);
    await client.forPage('https://boost.ink')(url, { method: 'POST', body: 'x=1' });
    expect(new Headers(transport.mock.calls[1]![1]?.headers).get('cookie')).toBe('sid=own');
    expect(new Headers(transport.mock.calls[1]![1]?.headers).get('origin')).toBe(
      'https://boost.ink',
    );
  });
  it.each([
    'http://files.example/song',
    'https://127.0.0.1/song',
    'https://localhost/song',
    'https://user:secret@files.example/song',
  ])('rejects unsafe redirects %s', async (location) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    const client = new HttpClient(transport, new AbortController().signal);
    await expect(client.request(target)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('respects manual/error redirect policies and limits loops', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(null, { status: 302, headers: { location: target } }),
      );
    const client = new HttpClient(transport, new AbortController().signal);
    expect((await client.request(target, { redirect: 'manual' })).status).toBe(302);
    await expect(client.request(target, { redirect: 'error' })).rejects.toThrow();
    await expect(client.request(target)).rejects.toThrow('redirect');
    expect(transport).toHaveBeenCalledTimes(8);
  });
  it('does not replay a POST to a different origin', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 307, headers: { location: target } }));
    const client = new HttpClient(transport, new AbortController().signal);
    await expect(
      client.request(
        url,
        { method: 'POST', body: 'private=1', credentials: 'include' },
        'https://boost.ink',
      ),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('clears the body when a same-origin POST redirects to GET', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: '/done' } }))
      .mockResolvedValueOnce(new Response());
    const client = new HttpClient(transport, new AbortController().signal);
    await client.request(url, { method: 'POST', body: 'private=1' }, 'https://boost.ink');
    expect(transport.mock.calls[1]![1]).toMatchObject({ method: 'GET', body: null });
  });
  it('loads only explicitly supplied, validated, read-only session files', async () => {
    const filename = path.join(await temporary(), 'session.json');
    const data = JSON.stringify({
      version: 1,
      cookies: [{ url, cookie: 'sid=own; Secure; Path=/' }],
      nativeSessions: [{ provider: 'droploud', gateId: 'gate-one', value: 'opaque-session' }],
    });
    await writeFile(filename, data);
    const client = new HttpClient(vi.fn(), new AbortController().signal);
    expect(await loadSession(filename, client)).toEqual([
      { provider: 'droploud', gateId: 'gate-one', value: 'opaque-session' },
    ]);
    expect(await client.jar.getCookieString(url)).toBe('sid=own');
    expect(await readFile(filename, 'utf8')).toBe(data);
    await writeFile(
      filename,
      JSON.stringify({
        version: 1,
        cookies: [{ url, cookie: 'sid=x; Domain=evil.example' }],
        nativeSessions: [],
      }),
    );
    await expect(loadSession(filename, client)).rejects.toThrow('declared URL');
  });
});

describe('streamed file delivery', () => {
  it.each([
    ['attachment; filename="../../song.wav"', 'song.wav'],
    ["attachment; filename*=UTF-8''Whenever%2C%20Wherever.wav", 'Whenever, Wherever.wav'],
    ['attachment; filename="CON.txt"', 'download'],
    ['attachment; filename="bad<name>.wav"', 'bad_name_.wav'],
    ['attachment; filename=".."', 'download'],
  ])('sanitizes %s', (header, expected) => {
    expect(
      filenameFor(new Response(null, { headers: { 'content-disposition': header } }), target),
    ).toBe(expected);
  });
  it('saves exact bytes, preserves signed URL, omits cookies and refuses overwrites', async () => {
    const directory = await temporary();
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(new Uint8Array([0, 1, 2, 255]), {
          headers: {
            'content-type': 'audio/wav',
            'content-disposition': 'attachment; filename="song.wav"',
          },
        }),
    );
    const client = new HttpClient(transport, new AbortController().signal);
    await client.jar.setCookie('sid=secret; Secure', target);
    const file = await downloadFile(client, target, directory, new AbortController().signal);
    expect(await readFile(file)).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(transport.mock.calls[0]![0]).toBe(target);
    expect(new Headers(transport.mock.calls[0]![1]?.headers).has('cookie')).toBe(false);
    await expect(
      downloadFile(client, target, directory, new AbortController().signal),
    ).rejects.toThrow('already exists');
    expect(await readdir(directory)).toEqual(['song.wav']);
    expect(await readFile(file)).toEqual(Buffer.from([0, 1, 2, 255]));
  });
  it('cleans partial files after a stream failure', async () => {
    const directory = await temporary();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      pull(controller) {
        controller.error(new Error('broken transfer'));
      },
    });
    const client = new HttpClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)),
      new AbortController().signal,
    );
    await expect(
      downloadFile(client, target, directory, new AbortController().signal),
    ).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });
  it('does not save HTML errors as music', async () => {
    const directory = await temporary();
    const client = new HttpClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('<h1>Sign in</h1>', { headers: { 'content-type': 'text/html' } }),
        ),
      new AbortController().signal,
    );
    await expect(
      downloadFile(client, target, directory, new AbortController().signal),
    ).rejects.toThrow('web page');
    expect(await readdir(directory)).toEqual([]);
  });
  it('downloads every destination in a multi-file reward', async () => {
    const directory = await temporary();
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input) === url
          ? new Response(html)
          : new Response('audio', { headers: { 'content-type': 'audio/wav' } }),
      );
    const test = setup(
      transport,
      synthetic(async () => ({
        ok: true,
        url: target,
        destinations: [
          { label: 'one', url: target },
          { label: 'two', url: 'https://files.example/two.wav' },
        ],
        kind: 'file',
        method: 'provider-request',
      })),
    );
    expect(await test.run([url, '-d', '-o', directory, '--json'])).toBe(0);
    expect(JSON.parse(test.output().stdout).files).toHaveLength(2);
    expect((await readdir(directory)).sort()).toEqual(['audio.wav', 'two.wav']);
  });
});
