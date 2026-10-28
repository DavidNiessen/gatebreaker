import { afterEach, describe, expect, it, vi } from 'vitest';
import { hypeddit } from '../src/extension/providers/hypeddit';
import { hypedditAuthUrl } from '../src/extension/providers/hypeddit/actions';
import { hypedditState } from '../src/core/providers/hypeddit/session';

const pageUrl = new URL('https://hypeddit.com/authored/extra-auth');
const contracts = [
  {
    id: 'mixcloud',
    label: 'Mixcloud',
    step: 'mc',
    element: 'login_to_mc',
    popup: 'mc_popup',
    origin: 'https://mixcloud.com',
    path: '/oauth/authorize',
    callback: '/gate/mixcloudlogin',
    clientKey: 'client_id',
  },
  {
    id: 'deezer',
    label: 'Deezer',
    step: 'dz',
    element: 'login_to_dz',
    popup: 'dz_popup',
    origin: 'https://connect.deezer.com',
    path: '/oauth/auth.php',
    callback: '/deezer_callback',
    clientKey: 'app_id',
  },
] as const;
type Contract = (typeof contracts)[number];
let serial = 0;
function address(contract: Contract): string {
  const state = 'authored-native-state';
  const callback = new URL(contract.callback, 'https://hypeddit.com');
  if (contract.id === 'mixcloud') callback.searchParams.set('state', state);
  const url = new URL(contract.path, contract.origin);
  url.searchParams.set(contract.clientKey, 'authored-public-client');
  url.searchParams.set('redirect_uri', callback.href);
  if (contract.id === 'deezer') url.searchParams.set('perms', 'basic_access,manage_library');
  url.searchParams.set('state', state);
  return url.href;
}
function element(contract: Contract, value = address(contract)): HTMLAnchorElement {
  const control = document.createElement('a');
  control.id = contract.element;
  control.setAttribute(
    'onclick',
    `inAppSetup(this,3);PopupCenterDual('${value}','${contract.popup}','500','500');`,
  );
  return control;
}
function fixture(contract: Contract) {
  serial++;
  document.head.innerHTML = '<meta name="csrf-token" content="authored-csrf-000000000000">';
  document.body.innerHTML = `<a id="downloadProcess"></a><input id="current_download_file_listner" value="extraAuth${serial}"><input id="fan_gate_id" value="${50000 + serial}"><input id="wrndk" value="authored-extra-session"><input id="is_unlimited" value="1"><input id="nwSteps" value="${contract.step}"><input id="steps_select" value="dw,${contract.step}"><section class="fangate-slider-content"><input name="additional_${contract.step}_user_id[]" value="authored-target" data-profile_type="artist"></section>`;
  if (contract.id === 'deezer')
    document.body.insertAdjacentHTML('beforeend', '<input id="lifetime_fan_dz" value="1">');
  const control = element(contract);
  document.querySelector('section')!.append(control);
  const gate = hypeddit.inspect(document, pageUrl)!;
  return { control, gate };
}
function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const contract of contracts)
  describe(`native ${contract.label} handoff`, () => {
    it('accepts the retained exact authorization endpoint and callback shape as inert text', () => {
      expect(hypedditAuthUrl(element(contract), contract.id)).toBe(address(contract));
    });
    const corruptions: [string, (url: URL) => void][] = [
      [
        'lookalike origin',
        (url) => {
          url.hostname += '.evil.invalid';
        },
      ],
      [
        'HTTP',
        (url) => {
          url.protocol = 'http:';
        },
      ],
      [
        'different authorization route',
        (url) => {
          url.pathname += '/other';
        },
      ],
      [
        'userinfo',
        (url) => {
          url.username = 'attacker';
        },
      ],
      [
        'port',
        (url) => {
          url.port = '8443';
        },
      ],
      [
        'fragment',
        (url) => {
          url.hash = 'unexpected';
        },
      ],
      [
        'duplicate state',
        (url) => {
          url.searchParams.append('state', 'duplicate');
        },
      ],
      [
        'empty state',
        (url) => {
          url.searchParams.set('state', '');
        },
      ],
      [
        'missing client identifier',
        (url) => {
          url.searchParams.delete(contract.clientKey);
        },
      ],
      [
        'duplicate client identifier',
        (url) => {
          url.searchParams.append(contract.clientKey, 'duplicate');
        },
      ],
      [
        'unknown query field',
        (url) => {
          url.searchParams.set('unexpected', 'value');
        },
      ],
      [
        'foreign callback',
        (url) => {
          url.searchParams.set('redirect_uri', 'https://evil.invalid/callback');
        },
      ],
      [
        'different native callback',
        (url) => {
          url.searchParams.set('redirect_uri', 'https://hypeddit.com/spotify_callback');
        },
      ],
      [
        'duplicate callback',
        (url) => {
          url.searchParams.append('redirect_uri', url.searchParams.get('redirect_uri')!);
        },
      ],
      [
        'callback fragment',
        (url) => {
          url.searchParams.set(
            'redirect_uri',
            url.searchParams.get('redirect_uri')! + '#unexpected',
          );
        },
      ],
      [
        'unexpected callback query',
        (url) => {
          const callback = new URL(url.searchParams.get('redirect_uri')!);
          callback.searchParams.set('unexpected', 'value');
          url.searchParams.set('redirect_uri', callback.href);
        },
      ],
    ];
    it.each(corruptions)('rejects %s without evaluating the native handler', (_name, corrupt) => {
      const url = new URL(address(contract));
      corrupt(url);
      expect(hypedditAuthUrl(element(contract, url.href), contract.id)).toBeNull();
    });
    it('validates native queries when Firefox key iterators are non-iterable', () => {
      const expected = address(contract);
      const control = element(contract, expected);
      vi.spyOn(URLSearchParams.prototype, 'keys').mockReturnValue({
        next: () => ({ done: true, value: undefined }),
      } as unknown as ReturnType<URLSearchParams['keys']>);
      expect(hypedditAuthUrl(control, contract.id)).toBe(expected);
    });
    it('does not guess a missing native authorization address', () => {
      const control = element(contract);
      control.removeAttribute('onclick');
      expect(hypedditAuthUrl(control, contract.id)).toBeNull();
    });
    it('preserves an ordinary anonymous success before offering native sign-in', async () => {
      const { gate } = fixture(contract);
      hypedditState(document).acceptedEmail = 'gatebreakeros@proton.me';
      const fetch = vi
        .fn()
        .mockResolvedValue(
          json({ download_status: true, URL: 'https://hypeddit.com/download/authoredExtra' }),
        );
      expect(gate.metadata['requiredSignIn']).toBe('0');
      expect(hypeddit.actions!(document, pageUrl)).toEqual([]);
      expect(
        await hypeddit.resolve(gate, { pageUrl, fetch, probePublicFile: async () => null }),
      ).toMatchObject({ ok: true });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(hypeddit.actions!(document, pageUrl)).toEqual([]);
    });
    it('offers mandatory native sign-in only after an actual final response refuses access', async () => {
      const { gate } = fixture(contract);
      const fetch = vi.fn().mockResolvedValue(json({ download_status: false, URL: '' }));
      expect(hypeddit.actions!(document, pageUrl)).toEqual([]);
      expect(
        await hypeddit.resolve(gate, { pageUrl, fetch, probePublicFile: async () => null }),
      ).toMatchObject({ ok: false, code: 'server-required' });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(hypeddit.actions!(document, pageUrl)).toContainEqual(
        expect.objectContaining({ id: 'sign-in-' + contract.id, required: true }),
      );
    });
    it.each([false, true])('honors the native optional control, hidden=%s', (hidden) => {
      fixture(contract);
      hypedditState(document).authRequired = true;
      document
        .querySelector('section')!
        .insertAdjacentHTML(
          'beforeend',
          `<a id="skipper_${contract.step}" data-step="${contract.step}"${hidden ? ' class="hide"' : ''}>Skip</a>`,
        );
      expect(hypeddit.actions!(document, pageUrl)).toContainEqual(
        expect.objectContaining({ id: `sign-in-${contract.id}`, required: hidden }),
      );
      expect(hypeddit.inspect(document, pageUrl)!.metadata['requiredSignIn']).toBe('0');
    });
    it('opens its native popup name without clicking the site and waits for its exact callback', async () => {
      const { control, gate } = fixture(contract);
      const fetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            json({ download_status: true, URL: 'https://hypeddit.com/download/authoredExtra' }),
          ),
        );
      vi.stubGlobal('fetch', fetch);
      const initialFetch = vi.fn().mockResolvedValue(json({ download_status: false, URL: '' }));
      await hypeddit.resolve(gate, {
        pageUrl,
        fetch: initialFetch,
        probePublicFile: async () => null,
      });
      expect(initialFetch).toHaveBeenCalledTimes(1);
      const popup = {
        closed: true,
        get location(): Location {
          throw new DOMException('Cross origin', 'SecurityError');
        },
      };
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
      const click = vi.spyOn(control, 'click'),
        before = document.body.innerHTML;
      const id = `sign-in-${contract.id}`;
      expect(hypeddit.performAction!(id, document, pageUrl, 'reveal').ok).toBe(false);
      expect(hypeddit.performAction!(id, document, pageUrl, 'activate').ok).toBe(true);
      expect(window.open).toHaveBeenCalledWith(
        address(contract),
        contract.popup,
        expect.any(String),
      );
      const pending = hypedditState(document).nativeAuth.get(id)!;
      expect(pending.callback).toBe(contract.callback);
      vi.spyOn(Date, 'now').mockReturnValue(pending.started + 30000);
      expect(hypeddit.actionProgress!(id, document, pageUrl)?.state).toBe('waiting');
      expect(fetch).not.toHaveBeenCalled();
      Object.defineProperty(popup, 'location', {
        configurable: true,
        value: { origin: 'https://hypeddit.com', pathname: '/wrong-callback' },
      });
      hypeddit.actionProgress!(id, document, pageUrl);
      expect(fetch).not.toHaveBeenCalled();
      Object.defineProperty(popup, 'location', {
        value: { origin: 'https://hypeddit.com', pathname: contract.callback },
      });
      hypeddit.actionProgress!(id, document, pageUrl);
      await vi.waitFor(() =>
        expect(hypeddit.actionProgress!(id, document, pageUrl)?.state).toBe('complete'),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]![0]).toBe('https://hypeddit.com/gate/download/ul');
      const body = fetch.mock.calls[0]![1].body as URLSearchParams;
      expect(body.getAll(`additional_${contract.step}_user_id[]`)).toEqual(['authored-target']);
      if (contract.id === 'deezer') expect(body.get('lifetime_fan_deezer')).toBe('0');
      expect(click).not.toHaveBeenCalled();
      expect(document.body.innerHTML).toBe(before);
    });
  });

describe('service-specific query constraints', () => {
  it.each(['different', 'duplicate', 'missing'])('rejects %s nested Mixcloud state', (mode) => {
    const contract = contracts[0],
      url = new URL(address(contract)),
      callback = new URL(url.searchParams.get('redirect_uri')!);
    if (mode === 'different') callback.searchParams.set('state', 'other');
    else if (mode === 'duplicate') callback.searchParams.append('state', 'duplicate');
    else callback.searchParams.delete('state');
    url.searchParams.set('redirect_uri', callback.href);
    expect(hypedditAuthUrl(element(contract, url.href), contract.id)).toBeNull();
  });
  it('requires the native Deezer permissions field', () => {
    const contract = contracts[1],
      url = new URL(address(contract));
    url.searchParams.delete('perms');
    expect(hypedditAuthUrl(element(contract, url.href), contract.id)).toBeNull();
  });
  it('keeps unproven SoundCloud authorization unsupported', () => {
    expect(hypedditAuthUrl(element(contracts[0]), 'soundcloud')).toBeNull();
  });
});
