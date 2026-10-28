import { beforeEach, describe, expect, it, vi } from 'vitest';
import { push } from '../src/extension/providers/push';
import type { Gate, ProviderContext } from '../src/core/domain/provider';

const pageUrl = new URL('https://push.fm/cu/music-fixture');
const origin = 'https://routenote-push.s3.eu-west-2.amazonaws.com';
const external = 'https://drive.google.com/file/d/fixture/view';
function fileUrl(id = 'file-a'): string {
  const query = new URLSearchParams({
    'response-content-disposition': 'attachment; filename="fixture.zip"',
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': 'FIXTURE/20261027/eu-west-2/s3/aws4_request',
    'X-Amz-Date': '20261027T120000Z',
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Expires': '300',
    'X-Amz-Signature': 'a'.repeat(64),
  });
  return `${origin}/123/${id}?${query}`;
}
function file(id = 'file-a', overrides: Record<string, unknown> = {}) {
  return {
    url: fileUrl(id),
    name: `${id}.zip`,
    size: 1024,
    type: 'application/zip',
    content_id: 1,
    ...overrides,
  };
}
function metadata(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'music-fixture',
    title: 'Music fixture',
    type: 'file',
    content_count: 1,
    actions: [{ id: 123, driver: 'youtube-subscribe', required: true }],
    minimum_actions: 1,
    ...overrides,
  };
}
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fixture(): void {
  document.head.innerHTML = '<meta property="og:title" content="Music fixture | PUSH.fm">';
  document.body.innerHTML =
    '<div id="app"><img alt="Artist artwork"><div class="inline-block w-full"><span class="leading-normal inline-block w-full text-xl font-bold text-black break-word">Music fixture</span></div><div class="block w-full text-left px-4 pb-6"><div class="block w-full text-center mt-4"><button>Download file</button></div></div></div><script type="fixture-text/javascript" src="https://d29xpkeqnsbaz3.cloudfront.net/deployment-id/js/products.js"></script>';
}
function gate(): Gate {
  return push.inspect(document, pageUrl)!;
}
function context(first: unknown = metadata(), second: unknown = [file()]): ProviderContext {
  return {
    pageUrl,
    fetch: vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)),
    probePublicFile: vi.fn(),
    onProgress: vi.fn(),
  };
}
beforeEach(fixture);

describe('PUSH.fm current native reward lookup', () => {
  it('resolves without action issuance, accounts, email, telemetry, files, or page execution', async () => {
    const ctx = context();
    const result = await push.resolve(gate(), ctx);
    expect(result).toEqual({
      ok: true,
      url: fileUrl(),
      kind: 'file',
      method: 'provider-request',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(ctx.fetch).mock.calls;
    expect(calls[0]![0]).toBe('https://push.fm/api/guest/unlock/music-fixture');
    const lookup = new URL(String(calls[1]![0]));
    expect(lookup.origin + lookup.pathname).toBe('https://push.fm/unlock/music-fixture/complete');
    expect(JSON.parse(atob(lookup.searchParams.get('token')!))).toEqual({
      actions: {},
    });
    for (const [, options] of calls) {
      expect(options).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(options?.body).toBeUndefined();
      expect(options?.headers).toEqual({
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(ctx.probePublicFile).not.toHaveBeenCalled();
    expect(ctx.onProgress).toHaveBeenCalledTimes(2);
  });

  it('uses fresh public metadata rather than supplied cached creator/action data', async () => {
    const current = gate();
    const ctx = context(
      metadata({
        actions: [],
        minimum_actions: 0,
        creator: { email: 'fixture@example.invalid' },
      }),
    );
    expect(current.metadata).toEqual({});
    expect(current.steps).toEqual([]);
    expect(
      await push.resolve(
        {
          ...current,
          metadata: {
            token: 'never-read',
            destination: 'https://evil.invalid',
          },
        },
        ctx,
      ),
    ).toMatchObject({ ok: true, url: fileUrl() });
    expect(JSON.stringify(vi.mocked(ctx.onProgress!).mock.calls)).not.toContain(
      'fixture@example.invalid',
    );
  });

  it('returns a secret URL body without replacing it with a streaming/profile target', async () => {
    const ctx = context(metadata({ type: 'url' }), {
      body: external,
      content_id: 1,
    });
    expect(await push.resolve(gate(), ctx)).toEqual({
      ok: true,
      url: external,
      method: 'provider-request',
    });
  });

  it('preserves MEGA fragment keys for URL rewards', async () => {
    const target = 'https://mega.nz/file/fixture#fixture-key';
    expect(
      await push.resolve(gate(), context(metadata({ type: 'url' }), { body: target })),
    ).toMatchObject({ ok: true, url: target });
  });

  it('preserves signed URLs with encoded spaces, punctuation, and UTF-8 filenames', async () => {
    const target = fileUrl('Mix%20%28%C3%A9dition%29.wav');
    expect(
      await push.resolve(gate(), context(metadata(), [file('file-a', { url: target })])),
    ).toMatchObject({ ok: true, url: target });
  });

  it('preserves every file and its filename for a user choice, in native order', async () => {
    const first = file('file-a', { name: 'First <mix>.wav' });
    const second = file('file-b', { name: 'Second mix.mp3' });
    const ctx = context(metadata({ content_count: 2 }), [first, second]);
    expect(await push.resolve(gate(), ctx)).toEqual({
      ok: true,
      url: first.url,
      kind: 'file',
      method: 'provider-request',
      destinations: [
        { label: first.name, url: first.url },
        { label: second.name, url: second.url },
      ],
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds file labels and replaces control characters without treating names as HTML', async () => {
    const files = [file('file-a', { name: '<img src=x>\n' + 'x'.repeat(250) }), file('file-b')];
    const result = await push.resolve(gate(), context(metadata({ content_count: 2 }), files));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.destinations?.[0]?.label).toHaveLength(200);
      expect(result.destinations?.[0]?.label).toContain('<img src=x> ');
      expect(result.destinations?.[0]?.label).not.toContain('\n');
    }
  });

  it('accepts at most twenty valid files as an explicit implementation bound', async () => {
    const list = Array.from({ length: 20 }, (_, i) => file(`file-${i}`));
    const result = await push.resolve(gate(), context(metadata({ content_count: 20 }), list));
    expect(result.ok && result.destinations?.length).toBe(20);
  });

  it.each([[], [file(), file()], Array.from({ length: 21 }, (_, i) => file(`f-${i}`)), null, {}])(
    'rejects empty, mismatched, or oversized file lists: %j',
    async (value) => {
      expect(await push.resolve(gate(), context(metadata(), value))).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    },
  );

  it('rejects an entire mixed file list instead of silently dropping the unsafe item', async () => {
    const ctx = context(metadata({ content_count: 2 }), [
      file(),
      file('file-b', { url: 'http://localhost/file' }),
    ]);
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it('rejects repeated URLs rather than claiming distinct downloadable files', async () => {
    expect(
      await push.resolve(gate(), context(metadata({ content_count: 2 }), [file(), file()])),
    ).toMatchObject({ ok: false, code: 'unsafe-destination' });
  });

  it.each([
    { name: '' },
    { name: 42 },
    { name: 'x'.repeat(1001) },
    { type: null },
    { size: -1 },
    { size: 0.5 },
    { size: '100' },
    { content_id: 0 },
    { content_id: '1' },
  ])('rejects malformed file details %j', async (override) => {
    expect(
      await push.resolve(gate(), context(metadata(), [file('file-a', override)])),
    ).toMatchObject({ ok: false, code: 'invalid-response' });
  });

  it.each([
    'http://routenote-push.s3.eu-west-2.amazonaws.com/123/file',
    'https://routenote-push.s3.eu-west-2.amazonaws.com.evil.invalid/123/file',
    'https://push.fm/unlock/music-fixture/complete',
    'https://routenote-push.s3.eu-west-2.amazonaws.com/123/file#key',
    'https://user:password@routenote-push.s3.eu-west-2.amazonaws.com/123/file',
    'https://routenote-push.s3.eu-west-2.amazonaws.com:8443/123/file',
    fileUrl() + '&X-Amz-Signature=' + 'b'.repeat(64),
    fileUrl() + '&extra=unexpected',
    fileUrl().replace('X-Amz-Expires=300', 'X-Amz-Expires=0'),
    fileUrl().replace('X-Amz-Expires=300', 'X-Amz-Expires=604801'),
    fileUrl().replace('X-Amz-SignedHeaders=host', 'X-Amz-SignedHeaders=host%3Bauthorization'),
    fileUrl().replace('X-Amz-Algorithm=AWS4-HMAC-SHA256', 'X-Amz-Algorithm=other'),
    fileUrl().replace('X-Amz-Date=20261027T120000Z', 'X-Amz-Date=invalid'),
    fileUrl().replace(/X-Amz-Signature=[a-f0-9]+/, 'X-Amz-Signature=invalid'),
  ])('rejects unrecognized file capabilities: %s', async (url) => {
    expect(
      await push.resolve(gate(), context(metadata(), [file('file-a', { url })])),
    ).toMatchObject({ ok: false, code: 'unsafe-destination' });
  });

  it.each([
    'http://example.com/file',
    'https://localhost/file',
    'https://127.0.0.1/file',
    'https://192.168.1.1/file',
    'https://push.fm/cu/other',
    'https://app.push.fm/lookup',
    'javascript:alert(1)',
    'https://user:pass@example.com/file',
  ])('rejects unsafe URL reward: %s', async (body) => {
    expect(await push.resolve(gate(), context(metadata({ type: 'url' }), { body }))).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it.each([{}, { body: null }, { body: 42 }, { body: 'https://example.com/' + 'x'.repeat(16384) }])(
    'rejects missing or oversized URL bodies: %j',
    async (value) => {
      expect(await push.resolve(gate(), context(metadata({ type: 'url' }), value))).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    },
  );

  it.each([
    { slug: 'other-gate' },
    { content_count: 0 },
    { content_count: 21 },
    { content_count: 1.5 },
    { title: '' },
    { isSoftDeleted: true },
  ])('rejects mismatched or unavailable metadata before reward lookup: %j', async (override) => {
    const ctx = context(metadata(override));
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not turn a text reward into a download URL', async () => {
    const ctx = context(metadata({ type: 'text' }));
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'server-required'],
    [403, 'server-required'],
    [404, 'not-supported'],
    [410, 'not-supported'],
    [429, 'rate-limited'],
    [500, 'network-error'],
  ])('reports native %i without inventing success', async (status, code) => {
    const ctx = context();
    vi.mocked(ctx.fetch)
      .mockReset()
      .mockResolvedValueOnce(response(metadata()))
      .mockResolvedValueOnce(response({ message: 'refused' }, Number(status)));
    expect(await push.resolve(gate(), ctx)).toMatchObject({ ok: false, code });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not start a final lookup after metadata refusal', async () => {
    const ctx = context();
    vi.mocked(ctx.fetch).mockReset().mockResolvedValue(response({}, 403));
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response('<html>refused</html>', {
      headers: { 'content-type': 'text/html' },
    }),
    new Response('{broken', {
      headers: { 'content-type': 'application/json' },
    }),
    new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': '262145',
      },
    }),
  ])('rejects unreadable or oversized response', async (bad) => {
    const ctx = context();
    vi.mocked(ctx.fetch).mockReset().mockResolvedValue(bad);
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });

  it('rejects a response from an unexpected origin', async () => {
    const ctx = context();
    const bad = response(metadata());
    Object.defineProperty(bad, 'url', {
      value: 'https://evil.invalid/api/guest/unlock/music-fixture',
    });
    vi.mocked(ctx.fetch).mockReset().mockResolvedValue(bad);
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });

  it('distinguishes a network failure', async () => {
    const ctx = context();
    vi.mocked(ctx.fetch).mockReset().mockRejectedValue(new TypeError('fetch failed'));
    expect(await push.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'network-error',
    });
  });

  it('honors cancellation before any request', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = context();
    await expect(push.resolve(gate(), { ...ctx, signal: controller.signal })).rejects.toThrow();
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('discards cancellation between metadata and reward lookup', async () => {
    const controller = new AbortController();
    const ctx = context();
    vi.mocked(ctx.fetch)
      .mockReset()
      .mockImplementationOnce(async () => {
        controller.abort();
        return response(metadata());
      });
    await expect(push.resolve(gate(), { ...ctx, signal: controller.signal })).rejects.toThrow();
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged provider or gate identity without requests', async () => {
    const ctx = context();
    expect(await push.resolve({ ...gate(), provider: 'other' }, ctx)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(await push.resolve({ ...gate(), id: 'other' }, ctx)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
});

describe('PUSH.fm route and document boundaries', () => {
  it.each([
    'https://push.fm/cu/music-fixture',
    'https://push.fm/unlock/music-fixture/',
    'https://push.fm/cu/Music_123',
  ])('recognizes observed native routes %s', (input) => {
    expect(push.matches(new URL(input))).toBe(true);
  });

  it.each([
    'http://push.fm/cu/music-fixture',
    'https://www.push.fm/cu/music-fixture',
    'https://push.fm.evil.invalid/cu/music-fixture',
    'https://push.fm/pl/paid-gate',
    'https://push.fm/fl/stream-link',
    'https://push.fm/cu/a/b',
    'https://push.fm/cu/',
    'https://push.fm:8443/cu/music-fixture',
    'https://user:pass@push.fm/cu/music-fixture',
  ])('rejects unrelated, unverified, or unsafe routes %s', (input) => {
    expect(push.matches(new URL(input))).toBe(false);
  });

  it('requires both native root/title and the actual public product script', () => {
    expect(gate()).toMatchObject({ provider: 'push', id: 'music-fixture' });
    document.querySelector('script')!.setAttribute('src', 'https://evil.invalid/js/products.js');
    expect(push.inspect(document, pageUrl)).toBeNull();
    fixture();
    document.querySelector('#app')!.remove();
    expect(push.inspect(document, pageUrl)).toBeNull();
    fixture();
    document.querySelector('meta')!.remove();
    expect(push.inspect(document, pageUrl)).toBeNull();
  });

  it('keeps inspection free of requests and does not read the CSRF token', () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      '<meta name="csrf-token" content="fixture-do-not-read">',
    );
    const current = gate();
    expect(current.metadata).toEqual({});
    expect(JSON.stringify(current)).not.toContain('fixture-do-not-read');
    expect(push.presentation!(document, pageUrl)).toMatchObject({
      anchor: document.querySelector('span')!.parentElement,
    });
  });

  it('recognizes hydrated Vue pages after #app is replaced, preserving native artwork and heading', () => {
    document.querySelector('#app')!.removeAttribute('id');
    expect(push.inspect(document, pageUrl)).toMatchObject({
      provider: 'push',
      id: 'music-fixture',
    });
    const presentation = push.presentation!(document, pageUrl)!;
    expect(presentation.anchor.textContent).toBe('Music fixture');
    expect(Object.keys(presentation)).toEqual(['anchor']);
  });
});
