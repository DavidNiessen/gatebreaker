import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gate, ProviderContext } from '../src/core/domain/provider';
import { valorizd } from '../src/extension/providers/valorizd';

const slug = 'fixture-music-pack';
const pageUrl = new URL(`https://www.valorizd.app/gates/${slug}`);
const target = 'https://www.dropbox.com/scl/fi/fixture/music.wav?rlkey=fixture&dl=0';
const endpoint =
  'https://firestore.googleapis.com/v1/projects/valorizd-d6172/databases/(default)/documents:runQuery';
const name = 'projects/valorizd-d6172/databases/(default)/documents/gates/FixtureAutoId123';
const text = (value: string) => ({ stringValue: value });
const originalTiming = Object.getOwnPropertyDescriptor(window.performance, 'getEntriesByType');

function resourceTiming(entries: unknown[]) {
  const getEntriesByType = vi.fn().mockReturnValue(entries);
  Object.defineProperty(window.performance, 'getEntriesByType', {
    configurable: true,
    value: getEntriesByType,
  });
  return getEntriesByType;
}

function fields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: text(slug),
    title: text('Fixture music pack'),
    gateType: text('url'),
    reward: { mapValue: { fields: { url: text(target) } } },
    steps: {
      arrayValue: {
        values: [{ mapValue: { fields: { type: text('soundcloud-follow') } } }],
      },
    },
    emailCapture: { booleanValue: false },
    ...overrides,
  };
}
function body(overrides: Record<string, unknown> = {}): unknown[] {
  return [
    {
      document: { name, fields: fields(overrides) },
      readTime: '2026-01-01T00:00:00Z',
    },
  ];
}
function fixture(): void {
  document.head.innerHTML =
    `<link rel="canonical" href="${pageUrl.href}">` +
    '<script src="/_next/static/chunks/app/gates/%5BgateId%5D/page-a1b2c3.js?dpl=fixture"></script>';
  document.body.innerHTML =
    '<header><button id="language">English</button></header><main><div class="relative overflow-hidden rounded-2xl"><div class="relative px-5 pb-5 pt-5"><div class="relative"><div class="flex items-start gap-4"><button id="preview">Play preview</button><div class="min-w-0 flex-1 pt-1"><h2 class="line-clamp-3 break-words">Fixture music pack</h2></div></div><button id="description">Show more</button></div><div class="mt-6" id="steps"><h3>Unlock the download</h3><form><button>Native action</button></form></div><div class="mt-5" id="footer"><div><button id="native-download">Complete all actions to unlock</button></div></div></div></div><div class="mt-6" id="unrelated"><button>Unrelated control</button></div></main><aside><button id="cookies">Essential only</button></aside>';
}
function gate(): Gate {
  const value = valorizd.inspect(document, pageUrl);
  if (!value) throw new Error('Fixture was not recognized');
  return value;
}
function response(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', ...headers },
  });
}
function context(value: unknown = body(), status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(value, status));
  const controller = new AbortController();
  const context: ProviderContext = {
    pageUrl,
    fetch,
    signal: controller.signal,
    probePublicFile: vi.fn(),
  };
  return { context, fetch, controller };
}

beforeEach(fixture);
afterEach(() => {
  vi.restoreAllMocks();
  if (originalTiming) Object.defineProperty(window.performance, 'getEntriesByType', originalTiming);
  else Reflect.deleteProperty(window.performance, 'getEntriesByType');
});

describe('Valorizd page recognition', () => {
  it('recognizes only native metadata and bundle, without requests or stored creator data', () => {
    expect(gate()).toEqual({
      provider: 'valorizd',
      id: slug,
      title: 'Fixture music pack',
      steps: [],
      metadata: {},
    });
    expect(valorizd.actions).toBeUndefined();
    expect(valorizd.performAction).toBeUndefined();
  });
  it('supports matching og:url and a script with literal route brackets', () => {
    document.head.innerHTML =
      `<meta property="og:url" content="${pageUrl.href}">` +
      '<script src="https://www.valorizd.app/_next/static/chunks/app/gates/[gateId]/page-0012abcd.js"></script>';
    expect(gate().id).toBe(slug);
  });
  it('supports route queries and a trailing slash without including them in its identity', () => {
    expect(valorizd.inspect(document, new URL(`${pageUrl.href}/?utm_source=fixture`))?.id).toBe(
      slug,
    );
  });
  it('supports popup inspection before title hydration and bounds later titles as plain text', () => {
    document.body.innerHTML = '<div>Loading gate…</div>';
    expect(gate().title).toBe('Valorizd gate');
    const h2 = document.createElement('h2');
    h2.className = 'line-clamp-3 break-words';
    h2.textContent = '<img src=x onerror=alert(1)>'.repeat(20);
    document.body.append(h2);
    expect(gate().title).toHaveLength(200);
    expect(document.querySelector('img')).toBeNull();
  });
  it.each([
    'http://www.valorizd.app/gates/fixture-music-pack',
    'https://valorizd.app/gates/fixture-music-pack',
    'https://www.valorizd.app.evil.invalid/gates/fixture-music-pack',
    'https://evilvalorizd.app/gates/fixture-music-pack',
    'https://user:pass@www.valorizd.app/gates/fixture-music-pack',
    'https://www.valorizd.app:8443/gates/fixture-music-pack',
    'https://www.valorizd.app/',
    'https://www.valorizd.app/gates/',
    'https://www.valorizd.app/gates/Fixture',
    'https://www.valorizd.app/gates/fixture_foo',
    'https://www.valorizd.app/gates/fixture--foo',
    'https://www.valorizd.app/gates/fixture%2Ffoo',
    'https://www.valorizd.app/gates/-fixture',
    'https://www.valorizd.app/gates/fixture-',
    'https://www.valorizd.app/gates/fixture/extra',
    `https://www.valorizd.app/gates/${'a'.repeat(201)}`,
  ])('rejects unrelated or unsupported routes: %s', (url) => {
    expect(valorizd.matches(new URL(url))).toBe(false);
    expect(valorizd.inspect(document, new URL(url))).toBeNull();
  });
  it('rejects absent, foreign, mismatched, or conflicting identity metadata', () => {
    document.querySelector('link')!.remove();
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
    for (const href of [
      'https://evil.invalid/gates/fixture-music-pack',
      `${pageUrl.origin}/gates/other`,
    ]) {
      fixture();
      document.querySelector('link')!.setAttribute('href', href);
      expect(valorizd.inspect(document, pageUrl)).toBeNull();
    }
    fixture();
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:url');
    meta.content = `${pageUrl.origin}/gates/other`;
    document.head.append(meta);
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
  });
  it('rejects missing, foreign, unrelated, or credential-bearing scripts', () => {
    for (const src of [
      'https://evil.invalid/_next/static/chunks/app/gates/%5BgateId%5D/page-0123.js',
      'https://user:pass@www.valorizd.app/_next/static/chunks/app/gates/%5BgateId%5D/page-0123.js',
      '/_next/static/chunks/app/layout-0123.js',
      '/_next/static/chunks/app/gates/%5Bother%5D/page-0123.js',
      '/_next/static/chunks/app/gates/%5BgateId%5D/page-unknown.js',
    ]) {
      fixture();
      document.querySelector('script')!.src = src;
      expect(valorizd.inspect(document, pageUrl)).toBeNull();
    }
    fixture();
    document.querySelector('script')!.remove();
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
  });
  it('does not misidentify a relative script moved to a foreign origin by base', () => {
    const base = document.createElement('base');
    base.href = 'https://evil.invalid/';
    document.head.prepend(base);
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
  });
});

describe('Valorizd late hydration ownership', () => {
  const nativeBundle = `${pageUrl.origin}/_next/static/chunks/app/gates/%5BgateId%5D/page-a1b2c3.js?dpl=fixture`;
  it('recognizes a consumed route script from read-only resource timing with the native hydrated card', () => {
    document.querySelector('script')!.remove();
    const read = resourceTiming([
      { name: nativeBundle, initiatorType: 'script', entryType: 'resource' },
    ]);
    expect(gate().title).toBe('Fixture music pack');
    expect(read).toHaveBeenCalledWith('resource');
    expect(document.querySelector('script')).toBeNull();
    expect(valorizd.presentation!(document, pageUrl)).not.toBeNull();
  });
  it('accepts an owned script preload without executing inline Flight data', () => {
    document.querySelector('script')!.remove();
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.setAttribute('as', 'script');
    preload.href = nativeBundle;
    document.head.append(preload);
    expect(gate().id).toBe(slug);
    preload.rel = 'modulepreload';
    preload.removeAttribute('as');
    expect(gate().id).toBe(slug);
  });
  it.each([
    ['https://evil.invalid/_next/static/chunks/app/gates/%5BgateId%5D/page-a1b2c3.js', 'script'],
    [
      'https://user:pass@www.valorizd.app/_next/static/chunks/app/gates/%5BgateId%5D/page-a1b2c3.js',
      'script',
    ],
    [nativeBundle, 'fetch'],
    [`${pageUrl.origin}/_next/static/chunks/app/layout-a1b2c3.js`, 'script'],
    [`${pageUrl.origin}/_next/static/chunks/app/gates/%5Bother%5D/page-a1b2c3.js`, 'script'],
  ])('rejects unrelated resource evidence: %s (%s)', (name, initiatorType) => {
    document.querySelector('script')!.remove();
    resourceTiming([{ name, initiatorType, entryType: 'resource' }]);
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
  });
  it('requires the native hydrated card and matching canonical for a timing fallback', () => {
    document.querySelector('script')!.remove();
    resourceTiming([{ name: nativeBundle, initiatorType: 'script' }]);
    document.querySelector('link')!.setAttribute('href', `${pageUrl.origin}/gates/other`);
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
    fixture();
    document.querySelector('script')!.remove();
    document.body.innerHTML = '<h2 class="line-clamp-3 break-words">Unrelated heading</h2>';
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
    document.body.innerHTML = '<div>Loading gate…</div>';
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
  });
  it('contains an unavailable timing API and never treats arbitrary inline code as ownership', () => {
    document.querySelector('script')!.remove();
    const read = resourceTiming([]);
    read.mockImplementation(() => {
      throw new TypeError('Unavailable');
    });
    const script = document.createElement('script');
    script.textContent = `window.evaluated = true; // ${nativeBundle}`;
    document.body.append(script);
    expect(valorizd.inspect(document, pageUrl)).toBeNull();
    expect('evaluated' in window).toBe(false);
  });
});

describe('Valorizd native presentation', () => {
  it('anchors beside the title without marking or changing any native controls', () => {
    const before = document.body.innerHTML;
    const presentation = valorizd.presentation!(document, pageUrl)!;
    expect(presentation.anchor).toBe(document.querySelector('div.flex.items-start.gap-4'));
    expect(Object.keys(presentation)).toEqual(['anchor']);
    expect(document.body.innerHTML).toBe(before);
  });
  it('keeps presentation free of mutations for the content MutationObserver', () => {
    valorizd.presentation!(document, pageUrl);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { subtree: true, attributes: true });
    valorizd.presentation!(document, pageUrl);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
  it('waits for the native title and card rather than anchoring in an unrelated page header', () => {
    document.body.innerHTML = '<header><h1>Valorizd</h1></header><div>Loading…</div>';
    expect(valorizd.presentation!(document, pageUrl)).toBeNull();
    expect(gate().title).toBe('Valorizd gate');
    document.body.innerHTML = '<h2 class="line-clamp-3 break-words">Unrelated heading</h2>';
    expect(valorizd.presentation!(document, pageUrl)).toBeNull();
  });
});

describe('Valorizd exact public Firestore read', () => {
  it('queries only one exact slug with a minimal field projection; performs no writes or destination fetch', async () => {
    const { context: ctx, fetch } = context();
    expect(await valorizd.resolve(gate(), ctx)).toEqual({
      ok: true,
      url: target,
      method: 'provider-request',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(endpoint);
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      structuredQuery: {
        from: [{ collectionId: 'gates' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'slug' },
            op: 'EQUAL',
            value: { stringValue: slug },
          },
        },
        select: {
          fields: [
            'slug',
            'title',
            'gateType',
            'reward.url',
            'reward.fileUrl',
            'reward.fileName',
            'steps',
            'emailCapture',
          ].map((fieldPath) => ({ fieldPath })),
        },
        limit: 2,
      },
    });
    expect(ctx.probePublicFile).not.toHaveBeenCalled();
  });
  it('selects the file reward exactly and preserves its signed query without a download request', async () => {
    const file =
      'https://firebasestorage.googleapis.com/v0/b/fixture/o/gates%2Ffile.wav?alt=media&token=fixture-public-file-key';
    const { context: ctx, fetch } = context(
      body({
        gateType: text('file'),
        reward: {
          mapValue: {
            fields: {
              fileUrl: text(file),
              url: text('https://wrong.example.org/'),
            },
          },
        },
      }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toEqual({
      ok: true,
      url: file,
      kind: 'file',
      method: 'provider-request',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('resolves email and unknown social-step configurations without submitting them or retaining extra objects', async () => {
    const { context: ctx, fetch } = context(
      body({
        emailCapture: { booleanValue: true },
        steps: {
          arrayValue: {
            values: [{ mapValue: { fields: { provider: text('future-social') } } }],
          },
        },
        creator: {
          mapValue: { fields: { email: text('never-retain@example.invalid') } },
        },
      }),
    );
    const value = await valorizd.resolve(gate(), ctx);
    expect(value).toEqual({
      ok: true,
      url: target,
      method: 'provider-request',
    });
    expect(JSON.stringify(value)).not.toContain('never-retain');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves a MEGA fragment key', async () => {
    const destination = 'https://mega.nz/file/fixture#required-key';
    const { context: ctx } = context(
      body({ reward: { mapValue: { fields: { url: text(destination) } } } }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: true,
      url: destination,
    });
  });
  it('rejects a forged provider or slug before any request', async () => {
    const { context: ctx, fetch } = context();
    for (const override of [{ provider: 'other' }, { id: 'other' }])
      expect(await valorizd.resolve({ ...gate(), ...override }, ctx)).toMatchObject({
        ok: false,
        code: 'not-supported',
      });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[], [{ readTime: '2026-01-01' }]].map((value) => ({ value })))(
    'reports an empty query as unavailable: $value',
    async ({ value }) => {
      expect(await valorizd.resolve(gate(), context(value).context)).toMatchObject({
        ok: false,
        code: 'not-supported',
      });
    },
  );
  it('rejects ambiguous matching rows rather than selecting the first document', async () => {
    const value = body();
    value.push(...body());
    expect(await valorizd.resolve(gate(), context(value).context)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it.each([
    'projects/another/databases/(default)/documents/gates/FixtureAutoId123',
    'projects/valorizd-d6172/databases/other/documents/gates/FixtureAutoId123',
    'projects/valorizd-d6172/databases/(default)/documents/profiles/FixtureAutoId123',
    'projects/valorizd-d6172/databases/(default)/documents/gates/FixtureAutoId123/subcollection/x',
    'projects/valorizd-d6172/databases/(default)/documents/gates/Fixture%2Fid',
    'https://firestore.googleapis.com/v1/projects/valorizd-d6172/databases/(default)/documents/gates/FixtureAutoId123',
  ])('rejects a document from an unexpected namespace: %s', async (documentName) => {
    const value = [{ document: { name: documentName, fields: fields() } }];
    expect(await valorizd.resolve(gate(), context(value).context)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it.each(
    [
      null,
      {},
      'not-array',
      [null],
      [{ document: null }],
      [{ document: { name } }],
      [{ document: { name, fields: {} } }],
    ].map((value) => ({ value })),
  )('contains malformed response rows: $value', async ({ value }) => {
    expect(await valorizd.resolve(gate(), context(value).context)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it.each([
    { slug: text('other') },
    { slug: { integerValue: '12' } },
    { slug: { stringValue: slug, integerValue: '12' } },
    { title: text('') },
    { title: text(' '.repeat(10)) },
    { title: text('x'.repeat(10001)) },
    { title: { integerValue: '7' } },
    { gateType: text('video') },
    { gateType: { booleanValue: true } },
    { emailCapture: { stringValue: 'true' } },
    { emailCapture: { booleanValue: true, stringValue: 'true' } },
    { reward: null },
    { reward: { mapValue: { fields: {} } } },
    { reward: { mapValue: { fields: { url: { integerValue: '9' } } } } },
    {
      gateType: text('file'),
      reward: { mapValue: { fields: { url: text(target) } } },
    },
  ])('rejects inconsistent typed gate fields: %j', async (override) => {
    expect(await valorizd.resolve(gate(), context(body(override)).context)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it.each([
    'javascript:alert(1)',
    'data:text/plain,hello',
    'http://example.org/music.wav',
    'https://user:pass@example.org/music.wav',
    'https://example.org:444/music.wav',
    'https://localhost/music.wav',
    'https://127.0.0.1/music.wav',
    'https://10.2.3.4/music.wav',
    'https://[::1]/music.wav',
    'https://example.internal/music.wav',
    'https://www.valorizd.app/gates/other',
    'https://valorizd.app/gates/other',
    'https://firestore.googleapis.com/v1/query',
    'https://example.org/' + 'a'.repeat(16384),
  ])('rejects unsafe, recursive, or oversized destinations: %s', async (destination) => {
    const { context: ctx } = context(
      body({ reward: { mapValue: { fields: { url: text(destination) } } } }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });
  it.each([
    [400, 'invalid-response'],
    [401, 'server-required'],
    [403, 'server-required'],
    [404, 'not-supported'],
    [410, 'not-supported'],
    [429, 'rate-limited'],
    [500, 'network-error'],
  ])('classifies HTTP %i without exposing backend data', async (status, code) => {
    expect(
      await valorizd.resolve(
        gate(),
        context({ error: { message: 'private server detail' } }, status as number).context,
      ),
    ).toMatchObject({ ok: false, code });
  });
  it('rejects an unexpected media type and malformed JSON', async () => {
    const { context: ctx, fetch } = context();
    fetch.mockResolvedValueOnce(response(body(), 200, { 'content-type': 'text/html' }));
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    fetch.mockResolvedValueOnce(
      new Response('not json', {
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it('cancels a declared oversized body without reading or exposing it', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ cancel });
    const { context: ctx, fetch } = context();
    fetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: {
          'content-type': 'application/json',
          'content-length': String(256 * 1024 + 1),
        },
      }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(cancel).toHaveBeenCalled();
  });
  it('bounds a streamed response even without Content-Length', async () => {
    const cancel = vi.fn();
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new Uint8Array(256 * 1024 + 1));
        }
      },
      cancel,
    });
    const { context: ctx, fetch } = context();
    fetch.mockResolvedValueOnce(
      new Response(stream, { headers: { 'content-type': 'application/json' } }),
    );
    expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(cancel).toHaveBeenCalled();
  });
  it('reports network failures and timeouts without a retry loop', async () => {
    const { context: ctx, fetch } = context();
    for (const error of [
      new TypeError('private network detail'),
      new DOMException('timeout', 'TimeoutError'),
    ]) {
      fetch.mockRejectedValueOnce(error);
      expect(await valorizd.resolve(gate(), ctx)).toMatchObject({
        ok: false,
        code: 'network-error',
      });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('propagates cancellation before fetching and during a request', async () => {
    const first = context();
    first.controller.abort();
    await expect(valorizd.resolve(gate(), first.context)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(first.fetch).not.toHaveBeenCalled();
    const second = context();
    second.fetch.mockImplementationOnce(async (_url, init) => {
      second.controller.abort();
      init?.signal?.throwIfAborted();
      throw new Error('unreachable');
    });
    await expect(valorizd.resolve(gate(), second.context)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(second.fetch).toHaveBeenCalledTimes(1);
    const third = context();
    third.fetch.mockImplementationOnce(async () => {
      third.controller.abort();
      return response({}, 403);
    });
    await expect(valorizd.resolve(gate(), third.context)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
