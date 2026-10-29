import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderContext } from '../src/core/domain/provider';
import { pumpyoursound as core, inspect, documents } from '../src/core/providers/pumpyoursound';
import { pumpyoursound as extensionProvider } from '../src/extension/providers/pumpyoursound';
import {
  performPumpNativeAction,
  cancelPumpNativeAction,
} from '../src/extension/providers/pumpyoursound/native-page';
import { pumpYourSoundMessage } from '../src/extension/providers/pumpyoursound/native-job';
import {
  pumpNativeStart,
  pumpNativeCancel,
} from '../src/extension/providers/pumpyoursound/protocol';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getTab: vi.fn(),
  execute: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('../src/extension/platform/browser', () => ({
  extension: {
    runtime: { id: 'pys-extension', sendMessage: mocks.sendMessage },
    tabs: { get: mocks.getTab },
    scripting: { executeScript: mocks.execute },
  },
  isEnabled: mocks.enabled,
}));
const page = new URL('https://pumpyoursound.com/f/pys/authored-track/12345');
const destination = 'https://files.example/song.wav?signature=authored%2Fvalue';
const operation = '11111111-1111-4111-8111-111111111111';
function html(
  options: {
    steps?: string[];
    done?: string[];
    destination?: string;
    error?: boolean;
    email?: boolean;
    action?: string;
  } = {},
) {
  const steps = options.steps ?? [];
  return `<!doctype html><script data-main="/js/main.min.js?csv=fixture" src="/js/require.js"></script><h1 class="fangateTitle">Authored track</h1>
    <form id="frm-freeDownloadForm" method="post" action="${options.action ?? page.pathname}"><input name="_do" type="hidden" value="freeDownloadForm-submit"><input name="send" type="submit" value="Download">
    ${options.email ? '<input id="frm-freeDownloadForm-email" name="email">' : ''}
    ${steps.map((kind) => `<li id="${kind}_follow"><div class="fangateStep fangateStep--${kind} ${options.done?.includes(kind) ? 'done' : ''}"></div><a data-href="/auth/${kind === 'facebook' ? 'facebook-like' : kind + '-follow'}/?fangateId=12345">Native social</a></li>`).join('')}
    ${steps.includes('soundcloud') ? '<div class="socBtn__soundcloud sn-connect-with-soundcloud" data-href="/auth/soundcloud-events/?fangateId=12345&amp;accessToken=access_token"></div>' : ''}
    ${steps.includes('comment') ? '<input name="fangate_comment" value="Do not submit this default"><a id="fangate-send-comment" class="sn-connect-with-soundcloud" data-href="/auth/sc-comment/?fangateId=12345&amp;text=default&amp;accessToken=access_token"></a>' : ''}
    <span data-stream="https://files.example/preview.mp3"></span></form>
    <div id="soundcloud-api" data-client-id="QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq" data-redirect-url="http://pumpyoursound.com/?do=soundConnectAuth"></div>
    ${options.error ? '<ul id="flashMessages"><li data-type="error">Please follow the required account.</li></ul>' : ''}
    ${options.destination ? `<div class="fangateDownload" data-redirect-link="${options.destination.replaceAll('&', '&amp;')}"></div>` : ''}`;
}
function doc(options: Parameters<typeof html>[0] = {}) {
  return new DOMParser().parseFromString(html(options), 'text/html');
}
function context(fetcher: typeof fetch, extras: Partial<ProviderContext> = {}): ProviderContext {
  return {
    pageUrl: page,
    fetch: fetcher,
    automate: true,
    parseHtml: (source) => new DOMParser().parseFromString(source, 'text/html'),
    probePublicFile: async () => null,
    ...extras,
  };
}
const response = (body: string, type = 'text/html', status = 200) =>
  new Response(body, { status, headers: { 'content-type': type } });
afterEach(() => {
  documents.delete(document);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.sendMessage.mockReset();
  mocks.getTab.mockReset();
  mocks.execute.mockReset();
  mocks.enabled.mockReset();
  document.body.innerHTML = '';
});

describe('PumpYourSound matching and inspection', () => {
  it.each([
    page.href,
    'https://pumpyoursound.com/f/artist_name/other-track/200904',
    'https://www.pumpyoursound.com/f/pys/track/1',
  ])('matches %s', (value) => expect(core.matches(new URL(value))).toBe(true));
  it.each([
    'http://pumpyoursound.com/f/pys/track/1',
    'https://evil.pumpyoursound.com/f/pys/track/1',
    'https://pumpyoursound.com/f/pys/track/0',
    'https://pumpyoursound.com/f/pys/track/1/extra',
    'https://u:p@pumpyoursound.com/f/pys/track/1',
    'https://pumpyoursound.com/auth/soundcloud-events/',
    'https://pumpyoursound.com/f/pys/a%2fb/1',
  ])('rejects %s', (value) => expect(core.matches(new URL(value))).toBe(false));
  it('inspects without I/O or leaking default comments, previews or credentials', () => {
    const gate = core.inspect(doc({ steps: ['soundcloud', 'comment'] }), page)!;
    expect(gate).toMatchObject({
      id: '12345',
      inputs: [{ kind: 'soundcloud-comment', required: true }],
      metadata: {},
    });
    expect(JSON.stringify(gate)).not.toMatch(/Do not submit|preview|client-id/);
  });
  it('requires the native script and exact native form', () => {
    const wrong = doc();
    wrong.querySelector('script')!.remove();
    expect(inspect(wrong, page)).toBeNull();
    expect(inspect(doc({ action: 'https://evil.example/post' }), page)).toBeNull();
  });
});

describe('PumpYourSound native HTTP release', () => {
  it('uses an existing released destination without submissions and preserves signatures', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const gate = inspect(doc({ destination }), page)!;
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: true,
      url: destination,
      kind: 'file',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps an approved Bandcamp destination as a page', async () => {
    const gate = inspect(doc({ destination: 'https://artist.bandcamp.com/track/original' }), page)!;
    expect(await core.resolve(gate, context(vi.fn()))).toMatchObject({ ok: true, kind: 'page' });
  });
  it.each(['http://files.example/song.wav', 'https://127.0.0.1/song.wav', page.href])(
    'rejects unsafe release %s',
    async (value) => {
      expect(
        await core.resolve(inspect(doc({ destination: value }), page)!, context(vi.fn())),
      ).toMatchObject({ ok: false, code: 'unsafe-destination' });
    },
  );
  it('never returns preview audio when the gate has no release', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await core.resolve(inspect(doc(), page)!, context(fetcher, { automate: false })),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('posts the exact native form and reads its verified released result page', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ redirect: page.pathname + '?_fid=authored' }),
          'application/json',
        ),
      )
      .mockResolvedValueOnce(response(html({ destination })));
    const result = await core.resolve(inspect(doc({ email: true }), page)!, context(fetcher));
    expect(result).toMatchObject({ ok: true, url: destination });
    const init = fetcher.mock.calls[0]![1]!;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', redirect: 'manual' });
    expect(new URLSearchParams(init.body as URLSearchParams).get('email')).toBe(
      'gatebreakeros@proton.me',
    );
    expect(fetcher.mock.calls[1]![0]).toBe(page.origin + page.pathname + '?_fid=authored');
  });
  it('treats a same-page flash as refusal, not a released URL', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          JSON.stringify({ redirect: page.pathname + '?_fid=authored' }),
          'application/json',
        ),
      )
      .mockResolvedValueOnce(response(html({ error: true })));
    expect(await core.resolve(inspect(doc(), page)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
  });
  it.each([
    'https://evil.example/song.wav',
    '/account/delete',
    '/f/pys/other/999?_fid=x',
    page.pathname + '?do=logout',
  ])('does not follow unsupported response redirect %s', async (redirect) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(JSON.stringify({ redirect }), 'application/json'));
    expect(await core.resolve(inspect(doc(), page)!, context(fetcher))).toMatchObject({
      ok: false,
      code: 'invalid-response',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('requires explicit comment text and never uses the page default', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const gate = inspect(doc({ steps: ['comment'] }), page)!;
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'input-required',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await core.resolve(
        gate,
        context(fetcher, { preferences: { soundcloudComment: 'My own comment' } }),
      ),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('waits for required accounts before the first final form submission', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const gate = inspect(doc({ steps: ['soundcloud', 'spotify'] }), page)!;
    expect(await core.resolve(gate, context(fetcher))).toMatchObject({
      ok: false,
      code: 'server-required',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('acknowledges only a declared ordinary step and requires server-rendered confirmation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('{}', 'application/json'))
      .mockResolvedValueOnce(response(html({ steps: ['instagram'], done: ['instagram'] })))
      .mockResolvedValueOnce(
        response(JSON.stringify({ redirect: page.pathname + '?_fid=ok' }), 'application/json'),
      )
      .mockResolvedValueOnce(response(html({ destination })));
    expect(
      await core.resolve(inspect(doc({ steps: ['instagram'] }), page)!, context(fetcher)),
    ).toMatchObject({ ok: true });
    expect(fetcher.mock.calls[0]![0]).toBe(page.origin + '/auth/instagram-follow/?fangateId=12345');
  });
  it('does not accept an unconfirmed social acknowledgement', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('{}', 'application/json'))
      .mockResolvedValueOnce(response(html({ steps: ['instagram'] })));
    expect(
      await core.resolve(inspect(doc({ steps: ['instagram'] }), page)!, context(fetcher)),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('honors cancellation before any account or form request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      core.resolve(inspect(doc(), page)!, context(fetcher, { signal: AbortSignal.abort() })),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('PumpYourSound extension/private MAIN-world boundary', () => {
  function mainFixture(steps = ['soundcloud', 'comment']) {
    document.body.innerHTML = html({ steps });
    document
      .querySelector('#frm-freeDownloadForm')!
      .setAttribute('data-gatebreaker-pys-operation', operation);
    vi.stubGlobal('location', page);
    const popup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const requests: string[] = [];
    const ajax = vi.fn((options: { url: string }) => {
      requests.push(options.url);
      const value = options.url.includes('mySoundcloudAccessToken')
        ? 'authored-token-never-exported'
        : {};
      const request = {
        done(callback: (value: unknown) => void) {
          queueMicrotask(() => callback(value));
          return request;
        },
        fail() {
          return request;
        },
        abort: vi.fn(),
      };
      return request;
    });
    vi.stubGlobal('$', { nette: { ajax } });
    const connect = vi.fn((options: { connected(): void }) => options.connected());
    vi.stubGlobal('SC', {
      options: {
        client_id: 'QxSZqSh6CRcE0Bh21F7lJ6Ans3ucLCzq',
        redirect_uri: 'http://pumpyoursound.com/?do=soundConnectAuth',
      },
      connect,
    });
    return { requests, popup, connect, ajax };
  }
  it('uses provider SDK and HTTP only, keeps token values in MAIN world and returns nonsecret state', async () => {
    const fixture = mainFixture();
    const result = await performPumpNativeAction('12345', operation, 'My own reusable comment');
    expect(result).toEqual({ state: 'complete' });
    expect(JSON.stringify(result)).not.toContain('authored-token');
    expect(fixture.requests).toHaveLength(3);
    expect(fixture.requests[0]).toBe('/?do=mySoundcloudAccessToken');
    expect(new URL(fixture.requests[2]!, page).searchParams.get('text')).toBe(
      'My own reusable comment',
    );
    expect(fixture.connect).toHaveBeenCalledOnce();
    expect(fixture.popup.close).toHaveBeenCalledOnce();
  });
  it('does not use creator-provided default comment text', async () => {
    const fixture = mainFixture();
    expect(await performPumpNativeAction('12345', operation, '')).toEqual({ state: 'failed' });
    expect(fixture.connect).not.toHaveBeenCalled();
  });
  it('rejects changed native action targets before authorizing', async () => {
    const fixture = mainFixture();
    document
      .querySelector('.socBtn__soundcloud')!
      .setAttribute('data-href', 'https://evil.example/?fangateId=12345&accessToken=access_token');
    expect(await performPumpNativeAction('12345', operation, 'My comment')).toEqual({
      state: 'failed',
    });
    expect(fixture.connect).not.toHaveBeenCalled();
  });
  it('handles popup blocking without claiming authentication', async () => {
    mainFixture();
    vi.mocked(window.open).mockReturnValue(null);
    expect(await performPumpNativeAction('12345', operation, 'My comment')).toEqual({
      state: 'failed',
    });
  });
  it('rejects stale frame injection after the original document was replaced', async () => {
    const fixture = mainFixture();
    document.body.innerHTML = html({ steps: ['soundcloud'] });
    expect(await performPumpNativeAction('12345', operation, '')).toEqual({ state: 'failed' });
    expect(fixture.connect).not.toHaveBeenCalled();
  });
  it('cancels an owned pending SDK dialog and exposes no tokens', async () => {
    const fixture = mainFixture();
    fixture.connect.mockImplementation(() => {});
    const pending = performPumpNativeAction('12345', operation, 'My comment');
    cancelPumpNativeAction(operation);
    expect(await pending).toEqual({ state: 'cancelled' });
    expect(fixture.popup.close).toHaveBeenCalledOnce();
    expect(fixture.ajax).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'other', frameId: 0, url: page.href, tab: { id: 1 } as chrome.tabs.Tab },
    { id: 'pys-extension', frameId: 1, url: page.href, tab: { id: 1 } as chrome.tabs.Tab },
    {
      id: 'pys-extension',
      frameId: 0,
      url: 'https://evil.example/f/pys/track/12345',
      tab: { id: 1 } as chrome.tabs.Tab,
    },
  ])('rejects an untrusted background sender', (sender) => {
    expect(
      pumpYourSoundMessage(
        { type: pumpNativeStart, operation, gate: '12345' },
        sender as chrome.runtime.MessageSender,
        vi.fn(),
      ),
    ).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('passes only bounded gate/comment arguments to the original document MAIN world', async () => {
    mocks.enabled.mockResolvedValue(true);
    mocks.getTab.mockResolvedValue({ url: page.href });
    mocks.execute.mockResolvedValue([{ result: { state: 'complete' } }]);
    const sender = {
      id: 'pys-extension',
      frameId: 0,
      url: page.href,
      tab: { id: 1 } as chrome.tabs.Tab,
      documentId: 'authored-document',
    };
    const result = await new Promise((resolve) => {
      expect(
        pumpYourSoundMessage(
          { type: pumpNativeStart, operation, gate: '12345', comment: 'My comment' },
          sender,
          resolve,
        ),
      ).toBe(true);
    });
    expect(result).toEqual({ state: 'complete' });
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        world: 'MAIN',
        target: { tabId: 1, documentIds: ['authored-document'] },
        args: ['12345', operation, 'My comment'],
      }),
    );
  });
  it('requires a private start before cancellation', () => {
    expect(
      pumpYourSoundMessage(
        { type: pumpNativeCancel, operation },
        { id: 'pys-extension', frameId: 0, url: page.href, tab: { id: 1 } as chrome.tabs.Tab },
        vi.fn(),
      ),
    ).toBe(false);
  });
  it('does not mark Spotify as started while its SoundCloud sign-in is pending', () => {
    document.body.innerHTML = html({ steps: ['soundcloud', 'spotify'] });
    inspect(document, page);
    documents.get(document)!.authRequired = true;
    const popup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    mocks.sendMessage.mockReturnValue(new Promise(() => {}));
    expect(
      extensionProvider.performAction?.('pumpyoursound-soundcloud', document, page, 'activate'),
    ).toMatchObject({ ok: true });
    expect(
      extensionProvider.performAction?.('pumpyoursound-spotify', document, page, 'activate'),
    ).toMatchObject({ ok: false });
    expect(extensionProvider.actionProgress?.('pumpyoursound-spotify', document, page)).toBeNull();
    expect(window.open).toHaveBeenCalledOnce();
    extensionProvider.cancelActions?.(document, page);
  });
  it('ends an unconfirmed closed Spotify window with a clear retry state', () => {
    document.body.innerHTML = html({ steps: ['spotify'] });
    inspect(document, page);
    documents.get(document)!.authRequired = true;
    const popup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.spyOn(Date, 'now').mockReturnValue(10000);
    expect(
      extensionProvider.performAction?.('pumpyoursound-spotify', document, page, 'activate'),
    ).toMatchObject({ ok: true });
    popup.closed = true;
    extensionProvider.actionProgress?.('pumpyoursound-spotify', document, page);
    vi.mocked(Date.now).mockReturnValue(16000);
    expect(
      extensionProvider.actionProgress?.('pumpyoursound-spotify', document, page),
    ).toMatchObject({ state: 'error', message: expect.stringContaining('Sign in again') });
    mocks.sendMessage.mockResolvedValue({ state: 'cancelled' });
    extensionProvider.cancelActions?.(document, page);
  });
  it('leaves the native form untouched when showing its extension controls', async () => {
    document.body.innerHTML = html({ steps: ['soundcloud'] });
    inspect(document, page);
    const native = document.querySelector('form')!.outerHTML;
    expect(extensionProvider.presentation?.(document, page)).toBeTruthy();
    expect(extensionProvider.actions?.(document, page)).toEqual([]);
    documents.get(document)!.authRequired = true;
    expect(extensionProvider.actions?.(document, page)).toMatchObject([
      { id: 'pumpyoursound-soundcloud', kind: 'sign-in' },
    ]);
    expect(document.querySelector('form')!.outerHTML).toBe(native);
  });
});
