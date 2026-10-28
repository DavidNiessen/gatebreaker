import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GateActions } from '../src/application/gate-actions';
import type { GateProvider } from '../src/domain/provider';
import { hypeddit } from '../src/providers/hypeddit';
import {
  listHypedditActions,
  hypedditActionProgress,
  performHypedditAction,
} from '../src/providers/hypeddit/actions';
import { hypedditState } from '../src/providers/hypeddit/session';
import { captureWebsiteRequest } from '../src/providers/hypeddit/request';

const gateUrl = new URL('https://hypeddit.com/fixture-artist/fixture-track');
const authUrl =
  'https://accounts.spotify.com/authorize?client_id=authored-native-client&redirect_uri=https%3A%2F%2Fhypeddit.com%2Fspotify_callback&response_type=code&scope=authored-scope&state=authored-opaque-state';
let serial = 0;
function fixture(): void {
  serial++;
  document.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML = `<a id="downloadProcess">Original download</a><input id="current_download_file_listner" value="fixture${serial}"><input id="fan_gate_id" value="${1000 + serial}"><input id="nwSteps" value="email,sc,sp"><input id="wrndk" value="authored-session"><input id="is_unlimited" value="1">
    <div class="hype-download-gate-steps-wrapper hide"><div id="myCarousel" style="display:none">
    <section id="email-section" class="fangate-slider-content"><input id="email_name"><input id="email_address"><button id="email_to_downloads_next">Share email</button></section>
    <section id="soundcloud-section" class="fangate-slider-content"><a id="login_to_sc">Native SoundCloud</a><a id="skipper_sc" data-step="sc">Skip SoundCloud</a></section>
    <section id="spotify-section" class="fangate-slider-content"><a id="login_to_sp">Native Spotify</a></section><section class="fangate-slider-content"><a id="gateDownloadButton">Native final download</a></section></div></div>`;
  document
    .querySelector('#login_to_sp')!
    .setAttribute('onclick', `PopupCenterDual('${authUrl}','sp_popup','500','500');`);
  // These action-unit fixtures represent a gate whose initial final HTTP check refused access.
  hypedditState(document).authRequired = true;
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
beforeEach(() => {
  fixture();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => json({ status: 'T' })),
  );
  vi.spyOn(window, 'open').mockReturnValue({
    closed: false,
    location: { origin: 'https://accounts.spotify.com', pathname: '/authorize' },
  } as unknown as Window);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native Hypeddit configuration and server-first discovery', () => {
  it('distinguishes required Spotify and optional SoundCloud only after server refusal, without inspecting credentials', () => {
    hypedditState(document).authRequired = false;
    expect(listHypedditActions(document, gateUrl).map((action) => action.id)).toEqual([
      'prepare-email',
    ]);
    hypedditState(document).authRequired = true;
    expect(listHypedditActions(document, gateUrl)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sign-in-spotify', kind: 'sign-in', required: true }),
        expect.objectContaining({ id: 'sign-in-soundcloud', kind: 'sign-in', required: false }),
        expect.objectContaining({ id: 'prepare-email', kind: 'email', required: true }),
      ]),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
  it('offers login as soon as email is accepted, without a final request', () => {
    hypedditState(document).authRequired = false;
    hypedditState(document).acceptedEmail = 'gatebreakeros@proton.me';
    expect(listHypedditActions(document, gateUrl)).toContainEqual(
      expect.objectContaining({ id: 'sign-in-spotify', required: true }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('recognizes the generic native Spotify skip control', () => {
    document
      .querySelector('#spotify-section')!
      .insertAdjacentHTML('beforeend', '<a id="skipper" data-step="sp">Skip</a>');
    expect(listHypedditActions(document, gateUrl)).toContainEqual(
      expect.objectContaining({ id: 'sign-in-spotify', required: false }),
    );
  });
  it.each(['hide', 'hidden-attribute'])(
    'does not treat a hidden skip control as optional: %s',
    (mode) => {
      const skip = document.querySelector<HTMLElement>('#skipper_sc')!;
      if (mode === 'hide') skip.classList.add('hide');
      else skip.hidden = true;
      expect(listHypedditActions(document, gateUrl)).toContainEqual(
        expect.objectContaining({ id: 'sign-in-soundcloud', required: true }),
      );
    },
  );
  it.each([
    'hidden',
    'disabled',
    'aria-disabled',
    'hide',
    'disable',
    'hy-btn-spotify-disable',
    'hy-btn-soundcloud-disable',
  ])('rejects a directly unavailable native control: %s', (mode) => {
    const element = document.querySelector<HTMLElement>('#login_to_sp')!;
    if (mode === 'hidden') element.hidden = true;
    else if (mode === 'disabled') element.setAttribute('disabled', '');
    else if (mode === 'aria-disabled') element.setAttribute('aria-disabled', 'true');
    else element.classList.add(mode);
    expect(
      listHypedditActions(document, gateUrl).some((action) => action.id === 'sign-in-spotify'),
    ).toBe(false);
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });
  it('reads the second available native alias but never invokes its handler', () => {
    document.querySelector('#login_to_sp')!.setAttribute('disabled', '');
    const alternative = document.createElement('button');
    alternative.id = 'login_sp';
    alternative.setAttribute('onclick', `PopupCenterDual('${authUrl}','sp_popup','500','500');`);
    document.querySelector('#spotify-section')!.append(alternative);
    const click = vi.spyOn(alternative, 'click');
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith(authUrl, 'sp_popup', expect.any(String));
    expect(click).not.toHaveBeenCalled();
  });
  it('does not invent a login from a platform step with no native control or email without its native configuration', () => {
    document.querySelector('#login_to_sc')!.remove();
    document.querySelector('#email_to_downloads_next')!.remove();
    expect(listHypedditActions(document, gateUrl).map((action) => action.id)).toEqual([
      'sign-in-spotify',
    ]);
  });
});

describe('action origin and identifier boundaries', () => {
  it.each([
    'http://hypeddit.com/artist/track',
    'https://hypeddit.com.evil.example/artist/track',
    'https://user:password@hypeddit.com/artist/track',
    'https://hypeddit.com:8443/artist/track',
    'https://example.com/artist/track',
  ])('rejects an untrusted page: %s', (input) => {
    expect(listHypedditActions(document, new URL(input))).toEqual([]);
    expect(performHypedditAction('sign-in-spotify', document, new URL(input), 'activate').ok).toBe(
      false,
    );
    expect(window.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('supports the explicit www provider origin', () =>
    expect(
      listHypedditActions(document, new URL('https://www.hypeddit.com/fixture123')).length,
    ).toBeGreaterThan(0));
  it.each(['unknown', '../escape', 'https://evil.example', 'sign-in-spotify;alert(1)'])(
    'rejects an unlisted action: %s',
    (id) => {
      expect(performHypedditAction(id, document, gateUrl, 'activate').ok).toBe(false);
      expect(window.open).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('direct native authorization handoff', () => {
  it('requires activation and opens only the exact parsed native Spotify URL without clicking the website', () => {
    const before = document.body.innerHTML;
    const handler = vi.fn();
    document.querySelector('#login_to_sp')!.addEventListener('click', handler);
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'reveal').ok).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith(authUrl, 'sp_popup', expect.any(String));
    expect(handler).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    expect(hypedditActionProgress('sign-in-spotify', document, gateUrl)?.state).toBe('waiting');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed on an unproven SoundCloud route and on required comments', () => {
    expect(performHypedditAction('sign-in-soundcloud', document, gateUrl, 'activate').ok).toBe(
      false,
    );
    document.body.insertAdjacentHTML('beforeend', '<input id="comment_sc" value="1">');
    expect(
      performHypedditAction('sign-in-soundcloud', document, gateUrl, 'activate').message,
    ).toMatch(/comment/);
    expect(window.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports a blocked owned popup as an error without claiming completion', () => {
    vi.mocked(window.open).mockReturnValue(null);
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/popup/),
    });
    expect(hypedditActionProgress('sign-in-spotify', document, gateUrl)).toBeNull();
  });
});

describe('fixed automatic email requests', () => {
  it('posts the verified native schema while preserving inputs, event counts, hidden forms and storage', async () => {
    const before = document.body.innerHTML;
    const click = vi.spyOn(
      document.querySelector<HTMLElement>('#email_to_downloads_next')!,
      'click',
    );
    const events = vi.fn();
    document.addEventListener('input', events);
    document.addEventListener('change', events);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const result = performHypedditAction('prepare-email', document, gateUrl, 'activate');
    await vi.waitFor(() =>
      expect(hypedditActionProgress('prepare-email', document, gateUrl)?.state).toBe('complete'),
    );
    const [endpoint, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(endpoint).toBe('https://hypeddit.com/verifyEmailAddress');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-TOKEN': 'authored-csrf-000000000000' },
    });
    expect(Object.fromEntries(options!.body as URLSearchParams)).toEqual({
      validateEmailAddress: result.value,
      fan_gate_id: String(1000 + serial),
      email_name: 'Listener',
      adcode: '',
      hypesource: '',
    });
    expect(JSON.parse(captureWebsiteRequest(document)).email).toBe(result.value);
    expect(document.body.innerHTML).toBe(before);
    expect(click).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    document.removeEventListener('input', events);
    document.removeEventListener('change', events);
  });
  it.each(['Existing name', null])(
    'uses the existing name or native absent-name schema: %s',
    async (name) => {
      if (name === null) document.querySelector('#email_name')!.remove();
      else document.querySelector<HTMLInputElement>('#email_name')!.value = name;
      performHypedditAction('prepare-email', document, gateUrl, 'activate');
      await vi.waitFor(() =>
        expect(hypedditActionProgress('prepare-email', document, gateUrl)?.state).toBe('complete'),
      );
      expect((vi.mocked(fetch).mock.calls[0]![1]!.body as URLSearchParams).get('email_name')).toBe(
        name ?? '',
      );
    },
  );
  it('reuses the fixed address on an explicit retry', async () => {
    vi.mocked(fetch).mockImplementation(async () => json({ status: 'F' }));
    const first = performHypedditAction('prepare-email', document, gateUrl, 'activate');
    await vi.waitFor(() =>
      expect(hypedditActionProgress('prepare-email', document, gateUrl)?.state).toBe('error'),
    );
    const retry = performHypedditAction('prepare-email', document, gateUrl, 'activate');
    expect(first.value).toBe('gatebreakeros@proton.me');
    expect(retry.value).toBe('gatebreakeros@proton.me');
  });
});

describe('HTTP progress authority', () => {
  it.each(['sign-in-spotify', 'sign-in-soundcloud', 'prepare-email'])(
    'ignores native slide classes and stale website error copy for %s',
    (id) => {
      document.querySelector('#email-section')!.classList.add('move-left');
      document.querySelector('#spotify-section')!.classList.add('move-left');
      document.querySelector('#soundcloud-section')!.classList.add('move-left');
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="spotify_error">Old website error</div><div class="name_error_email">Old website error</div><div id="sc_comment_error">Old website error</div>',
      );
      expect(hypedditActionProgress(id, document, gateUrl)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each(['visible', 'hidden', 'hide'])(
    'stops a visible CAPTCHA and ignores an inactive CAPTCHA: %s',
    (mode) => {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="gatePreviewCaptcha" ${mode === 'hidden' ? 'hidden' : ''} class="${mode === 'hide' ? 'hide' : ''}"></div>`,
      );
      const result = performHypedditAction('prepare-email', document, gateUrl, 'activate');
      expect(result.ok).toBe(true);
      if (mode === 'visible') {
        expect(result.message).toMatch(/CAPTCHA/);
        expect(fetch).not.toHaveBeenCalled();
      }
    },
  );
});

describe('GateActions application boundary', () => {
  it('does not infer native progress from a slide and rejects invalid gates/origins', () => {
    const actions = new GateActions([hypeddit]);
    document.querySelector('#spotify-section')!.classList.add('move-left');
    expect(actions.progress('sign-in-spotify', document, gateUrl)).toBeNull();
    expect(
      actions.progress('sign-in-spotify', document, new URL('https://example.com/')),
    ).toBeNull();
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value = '../bad-id';
    expect(actions.list(document, gateUrl)).toEqual([]);
    expect(actions.perform('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
  });
  it.each([undefined, null, 42, {}, 'bad-action'])(
    'rejects malformed or unlisted identifiers: %j',
    (id) => {
      expect(new GateActions([hypeddit]).perform(id, document, gateUrl, 'activate').ok).toBe(false);
      expect(window.open).not.toHaveBeenCalled();
    },
  );
  it('does not inspect or invoke a provider outside its origin', () => {
    const inspect = vi.fn<GateProvider['inspect']>();
    const performAction = vi.fn<NonNullable<GateProvider['performAction']>>();
    const actions = new GateActions([
      { ...hypeddit, matches: () => false, inspect, performAction },
    ]);
    expect(actions.list(document, gateUrl)).toEqual([]);
    expect(actions.perform('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
    expect(inspect).not.toHaveBeenCalled();
    expect(performAction).not.toHaveBeenCalled();
  });
  it('contains provider failures and returns recovery copy', () => {
    const provider = {
      ...hypeddit,
      performAction() {
        throw new Error('Authored failure');
      },
    };
    expect(
      new GateActions([provider]).perform('sign-in-spotify', document, gateUrl, 'activate'),
    ).toEqual({
      ok: false,
      message: 'The website could not open this step. Reload the starting page and try again.',
    });
    const performAction = vi.fn<NonNullable<GateProvider['performAction']>>();
    expect(
      new GateActions([
        {
          ...provider,
          inspect() {
            throw new Error('Malformed');
          },
          performAction,
        },
      ]).perform('sign-in-spotify', document, gateUrl, 'activate').ok,
    ).toBe(false);
    expect(performAction).not.toHaveBeenCalled();
  });
});
