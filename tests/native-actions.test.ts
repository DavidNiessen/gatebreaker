import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GateActions } from '../src/application/gate-actions';
import type { GateProvider } from '../src/domain/provider';
import { hypeddit } from '../src/providers/hypeddit';
import {
  listHypedditActions,
  hypedditActionProgress,
  performHypedditAction,
  randomEmail,
} from '../src/providers/hypeddit/actions';

const gateUrl = new URL('https://hypeddit.com/fixture-artist/fixture-track');

function fixture(): void {
  document.body.innerHTML = `
    <a id="downloadProcess">Original download</a>
    <input id="current_download_file_listner" value="fixture123" />
    <input id="nwSteps" value="email,sc,sp" />
    <div class="hype-download-gate-steps-wrapper hide">
      <div id="myCarousel" style="display:none">
        <div>
          <section id="email-section" class="fangate-slider-content current-slide zindex">
            <input id="email_name" value="" />
            <input id="email_address" type="email" value="" />
            <button id="email_to_downloads_next">Share email</button>
          </section>
          <section id="soundcloud-section" class="fangate-slider-content upcomming-slide">
            <a id="login_to_sc" href="#">Native SoundCloud</a>
            <a id="skipper_sc" data-step="sc">Skip SoundCloud</a>
          </section>
          <section id="spotify-section" class="fangate-slider-content upcomming-slide">
            <a id="login_to_sp" href="#">Native Spotify</a>
          </section>
          <section id="download-section" class="fangate-slider-content upcomming-slide">
            <a id="gateDownloadButton" href="#">Native final download</a>
          </section>
        </div>
      </div>
    </div>`;
  for (const anchor of document.querySelectorAll('a')) {
    anchor.addEventListener('click', (event) => event.preventDefault());
  }
}

beforeEach(() => {
  fixture();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native Hypeddit action discovery', () => {
  it('distinguishes a required Spotify login from an optional SoundCloud control', () => {
    expect(listHypedditActions(document, gateUrl)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sign-in-spotify', kind: 'sign-in', required: true }),
        expect.objectContaining({ id: 'sign-in-soundcloud', kind: 'sign-in', required: false }),
        expect.objectContaining({ id: 'prepare-email', kind: 'email', required: true }),
      ]),
    );
    expect(listHypedditActions(document, gateUrl).map((action) => action.id)).toEqual([
      'sign-in-spotify',
      'sign-in-soundcloud',
      'prepare-email',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('recognizes the generic Spotify skip control used by the native flow', () => {
    document
      .querySelector('#spotify-section')!
      .insertAdjacentHTML('beforeend', '<a id="skipper" data-step="sp">Skip Spotify</a>');
    expect(listHypedditActions(document, gateUrl)).toContainEqual(
      expect.objectContaining({ id: 'sign-in-spotify', required: false }),
    );
  });

  it.each(['hide', 'hidden-attribute'])('does not count a hidden optional control: %s', (mode) => {
    const skip = document.querySelector<HTMLElement>('#skipper_sc')!;
    if (mode === 'hide') skip.classList.add('hide');
    else skip.hidden = true;
    expect(listHypedditActions(document, gateUrl)).toContainEqual(
      expect.objectContaining({ id: 'sign-in-soundcloud', required: true }),
    );
  });

  it.each([
    [
      'hidden attribute',
      (element: HTMLElement) => {
        element.hidden = true;
      },
    ],
    [
      'disabled attribute',
      (element: HTMLElement) => {
        element.setAttribute('disabled', '');
      },
    ],
    [
      'aria-disabled',
      (element: HTMLElement) => {
        element.setAttribute('aria-disabled', 'true');
      },
    ],
    ...['hide', 'disabled', 'disable', 'hy-btn-spotify-disable', 'hy-btn-soundcloud-disable'].map(
      (name) =>
        [
          name,
          (element: HTMLElement) => {
            element.classList.add(name);
          },
        ] as const,
    ),
  ] as const)('does not offer an unavailable sign-in control: %s', (_label, modify) => {
    modify(document.querySelector<HTMLElement>('#login_to_sp')!);
    expect(
      listHypedditActions(document, gateUrl).some((action) => action.id === 'sign-in-spotify'),
    ).toBe(false);
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
  });

  it('uses a second available native sign-in control when the first alias is disabled', () => {
    document.querySelector('#login_to_sp')!.setAttribute('disabled', '');
    const alternative = document.createElement('button');
    alternative.id = 'login_sp';
    document.querySelector('#spotify-section')!.append(alternative);
    const click = vi.spyOn(alternative, 'click');
    expect(performHypedditAction('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not invent SoundCloud login from a platform step with no native login control', () => {
    document.querySelector('#login_to_sc')!.remove();
    expect(
      listHypedditActions(document, gateUrl).some((action) => action.id === 'sign-in-soundcloud'),
    ).toBe(false);
  });

  it('does not offer email preparation without the site’s own submission control', () => {
    document.querySelector('#email_to_downloads_next')!.remove();
    expect(listHypedditActions(document, gateUrl).some((action) => action.kind === 'email')).toBe(
      false,
    );
  });
});

describe('native action origin and identifier boundary', () => {
  it.each([
    'http://hypeddit.com/artist/track',
    'https://hypeddit.com.evil.example/artist/track',
    'https://user:password@hypeddit.com/artist/track',
    'https://hypeddit.com:8443/artist/track',
    'https://example.com/artist/track',
  ])('rejects actions on an untrusted page: %s', (input) => {
    const click = vi.spyOn(document.querySelector<HTMLElement>('#login_to_sp')!, 'click');
    const url = new URL(input);
    expect(listHypedditActions(document, url)).toEqual([]);
    expect(performHypedditAction('sign-in-spotify', document, url, 'activate').ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('supports the explicit www provider origin', () => {
    expect(
      listHypedditActions(document, new URL('https://www.hypeddit.com/fixture123')).length,
    ).toBeGreaterThan(0);
  });

  it.each(['unknown', '../escape', 'https://evil.example', 'sign-in-spotify;alert(1)'])(
    'rejects a non-native action id: %s',
    (id) => {
      const clicks = [...document.querySelectorAll<HTMLElement>('a,button')].map((element) =>
        vi.spyOn(element, 'click'),
      );
      expect(performHypedditAction(id, document, gateUrl, 'activate').ok).toBe(false);
      for (const click of clicks) expect(click).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('native sign-in delegation', () => {
  it('activates exactly the original Spotify control without claiming authorization success', () => {
    const spotify = document.querySelector<HTMLElement>('#login_to_sp')!;
    const nativeHandler = vi.fn((event: Event) => event.preventDefault());
    spotify.addEventListener('click', nativeHandler);
    const soundcloud = vi.spyOn(document.querySelector<HTMLElement>('#login_to_sc')!, 'click');
    const result = performHypedditAction('sign-in-spotify', document, gateUrl, 'activate');
    expect(result.ok).toBe(true);
    expect(nativeHandler).toHaveBeenCalledOnce();
    expect(nativeHandler.mock.calls[0]![0].target).toBe(spotify);
    expect(soundcloud).not.toHaveBeenCalled();
    expect(result.message).toMatch(/not yet confirmed/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['activate', 'reveal'] as const)(
    'keeps the original flow hidden when invoked in %s mode',
    (mode) => {
      const spotify = document.querySelector<HTMLElement>('#login_to_sp')!;
      const click = vi.spyOn(spotify, 'click');
      const sections = [...document.querySelectorAll('.fangate-slider-content')].map(
        (element) => element.className,
      );
      expect(performHypedditAction('sign-in-spotify', document, gateUrl, mode).ok).toBe(true);
      expect(
        document.querySelector('.hype-download-gate-steps-wrapper')!.classList.contains('hide'),
      ).toBe(true);
      expect(document.querySelector<HTMLElement>('#myCarousel')!.style.display).toBe('none');
      expect(
        [...document.querySelectorAll('.fangate-slider-content')].map(
          (element) => element.className,
        ),
      ).toEqual(sections);
      expect(click).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('delegates SoundCloud to its own native control', () => {
    const button = document.querySelector<HTMLElement>('#login_to_sc')!;
    const click = vi.spyOn(button, 'click');
    expect(performHypedditAction('sign-in-soundcloud', document, gateUrl, 'activate').ok).toBe(
      true,
    );
    expect(click).toHaveBeenCalledOnce();
    expect(
      document.querySelector('.hype-download-gate-steps-wrapper')!.classList.contains('hide'),
    ).toBe(true);
  });
});

describe('random email preparation', () => {
  it('generates Gmail-format non-inbox placeholders rather than short username guesses', () => {
    const values = new Set(Array.from({ length: 8 }, randomEmail));
    expect(values.size).toBe(8);
    for (const value of values) {
      expect(value).toMatch(/^[a-f0-9]{30}@gmail\.com$/);
      expect(value.split('@')[0]!.length).toBe(30);
      expect(value.split('@')[0]!.length).toBeLessThanOrEqual(64);
    }
  });

  it('fills native fields before clicking the site’s email button once, without exposing its form', () => {
    const email = document.querySelector<HTMLInputElement>('#email_address')!;
    const input = vi.fn();
    const change = vi.fn();
    email.addEventListener('input', input);
    email.addEventListener('change', change);
    const submitButton = document.querySelector<HTMLElement>('#email_to_downloads_next')!;
    const submit = vi.spyOn(submitButton, 'click');
    const valuesAtSubmission: Array<{ email: string; name: string }> = [];
    submitButton.addEventListener('click', () => {
      valuesAtSubmission.push({
        email: email.value,
        name: document.querySelector<HTMLInputElement>('#email_name')!.value,
      });
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const result = performHypedditAction('prepare-email', document, gateUrl, 'activate');
    expect(result.ok).toBe(true);
    expect(result.value).toMatch(/^[a-f0-9]{30}@gmail\.com$/);
    expect(email.value).toBe(result.value);
    expect(document.querySelector<HTMLInputElement>('#email_name')!.value).toBe('Listener');
    expect(input).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
    expect(valuesAtSubmission).toEqual([{ email: result.value, name: 'Listener' }]);
    expect(
      document.querySelector('.hype-download-gate-steps-wrapper')!.classList.contains('hide'),
    ).toBe(true);
    expect(document.querySelector<HTMLElement>('#myCarousel')!.style.display).toBe('none');
    expect(submit).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('preserves a name the user has already entered', () => {
    document.querySelector<HTMLInputElement>('#email_name')!.value = 'Existing name';
    performHypedditAction('prepare-email', document, gateUrl, 'activate');
    expect(document.querySelector<HTMLInputElement>('#email_name')!.value).toBe('Existing name');
  });

  it('works when the gate has no name field', () => {
    document.querySelector('#email_name')!.remove();
    expect(performHypedditAction('prepare-email', document, gateUrl, 'activate').ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('native action progress', () => {
  it.each(['sign-in-spotify', 'sign-in-soundcloud', 'prepare-email'])(
    'leaves %s pending until the website reports a result',
    (id) => {
      expect(hypedditActionProgress(id, document, gateUrl)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['sign-in-spotify', '#spotify-section', 'Spotify step completed on Hypeddit.'],
    ['sign-in-soundcloud', '#soundcloud-section', 'SoundCloud step completed on Hypeddit.'],
    ['prepare-email', '#email-section', 'Email step completed on Hypeddit.'],
  ])('recognizes the native completed slide for %s', (id, selector, message) => {
    document.querySelector(selector)!.classList.add('move-left');
    expect(hypedditActionProgress(id, document, gateUrl)).toEqual({ state: 'complete', message });
    expect(hypedditActionProgress(id, document, gateUrl)).not.toHaveProperty('url');
    expect(document.querySelector<HTMLElement>('#myCarousel')!.style.display).toBe('none');
  });

  it.each([
    ['sign-in-spotify', 'spotify_error'],
    ['sign-in-soundcloud', 'sc_comment_error'],
    ['prepare-email', 'error_download_email_address'],
  ])('mirrors a native validation error for %s', (id, errorId) => {
    const error = document.createElement('div');
    error.id = errorId;
    error.textContent = '  Please try this step again.  ';
    document.body.append(error);
    expect(hypedditActionProgress(id, document, gateUrl)).toEqual({
      state: 'error',
      message: 'Please try this step again.',
    });
  });

  it.each(['hidden', 'hide', 'display-none', 'empty'])(
    'ignores an inactive native error: %s',
    (mode) => {
      const error = document.createElement('div');
      error.className = 'name_error_spotify';
      error.textContent = 'Old error';
      if (mode === 'hidden') error.hidden = true;
      if (mode === 'hide') error.classList.add('hide');
      if (mode === 'display-none') error.style.display = 'none';
      if (mode === 'empty') error.textContent = '  ';
      document.body.append(error);
      expect(hypedditActionProgress('sign-in-spotify', document, gateUrl)).toBeNull();
    },
  );

  it('bounds error copy and gives current errors priority over an old completed slide', () => {
    document.querySelector('#email-section')!.classList.add('move-left');
    const error = document.createElement('div');
    error.className = 'name_error_email';
    error.textContent = 'x'.repeat(400);
    document.body.append(error);
    expect(hypedditActionProgress('prepare-email', document, gateUrl)).toEqual({
      state: 'error',
      message: 'x'.repeat(300),
    });
  });

  it('reports the native email CAPTCHA without marking sign-in steps failed', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="gatePreviewCaptcha"></div>');
    expect(hypedditActionProgress('prepare-email', document, gateUrl)).toEqual({
      state: 'error',
      message: expect.stringMatching(/CAPTCHA/),
    });
    expect(hypedditActionProgress('sign-in-spotify', document, gateUrl)).toBeNull();
  });

  it.each(['hidden', 'hide'])('ignores an inactive CAPTCHA: %s', (mode) => {
    const captcha = document.createElement('div');
    captcha.id = 'gatePreviewCaptcha';
    if (mode === 'hidden') captcha.hidden = true;
    else captcha.classList.add('hide');
    document.body.append(captcha);
    expect(hypedditActionProgress('prepare-email', document, gateUrl)).toBeNull();
  });

  it('does not infer progress for unknown actions, missing controls, or untrusted origins', () => {
    document.querySelector('#login_to_sp')!.remove();
    expect(hypedditActionProgress('sign-in-spotify', document, gateUrl)).toBeNull();
    expect(hypedditActionProgress('native-download', document, gateUrl)).toBeNull();
    expect(
      hypedditActionProgress('prepare-email', document, new URL('https://example.com/')),
    ).toBeNull();
  });
});

describe('GateActions application boundary', () => {
  it('returns native progress only for a recognized gate on the provider origin', () => {
    const actions = new GateActions([hypeddit]);
    document.querySelector('#spotify-section')!.classList.add('move-left');
    expect(actions.progress('sign-in-spotify', document, gateUrl)?.state).toBe('complete');
    expect(
      actions.progress('sign-in-spotify', document, new URL('https://example.com/')),
    ).toBeNull();
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value = '../bad-id';
    expect(actions.progress('sign-in-spotify', document, gateUrl)).toBeNull();
  });

  it('requires a recognized gate before exposing or activating native controls', () => {
    document.querySelector<HTMLInputElement>('#current_download_file_listner')!.value = '../bad-id';
    const click = vi.spyOn(document.querySelector<HTMLElement>('#login_to_sp')!, 'click');
    const actions = new GateActions([hypeddit]);
    expect(actions.list(document, gateUrl)).toEqual([]);
    expect(actions.perform('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, {}, 'bad-action'])(
    'rejects a malformed or unlisted identifier: %j',
    (id) => {
      const click = vi.spyOn(document.querySelector<HTMLElement>('#login_to_sp')!, 'click');
      expect(new GateActions([hypeddit]).perform(id, document, gateUrl, 'activate').ok).toBe(false);
      expect(click).not.toHaveBeenCalled();
    },
  );

  it('does not inspect or invoke providers that do not match the current origin', () => {
    const inspect = vi.fn<GateProvider['inspect']>();
    const performAction = vi.fn<NonNullable<GateProvider['performAction']>>();
    const provider = { ...hypeddit, matches: () => false, inspect, performAction };
    const actions = new GateActions([provider]);
    expect(actions.list(document, gateUrl)).toEqual([]);
    expect(actions.perform('sign-in-spotify', document, gateUrl, 'activate').ok).toBe(false);
    expect(inspect).not.toHaveBeenCalled();
    expect(performAction).not.toHaveBeenCalled();
  });

  it('contains a native handler failure and returns usable recovery copy', () => {
    const provider: GateProvider = {
      ...hypeddit,
      performAction: () => {
        throw new Error('Native website failure');
      },
    };
    expect(
      new GateActions([provider]).perform('sign-in-spotify', document, gateUrl, 'activate'),
    ).toEqual({
      ok: false,
      message: 'The website could not open this step. Reload the starting page and try again.',
    });
  });

  it('contains provider inspection errors before attempting a native action', () => {
    const performAction = vi.fn<NonNullable<GateProvider['performAction']>>();
    const provider: GateProvider = {
      ...hypeddit,
      inspect: () => {
        throw new Error('Malformed website markup');
      },
      performAction,
    };
    expect(
      new GateActions([provider]).perform('sign-in-spotify', document, gateUrl, 'activate').ok,
    ).toBe(false);
    expect(performAction).not.toHaveBeenCalled();
  });
});
