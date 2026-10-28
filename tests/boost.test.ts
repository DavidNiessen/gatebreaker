import { describe, expect, it, vi } from 'vitest';
import type { Gate, ProviderContext } from '../src/domain/provider';
import { boost } from '../src/providers/boost';

const pageUrl = new URL('https://boost.ink/fixture-01');
const target = 'https://mega.nz/file/fixture#file-key';
const attribute = 'bufpsvdhmjybvgfncqfa';

function html(destination: string | null = btoa(target), extra = ''): string {
  return `<!doctype html><html><head>${extra}<title>Boost.ink</title></head><body><h1>Complete the steps to proceed</h1><a class="step_block" href="https://www.youtube.com/channel/fixture">Subscribe</a><button class="complete_btn" disabled>Proceed</button><script src="/assets/js/unlock.js?v=3.5.10" ${destination === null ? '' : `${attribute}="${destination}"`}></script></body></html>`;
}
function fixture(source = html()): Document {
  return new DOMParser().parseFromString(source, 'text/html');
}
function gate(document = fixture(html(null))): Gate {
  const inspected = boost.inspect(document, pageUrl);
  if (!inspected) throw new Error('Fixture must be detected');
  return inspected;
}
function context(body = html(), status = 200, contentType = 'text/html'): ProviderContext {
  return {
    pageUrl,
    fetch: vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status,
        headers: { 'content-type': contentType },
      }),
    ),
    probePublicFile: vi.fn().mockResolvedValue(null),
  };
}

describe('Boost.ink detection and presentation', () => {
  it.each([
    'https://boost.ink/2rd',
    'https://boost.ink/-s2',
    'https://de.boost.ink/fixture-01',
    'https://nl.boost.ink/me1-q',
  ])('recognizes a supported gate address %s', (url) => {
    expect(boost.matches(new URL(url))).toBe(true);
    expect(boost.inspect(fixture(), new URL(url))?.id).toBe(new URL(url).pathname.slice(1));
  });

  it.each([
    'http://boost.ink/a',
    'https://boost.ink.evil.invalid/a',
    'https://evil.invalid/boost.ink/a',
    'https://dev.boost.ink/a',
    'https://www.boost.ink/a',
    'https://boost.ink:444/a',
    'https://name:secret@boost.ink/a',
    'https://boost.ink/',
    'https://boost.ink/user/a',
    'https://boost.ink/a%2Fb',
    `https://boost.ink/${'a'.repeat(65)}`,
  ])('rejects unsupported or spoofed URL %s', (url) => {
    expect(boost.matches(new URL(url))).toBe(false);
    expect(boost.inspect(fixture(), new URL(url))).toBeNull();
  });

  it('does not detect a homepage or generic similarly named control', () => {
    expect(
      boost.inspect(
        fixture('<h1>Boost.ink</h1><button class="complete_btn">Create link</button>'),
        pageUrl,
      ),
    ).toBeNull();
    expect(
      boost.inspect(
        fixture(html().replace('button class="complete_btn"', 'button class="other"')),
        pageUrl,
      ),
    ).toBeNull();
  });

  it('does not trust a foreign script or cross-origin base for relative scripts', () => {
    expect(
      boost.inspect(
        fixture(html().replace('/assets/js/unlock.js', 'https://evil.invalid/assets/js/unlock.js')),
        pageUrl,
      ),
    ).toBeNull();
    expect(
      boost.inspect(fixture(html(undefined, '<base href="https://evil.invalid/">')), pageUrl),
    ).toBeNull();
    expect(
      boost.inspect(fixture(html(undefined, '<base href="https://boost.ink/">')), pageUrl),
    ).not.toBeNull();
  });

  it('accepts an owned absolute script independently of a foreign base', () => {
    const source = html(undefined, '<base href="https://evil.invalid/">').replace(
      'src="/assets/js/',
      'src="https://boost.ink/assets/js/',
    );
    expect(boost.inspect(fixture(source), pageUrl)).not.toBeNull();
  });

  it('inspects an attribute already removed at document_idle without a request or click', () => {
    const document = fixture(html(null));
    const clicked = vi.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    expect(boost.inspect(document, pageUrl)).toMatchObject({
      provider: 'boost',
      id: 'fixture-01',
      metadata: { encodedDestination: '' },
    });
    expect(clicked).not.toHaveBeenCalled();
    const presentation = boost.presentation?.(document, pageUrl);
    expect(presentation?.anchor).toBe(document.querySelector('h1'));
    expect(Object.keys(presentation!)).toEqual(['anchor']);
  });
});

describe('Boost.ink account-free destination resolution', () => {
  it('resolves the still-present native field without fetching or stripping a MEGA file key', async () => {
    const ctx = context();
    expect(await boost.resolve(gate(fixture()), ctx)).toEqual({
      ok: true,
      url: target,
      method: 'embedded-link',
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(ctx.probePublicFile).not.toHaveBeenCalled();
  });

  it('refetches only the current gate inert HTML after the native script removes its attribute', async () => {
    const ctx = context();
    expect(await boost.resolve(gate(), ctx)).toEqual({
      ok: true,
      url: target,
      method: 'embedded-link',
    });
    expect(ctx.fetch).toHaveBeenCalledOnce();
    expect(ctx.fetch).toHaveBeenCalledWith(
      pageUrl.href,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      }),
    );
    expect(ctx.probePublicFile).not.toHaveBeenCalled();
  });

  it('does not fetch the final destination or execute native page scripts', async () => {
    const ctx = context(
      html().replace('</body>', '<script>throw new Error("must never execute")</script></body>'),
    );
    expect((await boost.resolve(gate(), ctx)).ok).toBe(true);
    expect(vi.mocked(ctx.fetch).mock.calls.map(([url]) => String(url))).toEqual([pageUrl.href]);
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com/file',
    'https://user:password@example.com/file',
    'https://example.com:444/file',
    'https://localhost/file',
    'https://127.0.0.1/file',
    'https://192.168.0.1/file',
    'https://[::1]/file',
    'https://boost.ink/fixture-01?again=1',
    'https://de.boost.ink/fixture-01#again',
  ])('rejects unsafe or looping embedded URL %s', async (url) => {
    expect(await boost.resolve(gate(fixture(html(btoa(url)))), context())).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it.each(['not base64!', 'a', 'AAAA====', 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==='])(
    'rejects malformed base64 %s',
    async (encoded) => {
      expect(await boost.resolve(gate(fixture(html(encoded))), context())).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    },
  );

  it('bounds the encoded/decoded destination before offering it', async () => {
    expect(
      await boost.resolve(
        gate(fixture(html(btoa(`https://example.com/${'x'.repeat(16384)}`)))),
        context(),
      ),
    ).toMatchObject({ ok: false, code: 'invalid-response' });
  });

  it.each([404, 410])('reports an unavailable gate for HTTP %s', async (status) => {
    expect(await boost.resolve(gate(), context('', status))).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
  });
  it.each([401, 403])('reports server checks for HTTP %s', async (status) => {
    expect(await boost.resolve(gate(), context('', status))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
  });
  it('reports throttling without retrying', async () => {
    const ctx = context('', 429);
    expect(await boost.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'rate-limited',
    });
    expect(ctx.fetch).toHaveBeenCalledOnce();
  });
  it('reports an ordinary server failure', async () => {
    expect(await boost.resolve(gate(), context('', 503))).toMatchObject({
      ok: false,
      code: 'network-error',
    });
  });
  it('rejects non-HTML, wrong layout, missing field, and oversized responses', async () => {
    for (const ctx of [
      context('{}', 200, 'application/json'),
      context('<h1>Homepage</h1>'),
      context(html(null)),
      context('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
      expect(await boost.resolve(gate(), ctx)).toMatchObject({
        ok: false,
        code: 'invalid-response',
      });
    }
  });
  it('rejects a response identifying a different page', async () => {
    const response = new Response(html(), {
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperty(response, 'url', {
      value: 'https://boost.ink/different',
    });
    const ctx = context();
    vi.mocked(ctx.fetch).mockResolvedValue(response);
    expect(await boost.resolve(gate(), ctx)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
  });
  it('does not let metadata retarget the refetch', async () => {
    const ctx = context();
    expect(await boost.resolve({ ...gate(), id: 'different' }, ctx)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(await boost.resolve({ ...gate(), provider: 'other' }, ctx)).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it('stops an already cancelled resolution before a fetch or decode', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = { ...context(), signal: controller.signal };
    await expect(boost.resolve(gate(), ctx)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it('connects request cancellation and stops after aborting during the fetch', async () => {
    const controller = new AbortController();
    const ctx = { ...context(), signal: controller.signal };
    vi.mocked(ctx.fetch).mockImplementation(async (_, init) => {
      expect(init?.signal?.aborted).toBe(false);
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      return new Response(html(), { headers: { 'content-type': 'text/html' } });
    });
    await expect(boost.resolve(gate(), ctx)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
  it('allows transport failures to reach application error handling without retries', async () => {
    const ctx = context();
    vi.mocked(ctx.fetch).mockRejectedValue(new TypeError('network failed'));
    await expect(boost.resolve(gate(), ctx)).rejects.toBeInstanceOf(TypeError);
    expect(ctx.fetch).toHaveBeenCalledOnce();
  });
});
