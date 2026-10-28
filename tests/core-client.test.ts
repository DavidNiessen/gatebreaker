// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGatebreaker } from '../src/core';
import type { CoreOptions, CoreProvider, GatePage, Resolution } from '../src/core';
import { sub2unlock } from '../src/core/providers/sub2unlock';
import { boost } from '../src/core/providers/boost';
import { hypeddit } from '../src/core/providers/hypeddit';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: { document: Document; close(): void } };
};
const windows: { close(): void }[] = [];
function parseHtml(html: string, url: URL): Document {
  const dom = new JSDOM(html, { url: url.href });
  windows.push(dom.window);
  return dom.window.document;
}
afterEach(() => {
  for (const window of windows.splice(0)) window.close();
});

const url = 'https://fixture.example/gates/one';
const destination = 'https://files.example/original.wav#file-key';
const html = '<h1 data-gate="one">Fixture download</h1>';
function provider(resolve?: CoreProvider['resolve']): CoreProvider {
  return {
    id: 'fixture',
    name: 'Fixture',
    matches: (page) =>
      page.origin === 'https://fixture.example' && page.pathname.startsWith('/gates/'),
    inspect(document) {
      const title = document.querySelector('h1[data-gate]');
      return title
        ? {
            provider: 'fixture',
            id: title.getAttribute('data-gate')!,
            title: title.textContent!,
            steps: ['ordinary-step'],
            metadata: { csrf: 'authored-secret-not-for-public-summary' },
          }
        : null;
    },
    resolve: resolve ?? (async () => ({ ok: true, url: destination, method: 'provider-request' })),
  };
}
function options(overrides: Partial<CoreOptions> = {}): CoreOptions {
  return {
    providers: [provider()],
    fetch: vi.fn<typeof fetch>(),
    parseHtml: vi.fn(parseHtml),
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('Reusable core in Node without browser or extension globals', () => {
  it('imports safely and lists supported providers without parsing or requests', () => {
    for (const name of ['chrome', 'browser', 'document', 'window', 'DOMParser'])
      expect(name in globalThis).toBe(false);
    const dependencies = options();
    const engine = createGatebreaker(dependencies);
    expect(engine.providers).toEqual([{ id: 'fixture', name: 'Fixture' }]);
    expect(engine.supports(url)).toBe(true);
    expect(engine.supports('https://unrelated.example/')).toBe(false);
    expect(engine.supports('not a URL')).toBe(false);
    expect(dependencies.fetch).not.toHaveBeenCalled();
    expect(dependencies.parseHtml).not.toHaveBeenCalled();
  });

  it('parses lazily once, exposes only copied summaries and performs no I/O on inspection', () => {
    const dependencies = options({
      probePublicFile: vi.fn(async () => null),
      readNativeSession: vi.fn(() => 'native-session'),
      readNativeReceipt: vi.fn(() => 'native-gate-receipt'),
    });
    const session = createGatebreaker(dependencies).createSession({ url, html });
    expect(dependencies.parseHtml).not.toHaveBeenCalled();
    const summary = session.inspect();
    expect(summary).toEqual({
      provider: 'fixture',
      id: 'one',
      title: 'Fixture download',
      steps: ['ordinary-step'],
    });
    expect(session.inspect()).toEqual(summary);
    expect(session.inspect()).not.toBe(summary);
    expect(JSON.stringify(summary)).not.toContain('csrf');
    expect(JSON.stringify(summary)).not.toContain('authored-secret');
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary!.steps)).toBe(true);
    expect(dependencies.parseHtml).toHaveBeenCalledTimes(1);
    expect(dependencies.fetch).not.toHaveBeenCalled();
    expect(dependencies.probePublicFile).not.toHaveBeenCalled();
    expect(dependencies.readNativeSession).not.toHaveBeenCalled();
    expect(dependencies.readNativeReceipt).not.toHaveBeenCalled();
  });

  it('uses caller-owned Documents without parsing and snapshots mutable URL inputs', async () => {
    const inputUrl = new URL(url);
    const document = parseHtml(html, inputUrl);
    const dependencies = options();
    const session = createGatebreaker(dependencies).createSession({ url: inputUrl, document });
    inputUrl.hostname = 'unrelated.example';
    expect(session.url).toBe(url);
    expect(session.inspect()?.id).toBe('one');
    expect(await session.resolve()).toMatchObject({ ok: true, url: destination });
    expect(dependencies.parseHtml).not.toHaveBeenCalled();
  });

  it('preserves declared input requirements without exposing captured values or metadata', () => {
    const original = provider();
    const current: CoreProvider = {
      ...original,
      inspect(document, page) {
        return {
          ...original.inspect(document, page)!,
          inputs: [{ kind: 'soundcloud-comment', required: true }],
        };
      },
    };
    const session = createGatebreaker(options({ providers: [current] })).createSession({
      url,
      html,
    });
    expect(session.inspect()?.inputs).toEqual([{ kind: 'soundcloud-comment', required: true }]);
    expect(Object.isFrozen(session.inspect()?.inputs)).toBe(true);
    expect(Object.isFrozen(session.inspect()?.inputs?.[0])).toBe(true);
    expect(JSON.stringify(session.inspect())).not.toContain('authored-secret');
  });

  it('never parses or fetches an unsupported page, even after explicit resolution', async () => {
    const dependencies = options();
    const session = createGatebreaker(dependencies).createSession({
      url: 'https://unrelated.example/gates/one',
      html,
    });
    expect(session.inspect()).toBeNull();
    expect(await session.resolve()).toMatchObject({ ok: false, code: 'not-supported' });
    expect(dependencies.parseHtml).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'http://fixture.example/gates/one',
    'https://user:secret@fixture.example/gates/one',
    'https://127.0.0.1/gates/one',
    'file:///private/file',
  ])('rejects unsafe page identity before calling any capability: %s', (pageUrl) => {
    const dependencies = options();
    const engine = createGatebreaker(dependencies);
    expect(engine.supports(pageUrl)).toBe(false);
    expect(() => engine.createSession({ url: pageUrl, html })).toThrow(TypeError);
    expect(dependencies.parseHtml).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it('requires exactly one HTML or Document input', () => {
    const engine = createGatebreaker(options());
    expect(() => engine.createSession({ url } as GatePage)).toThrow(/exactly one/);
    expect(() =>
      engine.createSession({
        url,
        html,
        document: parseHtml(html, new URL(url)),
      } as unknown as GatePage),
    ).toThrow(/exactly one/);
  });

  it('resolves an actual Sub2Unlock SSR model without network, native actions or key loss', async () => {
    const target = 'https://mega.nz/file/fixture#required-file-key';
    const model = {
      page: '/[uniquer]',
      props: {
        pageProps: {
          sink: {
            data: {
              uniquer: 'Ab3xY',
              title: 'Core SSR fixture',
              deleted_at: null,
              unlocked_link: target,
              blocks: [],
            },
          },
        },
      },
    };
    const dependencies = options({ providers: [sub2unlock] });
    const session = createGatebreaker(dependencies).createSession({
      url: 'https://sub2unlock.com/Ab3xY',
      html: `<div id="__next"><h3>Core SSR fixture</h3></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(model)}</script>`,
    });
    expect(session.inspect()?.title).toBe('Core SSR fixture');
    expect(await session.resolve()).toEqual({ ok: true, url: target, method: 'embedded-link' });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it('injects the HTML parser for a real Boost refetch without installing DOMParser globally', async () => {
    const target = 'https://mega.nz/file/boost#preserved-key';
    const markup = (encoded = '') =>
      `<h1>Boost</h1><button class="complete_btn">Proceed</button><script src="/assets/js/unlock.js" ${encoded ? `bufpsvdhmjybvgfncqfa="${encoded}"` : ''}></script>`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(markup(btoa(target)), { headers: { 'Content-Type': 'text/html' } }),
      );
    const dependencies = options({ providers: [boost], fetch: fetcher });
    const session = createGatebreaker(dependencies).createSession({
      url: 'https://boost.ink/fixture-01',
      html: markup(),
    });
    expect(await session.resolve()).toEqual({ ok: true, url: target, method: 'embedded-link' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('https://boost.ink/fixture-01');
    expect(dependencies.parseHtml).toHaveBeenCalledTimes(2);
    expect('DOMParser' in globalThis).toBe(false);
  });

  it('prepares an account-free Hypeddit email only after explicit automated resolution', async () => {
    const pageUrl = 'https://hypeddit.com/authored/core-email';
    const file = 'https://hypeddit.com/download/authoredCoreEmail';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (input) =>
          new Response(
            JSON.stringify(
              String(input).endsWith('/verifyEmailAddress')
                ? { status: 'T' }
                : { download_status: true, URL: file },
            ),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      );
    const session = createGatebreaker(
      options({ providers: [hypeddit], fetch: fetcher }),
    ).createSession({
      url: pageUrl,
      html: `<meta name="csrf-token" content="authored-core-csrf-00000000"><h1>Core email</h1><button id="downloadProcess">Native download</button><input id="current_download_file_listner" value="coreEmail"><input id="fan_gate_id" value="123456"><input id="wrndk" value="authored-session"><input id="is_unlimited" value="1"><input id="nwSteps" value="email"><input id="email_address"><input id="email_name"><button id="email_to_downloads_next">Native email</button>`,
    });
    expect(session.inspect()?.title).toBe('Core email');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await session.resolve({ automate: true })).toEqual({
      ok: true,
      url: file,
      method: 'website-session',
    });
    expect(fetcher.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      'https://hypeddit.com/verifyEmailAddress',
      'https://hypeddit.com/gate/download/ul',
    ]);
    expect((fetcher.mock.calls[1]![1]!.body as URLSearchParams).get('email')).toBe(
      'gatebreakeros@proton.me',
    );
    expect('window' in globalThis).toBe(false);
  });

  it.each(['captcha', 'spotify'] as const)(
    'returns %s requirements without implicit browser actions or email requests',
    async (requirement) => {
      const dependencies = options({ providers: [hypeddit] });
      const session = createGatebreaker(dependencies).createSession({
        url: 'https://hypeddit.com/authored/core-requirement',
        html: `<meta name="csrf-token" content="authored-core-csrf-00000000"><button id="downloadProcess">Native download</button><input id="current_download_file_listner" value="coreRequirement"><input id="fan_gate_id" value="123456"><input id="wrndk" value="authored-session"><input id="is_unlimited" value="1"><input id="nwSteps" value="email,sp"><input id="email_address"><button id="email_to_downloads_next">Native email</button>${requirement === 'captcha' ? '<div id="gatePreviewCaptcha"></div>' : '<section class="fangate-slider-content"><a id="login_to_sp">Native Spotify</a></section>'}`,
      });
      expect(await session.resolve({ automate: true })).toMatchObject({
        ok: false,
        code: 'server-required',
      });
      expect(dependencies.fetch).not.toHaveBeenCalled();
      expect('window' in globalThis).toBe(false);
    },
  );

  it.each([false, true])(
    'submits configured Hypeddit comment text only with explicit automation: %s',
    async (automate) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ download_status: false }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const session = createGatebreaker(
        options({
          providers: [hypeddit],
          fetch: fetcher,
          preferences: { soundcloudComment: 'My explicit user-written comment' },
        }),
      ).createSession({
        url: 'https://hypeddit.com/authored/core-comment',
        html: '<meta name="csrf-token" content="authored-core-csrf-00000000"><button id="downloadProcess">Native download</button><input id="current_download_file_listner" value="coreComment"><input id="wrndk" value="authored-session"><input id="is_unlimited" value="1"><input id="nwSteps" value="sc"><input id="comment_sc" value="1">',
      });
      await session.resolve({ automate, intent: 'website-session' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((fetcher.mock.calls[0]![1]!.body as URLSearchParams).get('sc_comment_text')).toBe(
        automate ? 'My explicit user-written comment' : '',
      );
    },
  );

  it('passes explicit native-session, preference, HTTP, probe and progress capabilities', async () => {
    const readNativeSession = vi.fn(() => 'authored-existing-session');
    const readNativeReceipt = vi.fn(() => 'authored-gate-service-receipt');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const probePublicFile = vi.fn(async () => null);
    const progress = vi.fn();
    const configured = { soundcloudComment: 'My own authored comment' };
    const received: unknown[] = [];
    const current = provider(async (gate, context) => {
      received.push(context.preferences);
      expect(context.readNativeSession?.(gate.provider, gate.id)).toBe('authored-existing-session');
      expect(context.readNativeReceipt?.(gate.provider, gate.id, 'declared-service')).toBe(
        'authored-gate-service-receipt',
      );
      expect(context.parseHtml).toBe(parseHtml);
      context.onProgress?.({ message: 'Authorised fixture step' });
      await context.fetch('https://fixture.example/api/status');
      await context.probePublicFile(gate.id);
      return { ok: true, url: destination, method: 'provider-request' };
    });
    const engine = createGatebreaker({
      providers: [current],
      fetch: fetcher,
      parseHtml,
      readNativeSession,
      readNativeReceipt,
      probePublicFile,
      preferences: configured,
    });
    configured.soundcloudComment = 'Changed outside the engine';
    const session = engine.createSession({ url, html });
    expect(await session.resolve({ automate: true, onProgress: progress })).toMatchObject({
      ok: true,
    });
    expect(received).toEqual([{ soundcloudComment: 'My own authored comment' }]);
    expect(readNativeSession).toHaveBeenCalledWith('fixture', 'one');
    expect(readNativeReceipt).toHaveBeenCalledWith('fixture', 'one', 'declared-service');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(probePublicFile).toHaveBeenCalledWith('one');
    expect(progress).toHaveBeenCalledWith({ message: 'Authorised fixture step' });
    await session.resolve({ preferences: { soundcloudComment: 'Per-request comment' } });
    expect(received.at(-1)).toEqual({ soundcloudComment: 'Per-request comment' });
  });

  it('shares only the same session attempt and keeps two concurrent gates independent', async () => {
    const first = deferred<Resolution>();
    const second = deferred<Resolution>();
    const resolve = vi.fn<CoreProvider['resolve']>((gate) =>
      gate.id === 'one' ? first.promise : second.promise,
    );
    const engine = createGatebreaker(options({ providers: [provider(resolve)] }));
    const a = engine.createSession({ url, html });
    const b = engine.createSession({
      url: 'https://fixture.example/gates/two',
      html: '<h1 data-gate="two">Second gate</h1>',
    });
    const pendingA = a.resolve();
    expect(a.resolve()).toBe(pendingA);
    const pendingB = b.resolve();
    expect(pendingB).not.toBe(pendingA);
    expect(resolve).toHaveBeenCalledTimes(2);
    second.resolve({ ok: true, url: 'https://files.example/two.wav', method: 'provider-request' });
    first.resolve({ ok: true, url: 'https://files.example/one.wav', method: 'provider-request' });
    expect(await pendingA).toMatchObject({ ok: true, url: 'https://files.example/one.wav' });
    expect(await pendingB).toMatchObject({ ok: true, url: 'https://files.example/two.wav' });
  });

  it('revalidates provider destinations and never delivers a released file', async () => {
    const unsafe = provider(async () => ({
      ok: true,
      url: 'javascript:alert(1)',
      method: 'provider-request',
    }));
    const dependencies = options({ providers: [unsafe] });
    const session = createGatebreaker(dependencies).createSession({ url, html });
    expect(await session.resolve()).toMatchObject({ ok: false, code: 'unsafe-destination' });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it('cancels before parsing and discards a late result from an aborted attempt', async () => {
    const controller = new AbortController();
    controller.abort();
    const dependencies = options();
    const early = createGatebreaker(dependencies).createSession({ url, html });
    await expect(early.resolve({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(dependencies.parseHtml).not.toHaveBeenCalled();

    const pending = deferred<Resolution>();
    const later = new AbortController();
    const session = createGatebreaker(
      options({ providers: [provider(() => pending.promise)] }),
    ).createSession({ url, html });
    const result = session.resolve({ signal: later.signal });
    later.abort();
    pending.resolve({ ok: true, url: destination, method: 'provider-request' });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns an explicit invalid-page failure when its supplied parser fails', async () => {
    const dependencies = options({
      parseHtml: () => {
        throw Error('Authored parser failure');
      },
    });
    const session = createGatebreaker(dependencies).createSession({ url, html });
    expect(session.inspect()).toBeNull();
    expect(await session.resolve()).toMatchObject({ ok: false, code: 'invalid-response' });
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });
});
