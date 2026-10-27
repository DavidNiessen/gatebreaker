import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Gate, ProviderContext } from '../src/domain/provider';
import { rekonise, rekoniseWaitMs } from '../src/providers/rekonise';

const slug = 'fixture-music-pack-ab123';
const pageUrl = new URL(`https://rekonise.com/${slug}`);
const token = 'public-fixture-token+/=unchanged';
const destination = 'https://downloads.example.org/free-pack.zip';
const data = (override: Record<string, unknown> = {}) => ({
  slug,
  title: 'Fixture sample pack',
  type: 1,
  status: 1,
  actions: [{ type: 1 }],
  unlock_token: token,
  ...override,
});

function fixture(
  value: unknown = data(),
  url = pageUrl,
): { document: Document; gate: Gate | null } {
  const document = window.document.implementation.createHTMLDocument('Fixture');
  document.body.innerHTML =
    '<app-social-unlock-detail-page><app-social-unlock><div class="title-row"><h1>Fixture sample pack</h1></div><div class="steps-col"><div class="actions-stack"><button>Native action</button></div><div class="unlock-footer"><button class="cta-button">Unlock link</button></div></div></app-social-unlock></app-social-unlock-detail-page>';
  const script = document.createElement('script');
  script.id = 'ng-state';
  script.type = 'application/json';
  script.textContent = JSON.stringify({
    fixture: {
      b: value,
      s: 200,
      u: 'http://127.0.0.1:3000/untrusted-transfer-url',
    },
  });
  document.head.append(script);
  return { document, gate: rekonise.inspect(document, url) };
}

function inspected(): Gate {
  const gate = fixture().gate;
  if (!gate) throw new Error('Fixture gate was not recognized');
  return gate;
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function context(
  metadata: unknown = data(),
  result: unknown = {
    url: destination,
    pass: 'private-returned-pass-never-retained',
  },
) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response(metadata))
    .mockResolvedValueOnce(response(result));
  const onProgress = vi.fn();
  const controller = new AbortController();
  const value: ProviderContext = {
    pageUrl,
    fetch,
    signal: controller.signal,
    probePublicFile: vi.fn(),
    onProgress,
  };
  return { value, fetch, onProgress, controller };
}

async function finish(value: ProviderContext, gate = inspected()) {
  const pending = rekonise.resolve(gate, value);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1400000);
  return pending;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Rekonise recognition and page boundaries', () => {
  it('recognizes a matching SSR public model without retaining its public token or internal response URL', () => {
    const { gate } = fixture();
    expect(gate).toEqual({
      provider: 'rekonise',
      id: slug,
      title: 'Fixture sample pack',
      steps: ['action-1'],
      metadata: {},
    });
    expect(JSON.stringify(gate)).not.toContain(token);
    expect(JSON.stringify(gate)).not.toContain('127.0.0.1');
  });

  it.each([
    'http://rekonise.com/fixture-music-pack-ab123',
    'https://rekonise.com.evil.invalid/fixture-music-pack-ab123',
    'https://user@rekonise.com/fixture-music-pack-ab123',
    'https://rekonise.com:444/fixture-music-pack-ab123',
    'https://rekonise.com/user/creator',
    'https://rekonise.com/dashboard',
    'https://rekonise.com/a/%2f/b',
    'https://rekonise.com/../../admin',
    'https://rekonise.com/',
  ])('rejects unsupported origin or route %s', (input) => {
    const url = new URL(input);
    expect(rekonise.matches(url)).toBe(false);
    expect(fixture(data(), url).gate).toBeNull();
  });

  it('checks custom user/slug routes against matching transferred model fields', () => {
    const url = new URL('https://rekonise.com/fixtureproducer/free-pack');
    expect(
      fixture(
        data({
          custom_slug: 'free-pack',
          user: { username: 'fixtureproducer' },
        }),
        url,
      ).gate?.id,
    ).toBe('fixtureproducer/free-pack');
    expect(
      fixture(
        data({
          custom_slug: 'different',
          user: { username: 'fixtureproducer' },
        }),
        url,
      ).gate,
    ).toBeNull();
    expect(
      fixture(data({ custom_slug: 'free-pack', user: { username: 'other' } }), url).gate,
    ).toBeNull();
  });

  it('rejects stale transferred model data after navigation and malformed state', () => {
    expect(fixture(data({ slug: 'another-pack-ab123' })).gate).toBeNull();
    const { document } = fixture();
    document.querySelector('#ng-state')!.textContent = '{bad';
    expect(rekonise.inspect(document, pageUrl)).toBeNull();
    document.querySelector('#ng-state')!.textContent = ' '.repeat(1024 * 1024 + 1);
    expect(rekonise.inspect(document, pageUrl)).toBeNull();
  });

  it('recognizes the native gate without consumed transfer state and makes no inspection request', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { document } = fixture();
    document.querySelector('#ng-state')!.remove();
    expect(rekonise.inspect(document, pageUrl)).toEqual({
      provider: 'rekonise',
      id: slug,
      title: 'Fixture sample pack',
      steps: [],
      metadata: {},
    });
    expect(rekonise.presentation?.(document, pageUrl)?.hiddenSelectors).toContain(
      'app-social-unlock .actions-stack',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects homepage demo widgets even if nested inside an outer detail-page shell', () => {
    const { document } = fixture();
    document.querySelector('#ng-state')!.remove();
    const widget = document.querySelector('app-social-unlock')!;
    const home = document.createElement('app-home');
    widget.replaceWith(home);
    home.append(widget);
    expect(rekonise.inspect(document, pageUrl)).toBeNull();
    expect(rekonise.presentation?.(document, pageUrl)).toBeNull();
    document.body.replaceChildren(widget);
    expect(rekonise.inspect(document, pageUrl)).toBeNull();
  });

  it('keeps custom route identity stable after transfer-state consumption and uses canonical metadata only for unlock', async () => {
    vi.useFakeTimers();
    const url = new URL('https://rekonise.com/fixtureproducer/free-pack');
    const metadata = data({ custom_slug: 'free-pack', user: { username: 'fixtureproducer' } });
    const { document, gate } = fixture(metadata, url);
    expect(gate?.id).toBe('fixtureproducer/free-pack');
    document.querySelector('#ng-state')!.remove();
    const consumed = rekonise.inspect(document, url)!;
    expect(consumed.id).toBe(gate!.id);
    const test = context(metadata);
    expect((await finish({ ...test.value, pageUrl: url }, consumed)).ok).toBe(true);
    expect(String(test.fetch.mock.calls[0]![0])).toBe(
      'https://api.rekonise.com/social-unlocks/fixtureproducer/free-pack',
    );
    expect(new URL(String(test.fetch.mock.calls[1]![0])).pathname).toBe(
      `/social-unlocks/${slug}/unlock`,
    );
  });

  it('rejects a fresh custom-route response whose owner does not match the requested alias', async () => {
    vi.useFakeTimers();
    const url = new URL('https://rekonise.com/fixtureproducer/free-pack');
    const { document } = fixture();
    document.querySelector('#ng-state')!.remove();
    const gate = rekonise.inspect(document, url)!;
    const test = context(data({ custom_slug: 'free-pack', user: { username: 'another-owner' } }));
    expect(await finish({ ...test.value, pageUrl: url }, gate)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(test.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires the native gate marker and preserves its title outside hidden action controls', () => {
    const { document } = fixture();
    const presentation = rekonise.presentation?.(document, pageUrl);
    expect(presentation?.anchor).toBe(document.querySelector('.title-row'));
    expect(presentation?.hiddenSelectors).toContain('app-social-unlock .actions-stack');
    expect(
      presentation?.hiddenSelectors.some((selector) =>
        document.querySelector('h1')!.matches(selector),
      ),
    ).toBe(false);
    document.querySelector('app-social-unlock')!.remove();
    expect(rekonise.inspect(document, pageUrl)).toBeNull();
  });

  it('does not hide native controls for recognized unsupported snippet gates', () => {
    const { document } = fixture(data({ type: 3 }));
    expect(rekonise.presentation?.(document, pageUrl)?.hiddenSelectors).toEqual([]);
  });
});

describe('Rekonise native timer and privacy', () => {
  it('waits before the sole unlock request, reports coarse countdown, and returns no pass/token', async () => {
    vi.useFakeTimers();
    const test = context();
    const pending = rekonise.resolve(inspected(), test.value);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    expect(test.onProgress).toHaveBeenCalledWith(expect.objectContaining({ remainingSeconds: 20 }));
    await vi.advanceTimersByTimeAsync(19999);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({
      ok: true,
      url: destination,
      method: 'provider-request',
    });
    expect(test.fetch).toHaveBeenCalledTimes(2);
    expect(test.onProgress.mock.calls.length).toBeLessThanOrEqual(23);
    const metadataUrl = new URL(String(test.fetch.mock.calls[0]![0]));
    const unlockUrl = new URL(String(test.fetch.mock.calls[1]![0]));
    expect(metadataUrl.href).toBe(`https://api.rekonise.com/social-unlocks/${slug}`);
    expect(unlockUrl.origin).toBe('https://api.rekonise.com');
    expect(unlockUrl.pathname).toBe(`/social-unlocks/${slug}/unlock`);
    expect([...unlockUrl.searchParams.keys()]).toEqual(['token']);
    expect(unlockUrl.searchParams.get('token')).toBe(token);
    for (const [, init] of test.fetch.mock.calls)
      expect(init).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
    expect(test.value.probePublicFile).not.toHaveBeenCalled();
  });

  it('uses source upper bounds for ordinary, watch-video, mixed, and excessive action configurations', () => {
    expect(rekoniseWaitMs([])).toBe(0);
    expect(rekoniseWaitMs([{ type: 1 }])).toBe(20000);
    expect(rekoniseWaitMs([{ type: 1 }, { type: 3 }])).toBe(35000);
    expect(rekoniseWaitMs([{ type: 30 }])).toBe(50000);
    expect(rekoniseWaitMs([{ type: 30 }, { type: 1 }])).toBe(65000);
    expect(rekoniseWaitMs(Array.from({ length: 30 }, () => ({ type: 30 })))).toBe(1355000);
    expect(rekoniseWaitMs(Array.from({ length: 31 }, () => ({ type: 1 })))).toBeNull();
  });

  it('uses fresh metadata rather than stale SSR token or action count', async () => {
    vi.useFakeTimers();
    const test = context(
      data({
        actions: [{ type: 1 }, { type: 3 }],
        unlock_token: 'different-public-token',
      }),
    );
    const pending = rekonise.resolve(inspected(), test.value);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20000);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await pending).ok).toBe(true);
    expect(new URL(String(test.fetch.mock.calls[1]![0])).searchParams.get('token')).toBe(
      'different-public-token',
    );
  });

  it('cancels a timer immediately and sends no unlock after cancellation', async () => {
    vi.useFakeTimers();
    const test = context();
    const pending = rekonise.resolve(inspected(), test.value);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(1000);
    test.controller.abort();
    await rejected;
    const count = test.onProgress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    expect(test.onProgress).toHaveBeenCalledTimes(count);
  });

  it('does no network work for an already aborted context or a mismatched provider', async () => {
    const test = context();
    test.controller.abort();
    await expect(rekonise.resolve(inspected(), test.value)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(test.fetch).not.toHaveBeenCalled();
    expect(
      await rekonise.resolve({ ...inspected(), provider: 'other' }, context().value),
    ).toMatchObject({ ok: false, code: 'not-supported' });
  });
});

describe('Rekonise response and capability boundaries', () => {
  const fileUrl =
    'https://api.rekonise.com/storage/serve/b64_Zml4dHVyZS1vYmplY3Q=?exp=123&sig=fixture%2Bsignature%3D';

  it('recognizes and resolves the observed underscore-bearing uploaded-file slug shape', async () => {
    vi.useFakeTimers();
    const fileSlug = 'rels-b-vocal-preset-by-underisland_-9cofs';
    const url = new URL(`https://rekonise.com/${fileSlug}`);
    const metadata = data({ slug: fileSlug, type: 2 });
    const { gate } = fixture(metadata, url);
    expect(rekonise.matches(url)).toBe(true);
    expect(gate?.id).toBe(fileSlug);
    const test = context(metadata, { file: fileUrl });
    expect(await finish({ ...test.value, pageUrl: url }, gate!)).toEqual({
      ok: true,
      url: fileUrl,
      method: 'provider-request',
    });
    expect(new URL(String(test.fetch.mock.calls[1]![0])).pathname).toBe(
      `/social-unlocks/${fileSlug}/unlock`,
    );
  });

  it('returns only the native signed file route for uploaded-file gates without fetching file bytes', async () => {
    vi.useFakeTimers();
    const test = context(data({ type: 2 }), { file: fileUrl, pass: 'private-pass-not-retained' });
    expect(await finish(test.value)).toEqual({
      ok: true,
      url: fileUrl,
      method: 'provider-request',
    });
    expect(test.fetch).toHaveBeenCalledTimes(2);
    expect(test.fetch.mock.calls.every(([url]) => !String(url).includes('/storage/serve/'))).toBe(
      true,
    );
    const { document } = fixture(data({ type: 2 }));
    expect(rekonise.presentation?.(document, pageUrl)?.hiddenSelectors).toContain(
      'app-social-unlock .actions-stack',
    );
  });

  it.each([
    'https://api.rekonise.com/private?exp=1&sig=test',
    'https://api.rekonise.com/storage/serve/b64_test?exp=1&sig=test&extra=1',
    'https://api.rekonise.com/storage/serve/b64_test?exp=1&exp=2&sig=test',
    'https://api.rekonise.com/storage/serve/b64_test?exp=1',
    'https://api.rekonise.com/storage/serve/b64_test?exp=&sig=test',
    'https://api.rekonise.com/storage/serve/b64_test?exp=1&sig=',
    'https://api.rekonise.com/storage/serve/b64_test/other?exp=1&sig=test',
    'https://api.rekonise.com/storage/serve/b64_test?exp=1&sig=test#fragment',
    'https://api.rekonise.com.evil.invalid/storage/serve/b64_test?exp=1&sig=test',
    'https://downloads.example.org/file?exp=1&sig=test',
  ])('rejects unrecognized uploaded-file capability %s', async (file) => {
    vi.useFakeTimers();
    expect(await finish(context(data({ type: 2 }), { file }).value)).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it('resolves email-list gates by waiting only, with no address or subscription request', async () => {
    vi.useFakeTimers();
    const test = context(data({ email_lists: [123] }));
    const pending = rekonise.resolve(inspected(), test.value);
    await vi.advanceTimersByTimeAsync(20000);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await pending).ok).toBe(true);
    expect(test.fetch).toHaveBeenCalledTimes(2);
    expect(
      test.fetch.mock.calls.every(([url]) => !String(url).toLowerCase().includes('email')),
    ).toBe(true);
    expect(rekoniseWaitMs([{ type: 1 }], true)).toBe(35000);
    expect(rekoniseWaitMs([], true)).toBe(20000);
    expect(
      rekoniseWaitMs(
        Array.from({ length: 30 }, () => ({ type: 30 })),
        true,
      ),
    ).toBe(1370000);
  });

  it.each([3, 4])(
    'rejects unsupported gate type %s before waiting or requesting unlock',
    async (type) => {
      vi.useFakeTimers();
      const test = context(data({ type }));
      expect(await finish(test.value)).toMatchObject({
        ok: false,
        code: 'not-supported',
      });
      expect(test.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([2, 3, 4, 7])('rejects expired/removed/enforced status %s', async (status) => {
    vi.useFakeTimers();
    expect(await finish(context(data({ status })).value)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
  });

  it('rejects unknown action codes, missing token and overlong model arrays without requesting unlock', async () => {
    vi.useFakeTimers();
    for (const metadata of [
      data({ actions: [{ type: 70 }] }),
      data({ unlock_token: '' }),
      data({ actions: Array.from({ length: 31 }, () => ({ type: 1 })) }),
    ]) {
      const test = context(metadata);
      expect((await finish(test.value)).ok).toBe(false);
      expect(test.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a fresh metadata model for another gate instead of using its token', async () => {
    vi.useFakeTimers();
    const test = context(data({ slug: 'other-music-pack-cd456' }));
    expect(await finish(test.value)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(test.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 410, 429, 500])(
    'handles API HTTP %s without unbounded retry',
    async (status) => {
      const test = context();
      test.fetch.mockReset().mockResolvedValueOnce(response({ message: 'refused' }, status));
      expect((await rekonise.resolve(inspected(), test.value)).ok).toBe(false);
      expect(test.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('reports refusal after an eligible wait without claiming an account action or retrying', async () => {
    vi.useFakeTimers();
    const test = context();
    test.fetch
      .mockReset()
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(response({ message: 'Unable to unlock' }, 403));
    expect(await finish(test.value)).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(test.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    'http://example.org/a',
    'javascript:alert(1)',
    'https://user@example.org/a',
    'https://example.org:444/a',
    'https://rekonise.com/another-gate',
    'https://api.rekonise.com/private',
    'https://127.0.0.1/file',
    'https://localhost/file',
    'https://[::1]/file',
    'not a URL',
  ])('rejects unsafe or recursive result %s', async (url) => {
    vi.useFakeTimers();
    expect(await finish(context(data(), { url }).value)).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it.each([null, [], {}, { file: destination }, { url: 7 }])(
    'rejects malformed or wrong-type response %#',
    async (value) => {
      vi.useFakeTimers();
      expect(await finish(context(data(), value).value)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    },
  );

  it('bounds declared and streamed API response bodies and rejects unexpected HTML', async () => {
    vi.useFakeTimers();
    for (const untrusted of [
      new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'content-length': '9999999',
        },
      }),
      new Response(' '.repeat(256 * 1024 + 1), {
        headers: { 'content-type': 'application/json' },
      }),
      new Response('<html>Challenge</html>', {
        headers: { 'content-type': 'text/html' },
      }),
      new Response('{bad', { headers: { 'content-type': 'application/json' } }),
    ]) {
      const test = context();
      test.fetch.mockReset().mockResolvedValueOnce(untrusted);
      expect(await finish(test.value)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
      expect(test.fetch).toHaveBeenCalledTimes(1);
    }
  });
});
