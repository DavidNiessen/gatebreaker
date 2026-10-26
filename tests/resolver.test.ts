import { describe, expect, it, vi } from 'vitest';
import { GateResolver } from '../src/application/resolve-gate';
import type { Gate, GateProvider, ProviderContext, Resolution } from '../src/domain/provider';
import { hypeddit } from '../src/providers/hypeddit';

const pageUrl = new URL('https://hypeddit.com/fixture-artist/fixture-track');
const destination = 'https://hypeddit-gates-prod.s3.amazonaws.com/fixture123_main';
const gate: Gate = {
  provider: 'fixture',
  id: 'fixture123',
  title: 'Fixture gate',
  steps: [],
  metadata: {},
};

function context(): ProviderContext {
  return {
    pageUrl,
    fetch: vi.fn<typeof fetch>(),
    probePublicFile: vi.fn<ProviderContext['probePublicFile']>().mockResolvedValue(null),
  };
}

function provider(resolve: GateProvider['resolve']): GateProvider {
  return {
    id: 'fixture',
    name: 'Fixture provider',
    matches: () => true,
    inspect: () => gate,
    resolve,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe('GateResolver', () => {
  it('does not inspect or resolve providers that do not match the page', async () => {
    const inspect = vi.fn<GateProvider['inspect']>();
    const resolve = vi.fn<GateProvider['resolve']>();
    const resolver = new GateResolver([{ ...provider(resolve), matches: () => false, inspect }]);
    expect(await resolver.resolve(document, context())).toMatchObject({
      ok: false,
      code: 'not-supported',
    });
    expect(inspect).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('continues to a matching provider when an earlier provider finds no gate', async () => {
    const first = provider(vi.fn<GateProvider['resolve']>());
    const second = provider(
      vi.fn<GateProvider['resolve']>().mockResolvedValue({
        ok: true,
        url: destination,
        method: 'public-file',
      }),
    );
    const resolver = new GateResolver([{ ...first, inspect: () => null }, second]);
    expect(await resolver.resolve(document, context())).toMatchObject({
      ok: true,
      url: destination,
    });
    expect(first.resolve).not.toHaveBeenCalled();
    expect(second.resolve).toHaveBeenCalledOnce();
  });

  it('shares one in-flight attempt and allows a fresh attempt after completion', async () => {
    const pending = deferred<Resolution>();
    const resolve = vi
      .fn<GateProvider['resolve']>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ok: true, url: destination, method: 'public-file' });
    const resolver = new GateResolver([provider(resolve)]);
    const dependencies = context();
    const first = resolver.resolve(document, dependencies);
    const second = resolver.resolve(document, dependencies);
    expect(second).toBe(first);
    expect(resolve).toHaveBeenCalledOnce();
    pending.resolve({ ok: true, url: destination, method: 'public-file' });
    expect(await first).toMatchObject({ ok: true, url: destination });
    expect(await second).toMatchObject({ ok: true, url: destination });
    expect(await resolver.resolve(document, dependencies)).toMatchObject({ ok: true });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('clears a failed attempt so a user can retry', async () => {
    const pending = deferred<Resolution>();
    const resolve = vi
      .fn<GateProvider['resolve']>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ok: true, url: destination, method: 'public-file' });
    const resolver = new GateResolver([provider(resolve)]);
    const first = resolver.resolve(document, context());
    pending.reject(new Error('Fixture network failure'));
    expect(await first).toMatchObject({ ok: false, code: 'network-error' });
    expect(await resolver.resolve(document, context())).toMatchObject({ ok: true });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it.each([
    'http://downloads.example/file.mp3',
    'data:text/html,fixture',
    'https://user:secret@hypeddit.com/download/fixture',
    'javascript:alert(1)',
  ])('revalidates a provider result before exposing a link: %s', async (url) => {
    const resolver = new GateResolver([
      provider(async () => ({ ok: true, url, method: 'public-file' })),
    ]);
    expect(await resolver.resolve(document, context())).toMatchObject({
      ok: false,
      code: 'unsafe-destination',
    });
  });

  it.each(['network failure', 'timeout'])(
    'contains a real provider fetch rejection: %s',
    async (kind) => {
      const fixture = document.implementation.createHTMLDocument('Fixture');
      fixture.head.innerHTML = '<meta name="csrf-token" content="fixture-csrf-not-real">';
      fixture.body.innerHTML = `
      <button id="downloadProcess">Download</button>
      <input id="current_download_file_listner" value="fixture123">
      <input id="is_unlimited" value="1">
      <input id="wrndk" value="fixture-session-not-real">
      <input id="nwSteps" value="email,sc,sp,unknown">
    `;
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(
          kind === 'timeout'
            ? new DOMException('Fixture timeout', 'TimeoutError')
            : new TypeError('Fixture fetch failure'),
        );
      const dependencies = { ...context(), fetch };
      const resolver = new GateResolver([hypeddit]);
      expect(await resolver.resolve(fixture, dependencies)).toMatchObject({
        ok: false,
        code: 'network-error',
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('preserves a meaningful provider limitation without substituting a download URL', async () => {
    const resolver = new GateResolver([
      provider(async () => ({
        ok: false,
        code: 'server-required',
        message: 'The server did not release this file.',
      })),
    ]);
    expect(await resolver.resolve(document, context())).toEqual({
      ok: false,
      code: 'server-required',
      message: 'The server did not release this file.',
    });
  });
});
