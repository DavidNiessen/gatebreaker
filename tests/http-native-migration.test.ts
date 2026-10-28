import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hypedditActionProgress,
  performHypedditAction,
  hypedditAuthUrl,
} from '../src/extension/providers/hypeddit/actions';
import { captureWebsiteRequest } from '../src/core/providers/hypeddit/request';
import {
  bindPushSession,
  performPushAction,
  pushActionProgress,
  pushSession,
  pushModel,
} from '../src/extension/providers/push-session';
import { hypedditState } from '../src/core/providers/hypeddit/session';
import { hypeddit } from '../src/extension/providers/hypeddit';
import { push } from '../src/extension/providers/push';

const hypedditUrl = new URL('https://hypeddit.com/authored/gate');
let serial = 0;
function emailFixture() {
  serial++;
  document.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML = `<input id="fan_gate_id" value="${12340 + serial}"><input id="current_download_file_listner" value="authored${serial}">
    <button id="downloadProcess"></button><input id="wrndk" value="authored-website-session"><input id="is_unlimited" value="1">
    <section class="fangate-slider-content"><input id="email_address" value="untouched@example.invalid"><input id="email_name">
    <input id="adcode" value="authored-ad"><input id="hypesource" value="authored-source"><button id="email_to_downloads_next"></button></section>
    <div id="captchalog" data-max-attempts="5"></div><div id="gatePreviewCaptcha" class="hide"></div>`;
}
function json(value: unknown, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': contentType },
  });
}
const emailProgress = () => hypedditActionProgress('prepare-email', document, hypedditUrl);
const runEmail = () => performHypedditAction('prepare-email', document, hypedditUrl, 'reveal');
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('HTTP Hypeddit email verification', () => {
  it('uses the exact form contract and HTTP success while leaving native inputs/events/slides untouched', async () => {
    emailFixture();
    const fetch = vi.fn().mockResolvedValue(json({ status: 'T' }));
    vi.stubGlobal('fetch', fetch);
    const before = document.body.innerHTML;
    const events = vi.fn();
    document.addEventListener('input', events);
    document.addEventListener('change', events);
    const clicks = vi.spyOn(HTMLElement.prototype, 'click');
    const result = runEmail();
    expect(result).toMatchObject({
      ok: true,
      value: 'gatebreakeros@proton.me',
    });
    expect(emailProgress()?.state).toBe('waiting');
    await vi.waitFor(() => expect(emailProgress()?.state).toBe('complete'));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetch.mock.calls[0]!;
    expect(endpoint).toBe('https://hypeddit.com/verifyEmailAddress');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(init.headers['X-CSRF-TOKEN']).toBe('authored-csrf-000000000000');
    expect(Object.fromEntries(init.body)).toEqual({
      validateEmailAddress: result.value,
      fan_gate_id: String(12340 + serial),
      email_name: 'Listener',
      adcode: 'authored-ad',
      hypesource: 'authored-source',
    });
    expect(JSON.parse(captureWebsiteRequest(document)).email).toBe(result.value);
    expect(document.body.innerHTML).toBe(before);
    expect(clicks).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    document.removeEventListener('input', events);
    document.removeEventListener('change', events);
  });
  it.each([
    ['F', 200, 'application/json'],
    ['T', 419, 'application/json'],
    ['T', 429, 'application/json'],
    ['T', 500, 'application/json'],
    ['T', 200, 'text/html'],
  ])('does not accept status %s / HTTP %s / %s', async (status, http, contentType) => {
    emailFixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ status }, http, contentType)));
    runEmail();
    await vi.waitFor(() => expect(emailProgress()?.state).toBe('error'));
    expect(JSON.parse(captureWebsiteRequest(document)).email).toBe('untouched@example.invalid');
  });
  it('reports a rejected placeholder without inventing a CAPTCHA requirement', async () => {
    emailFixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ attempts: 1, status: 'F' })));
    runEmail();
    await vi.waitFor(() => expect(emailProgress()?.state).toBe('error'));
    expect(emailProgress()?.message).toContain('rejected gatebreakeros@proton.me');
    expect(emailProgress()?.message).not.toMatch(/CAPTCHA|verification.*required/i);
    expect(JSON.parse(captureWebsiteRequest(document)).email).toBe('untouched@example.invalid');
  });
  it.each([{}, { status: 'unknown' }, { status: true }])(
    'does not classify an unknown response as an invalid email: %j',
    async (response) => {
      emailFixture();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(response)));
      runEmail();
      await vi.waitFor(() => expect(emailProgress()?.state).toBe('error'));
      expect(emailProgress()?.message).toContain('unknown email verification result');
      expect(emailProgress()?.message).not.toContain('rejected gatebreakeros@proton.me');
    },
  );
  it('bounds response parsing and does not accept a mutated slide', async () => {
    emailFixture();
    document.querySelector('section')!.classList.add('move-left');
    expect(emailProgress()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ status: 'T', padding: 'x'.repeat(33000) })),
    );
    runEmail();
    await vi.waitFor(() => expect(emailProgress()?.state).toBe('error'));
  });
  it('does not duplicate a pending HTTP attempt', () => {
    emailFixture();
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    runEmail();
    runEmail();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops on declared CAPTCHA or native attempt limit without a POST', () => {
    emailFixture();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    document.querySelector<HTMLElement>('#captchalog')!.dataset['attempts'] = 'over';
    expect(runEmail().ok).toBe(true);
    document.querySelector<HTMLElement>('#captchalog')!.removeAttribute('data-attempts');
    document.cookie = `teb3456767win=${JSON.stringify({ [String(12340 + serial)]: 5 })}; path=/`;
    expect(runEmail().ok).toBe(true);
    document.cookie = 'teb3456767win=; Max-Age=0; path=/';
    expect(fetch).not.toHaveBeenCalled();
  });
});
const authUrl =
  'https://accounts.spotify.com/authorize?client_id=authored-client&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored-scope&state=authored-opaque-state';
describe('direct Hypeddit native authorization URL', () => {
  function element(address = authUrl) {
    const node = document.createElement('a');
    node.setAttribute(
      'onclick',
      `inAppSetup(this,3);PopupCenterDual('${address}','sp_popup','500','500');`,
    );
    return node;
  }
  it('parses the exact native URL as inert text', () => {
    expect(hypedditAuthUrl(element(), 'spotify')).toBe(authUrl);
    expect(hypedditAuthUrl(element(), 'soundcloud')).toBeNull();
  });
  it.each([
    authUrl.replace('accounts.spotify.com', 'accounts.spotify.com.evil.invalid'),
    authUrl.replace('spotify_callback', 'wrong'),
    authUrl + '&state=duplicate',
    authUrl.replace('/authorize?', '/evil?'),
  ])('rejects an unrecognized auth URL', (address) => {
    expect(hypedditAuthUrl(element(address), 'spotify')).toBeNull();
  });
  it('requires activation and treats a native slide return only as a server-check trigger', async () => {
    emailFixture();
    const button = element();
    button.id = 'login_to_sp';
    document.querySelector('section')!.append(button);
    hypedditState(document).authRequired = true;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ download_status: true, URL: 'https://hypeddit.com/download/authoredReady' }),
        ),
    );
    const popup = {
      closed: false,
      location: {
        origin: 'https://accounts.spotify.com',
        pathname: '/authorize',
      },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const click = vi.spyOn(button, 'click');
    expect(performHypedditAction('sign-in-spotify', document, hypedditUrl, 'reveal').ok).toBe(
      false,
    );
    expect(open).not.toHaveBeenCalled();
    expect(performHypedditAction('sign-in-spotify', document, hypedditUrl, 'activate').ok).toBe(
      true,
    );
    expect(open).toHaveBeenCalledWith(authUrl, 'sp_popup', expect.any(String));
    button.closest('section')!.classList.add('move-left');
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('waiting');
    popup.location = {
      origin: 'https://hypeddit.com',
      pathname: '/spotify_callback',
    };
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('waiting');
    await vi.waitFor(() =>
      expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe(
        'complete',
      ),
    );
    expect(click).not.toHaveBeenCalled();
  });
});
describe('server-first auth and fast-closing Hypeddit windows', () => {
  function nativeFixture() {
    emailFixture();
    const button = document.createElement('a');
    button.id = 'login_to_sp';
    button.setAttribute('onclick', `PopupCenterDual('${authUrl}','sp_popup','500','500');`);
    document.querySelector('section')!.append(button);
    return hypeddit.inspect(document, hypedditUrl)!;
  }
  function context(fetch = vi.fn().mockResolvedValue(json({ download_status: false, URL: '' }))) {
    return {
      pageUrl: hypedditUrl,
      fetch,
      probePublicFile: vi.fn().mockResolvedValue(null),
      automate: true,
    };
  }
  it('exposes declared mandatory auth without sending a premature final request', async () => {
    const gate = nativeFixture();
    const ctx = context();
    expect(
      hypeddit.actions!(document, hypedditUrl).filter((action) => action.kind === 'sign-in'),
    ).toEqual([]);
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(await hypeddit.resolve(gate, ctx)).toMatchObject({ ok: false, code: 'server-required' });
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(hypeddit.actions!(document, hypedditUrl)).toContainEqual(
      expect.objectContaining({ id: 'sign-in-spotify', required: true }),
    );
  });
  it('finishes a fast-closed window only when final HTTP confirms a safe destination and reuses that response', async () => {
    const gate = nativeFixture();
    await hypeddit.resolve(gate, context());
    const popup = {
      closed: false,
      get location(): Location {
        throw new DOMException('Cross origin', 'SecurityError');
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ download_status: true, URL: 'https://hypeddit.com/download/authoredFastClosed' }),
      );
    vi.stubGlobal('fetch', fetch);
    expect(performHypedditAction('sign-in-spotify', document, hypedditUrl, 'activate').ok).toBe(
      true,
    );
    popup.closed = true;
    document.querySelector('.fangate-slider-content')!.classList.add('move-left');
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('waiting');
    await vi.waitFor(() =>
      expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe(
        'complete',
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('https://hypeddit.com/gate/download/ul');
    const body = fetch.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get('download_action')).toBe('DOWNLOAD');
    expect(body.get('file')).toBe(gate.id);
    const final = context();
    expect(await hypeddit.resolve(hypeddit.inspect(document, hypedditUrl)!, final)).toMatchObject({
      ok: true,
      method: 'website-session',
      url: 'https://hypeddit.com/download/authoredFastClosed',
    });
    expect(final.fetch).not.toHaveBeenCalled();
  });
  it('does not mark cancelled or other sign-ins complete from a final-file refusal', async () => {
    const gate = nativeFixture();
    await hypeddit.resolve(gate, context());
    const popup = {
      closed: false,
      location: { origin: 'https://accounts.spotify.com', pathname: '/authorize' },
    };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const fetch = vi.fn().mockResolvedValue(json({ download_status: false, URL: '' }));
    vi.stubGlobal('fetch', fetch);
    performHypedditAction('sign-in-spotify', document, hypedditUrl, 'activate');
    popup.closed = true;
    document.querySelector('.fangate-slider-content')!.classList.add('move-left');
    hypedditActionProgress('sign-in-spotify', document, hypedditUrl);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('waiting');
    const started = hypedditState(document).nativeAuth.get('sign-in-spotify')!.started;
    vi.spyOn(Date, 'now').mockReturnValue(started + 120001);
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('error');
    expect(hypedditActionProgress('sign-in-soundcloud', document, hypedditUrl)).toBeNull();
    expect(performHypedditAction('sign-in-spotify', document, hypedditUrl, 'activate').ok).toBe(
      true,
    );
  });
  it('does not accept a forged storage flag, an unsafe success URL, or a changed native slide', async () => {
    const gate = nativeFixture();
    await hypeddit.resolve(gate, context());
    const popup = {
      closed: false,
      location: { origin: 'https://accounts.spotify.com', pathname: '/authorize' },
    };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ download_status: true, URL: 'https://evil.invalid/file' }));
    vi.stubGlobal('fetch', fetch);
    performHypedditAction('sign-in-spotify', document, hypedditUrl, 'activate');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'hypeChildWindow',
        newValue: 'login_to_sp',
        url: 'https://hypeddit.com/spotify_callback',
      }),
    );
    document.querySelector('section')!.classList.add('move-left');
    expect(fetch).not.toHaveBeenCalled();
    expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('waiting');
    popup.closed = true;
    document.querySelector('.fangate-slider-content')!.classList.add('move-left');
    hypedditActionProgress('sign-in-spotify', document, hypedditUrl);
    await vi.waitFor(() =>
      expect(hypedditActionProgress('sign-in-spotify', document, hypedditUrl)?.state).toBe('error'),
    );
  });
  it('keeps PUSH sign-in hidden before the normal HTTP attempt and exposes it after refusal', async () => {
    document.head.innerHTML =
      '<meta property="og:title" content="Authored gate"><meta name="csrf-token" content="authored-csrf-000000000000">';
    document.body.innerHTML =
      '<div id="app"><button class="btn-spotify action-required">Follow on Spotify</button></div><script src="https://d29xpkeqnsbaz3.cloudfront.net/release/js/products.js"></script>';
    const url = new URL('https://push.fm/cu/authored-http');
    const gate = push.inspect(document, url)!;
    expect(push.actions!(document, url)).toEqual([]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          slug: 'authored-http',
          title: 'Authored',
          type: 'url',
          content_count: 1,
          minimum_actions: 1,
          actions: [
            {
              id: 42,
              driver: 'spotify-follow',
              required: true,
              provider: { client_authentication: false, client_execution: false },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({}, 403));
    expect(
      await push.resolve(gate, { pageUrl: url, fetch, automate: true, probePublicFile: vi.fn() }),
    ).toMatchObject({ ok: false, code: 'server-required' });
    expect(push.actions!(document, url)).toContainEqual(
      expect.objectContaining({ id: 'push-login-spotify-follow', required: true }),
    );
  });
});
describe('PUSH owned native route and opaque gate receipt', () => {
  const driver = 'spotify-follow';
  const id = `push-login-${driver}`;
  function fixture() {
    document.body.innerHTML =
      '<div id="app"><button class="btn-spotify action-required">Follow on Spotify</button></div>';
    const gate = bindPushSession(
      {
        provider: 'push',
        id: 'authored-http',
        title: 'Authored',
        steps: [],
        metadata: {},
      },
      document,
    );
    pushSession(gate)!.authRequired = true;
    pushSession(gate)!.model = pushModel({
      minimum_actions: 1,
      actions: [
        {
          id: 42,
          driver,
          required: true,
          provider: { client_authentication: false, client_execution: false },
        },
      ],
    })!;
    const popup = {
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          slug: 'authored-http',
          minimum_actions: 1,
          actions: [
            {
              id: 42,
              driver,
              required: true,
              provider: {
                client_authentication: false,
                client_execution: false,
              },
            },
          ],
        }),
      ),
    );
    return popup;
  }
  function receipt(popup: unknown, origin = 'https://push.fm', receiptDriver = driver) {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        source: popup as Window,
        data: { driver: receiptDriver, token: 'authored-opaque-gate-receipt' },
      }),
    );
  }
  it('reserves a window synchronously, validates metadata, and navigates directly to the native GET route', async () => {
    const popup = fixture();
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    expect(performPushAction(id, document, 'activate').ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank', expect.any(String));
    expect(popup.location.replace).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(popup.location.replace).toHaveBeenCalledWith(
        'https://push.fm/unlock/authored-http/action/42',
      ),
    );
    receipt({});
    receipt(popup, 'https://evil.invalid');
    receipt(popup, 'https://push.fm', 'spotify-save');
    expect(pushActionProgress(id, document)?.state).toBe('waiting');
    receipt(popup);
    // The owned receipt suffices without driving Vue or changing disabled state.
    expect(pushActionProgress(id, document)?.state).toBe('complete');
    expect(document.querySelector('button')!.disabled).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('closes the owned blank window on wrong-gate metadata', async () => {
    const popup = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ slug: 'different' })));
    performPushAction(id, document, 'activate');
    await vi.waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(pushActionProgress(id, document)?.state).toBe('error');
  });
  it('reuses only the exact bounded native cookie and disabled-state pair before opening auth', () => {
    fixture();
    const button = document.querySelector('button')!;
    const cookie = {
      'authored-httpspotify-follow': {
        link: 'cu/authored-http',
        serviceId: 'authored-httpspotify-follow',
        status: { driver, token: 'authored-native-gate-receipt' },
      },
    };
    document.cookie = `authored-http=${JSON.stringify(cookie)}; path=/`;
    expect(pushActionProgress(id, document)?.state).toBe('waiting');
    button.disabled = true;
    expect(performPushAction(id, document, 'activate').ok).toBe(true);
    expect(pushActionProgress(id, document)?.state).toBe('complete');
    expect(window.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    document.cookie = 'authored-http=; Max-Age=0; path=/';
  });
  it('does not accept a disabled native control without its gate receipt', () => {
    fixture();
    document.querySelector('button')!.disabled = true;
    expect(pushActionProgress(id, document)?.state).toBe('waiting');
  });
});
