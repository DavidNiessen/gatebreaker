import type {
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
} from '../../domain/provider';
import { readLimitedText } from '../shared/read-text';
import { randomEmail } from '../shared/random-email';
import { isHypedditPage } from './urls';
import { hypedditState as state, hypedditReady } from './session';
import type { HypedditState as State } from './session';
import { checkHypedditNativeAuth, listenHypedditNativeAuth } from './native-auth';
export { hypedditEmail } from './session';
export { randomEmail } from '../shared/random-email';

const services = [
  {
    id: 'spotify',
    label: 'Spotify',
    selector: '#login_to_sp, #login_sp',
    step: 'sp',
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    selector: '#login_to_sc, #login_sc',
    step: 'sc',
  },
] as const;
function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
function control(document: Document, selector: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      (element) =>
        !!element.closest('.fangate-slider-content, #downloadProcess, #overlay-modal-box') &&
        !element.hidden &&
        !element.classList.contains('hide') &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true' &&
        !['disabled', 'disable', 'hy-btn-spotify-disable', 'hy-btn-soundcloud-disable'].some(
          (name) => element.classList.contains(name),
        ),
    ) ?? null
  );
}
function optional(document: Document, step: string): boolean {
  return [...document.querySelectorAll<HTMLElement>('[data-step]')].some(
    (element) =>
      element.dataset['step'] === step &&
      (element.id === `skipper_${step}` || element.id === 'skipper') &&
      !element.hidden &&
      !element.classList.contains('hide'),
  );
}
export function listHypedditActions(document: Document, url: URL): readonly GateAction[] {
  if (!isHypedditPage(url)) return [];
  const actions: GateAction[] = services
    .filter((service) => state(document).authRequired && control(document, service.selector))
    .map((service) => ({
      id: `sign-in-${service.id}`,
      kind: 'sign-in',
      label: `Sign in with ${service.label}`,
      description: 'Opens Hypeddit’s native sign-in address. Review its actions and permissions.',
      required: !optional(document, service.step),
    }));
  if (
    document.querySelector('#email_address') &&
    document.querySelector('#email_to_downloads_next, .email_to_downloads')
  )
    actions.push({
      id: 'prepare-email',
      kind: 'email',
      label: 'Email step',
      description:
        'Submits a generated word@icloud.com placeholder to Hypeddit’s verification request.',
      required: !optional(document, 'email'),
    });
  return actions;
}
/** Parse only the literal PopupCenterDual URL; never evaluate a website handler. */
export function hypedditAuthUrl(element: HTMLElement, service: string): string | null {
  const handler = element.getAttribute('onclick') ?? element.getAttribute('data-onclick') ?? '';
  if (handler.length > 32768) return null;
  const matches = [
    ...handler.matchAll(/\bPopupCenterDual\(\s*(['"])(https:\/\/[^'"\\\r\n]+)\1\s*,/g),
  ];
  if (matches.length !== 1) return null;
  try {
    const url = new URL(matches[0]![2]!);
    if (url.username || url.password || url.port || url.hash || url.href.length > 16384)
      return null;
    // The retained 160.0.10 page proves this exact Spotify endpoint and callback.
    // SoundCloud URL variants remain unsupported until their native source is retained.
    if (
      service !== 'spotify' ||
      url.origin !== 'https://accounts.spotify.com' ||
      url.pathname !== '/authorize'
    )
      return null;
    const callback = url.searchParams.get('redirect_uri');
    if (
      callback !== 'https://hypeddit.com/spotify_callback' ||
      url.searchParams.get('response_type') !== 'code'
    )
      return null;
    for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'state'])
      if (url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)) return null;
    return url.href;
  } catch {
    return null;
  }
}
function challenge(document: Document): boolean {
  const captcha = document.querySelector<HTMLElement>('#gatePreviewCaptcha');
  if (
    captcha &&
    !captcha.hidden &&
    !captcha.classList.contains('hide') &&
    captcha.style.display !== 'none'
  )
    return true;
  const log = document.querySelector<HTMLElement>('#captchalog');
  if (log?.dataset['attempts'] === 'over') return true;
  const maximum = Number(log?.dataset['maxAttempts']);
  if (!Number.isSafeInteger(maximum) || maximum < 1) return false;
  try {
    const prefix = 'teb3456767win=';
    const raw = document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefix))
      ?.slice(prefix.length);
    if (!raw) return false;
    if (raw.length > 16384) return true;
    const attempts: unknown = JSON.parse(decodeURIComponent(raw));
    if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return true;
    const count: unknown = (attempts as Record<string, unknown>)[field(document, 'fan_gate_id')];
    if (count === undefined) return false;
    return (
      typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count >= maximum - 1
    );
  } catch {
    return true;
  }
}
async function verifyEmail(
  document: Document,
  url: URL,
  current: State,
  email: string,
): Promise<void> {
  const update = (value: GateActionProgress) => current.progress.set('prepare-email', value);
  try {
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
    const gate = field(document, 'fan_gate_id');
    if (!csrf || !/^[\x21-\x7e]{16,4096}$/.test(csrf) || !/^\d{1,16}$/.test(gate))
      throw new Error('Reload Hypeddit to refresh this email verification session.');
    const name = document.querySelector('#email_name')
      ? field(document, 'email_name') || 'Listener'
      : '';
    const body = new URLSearchParams({
      validateEmailAddress: email,
      fan_gate_id: gate,
      email_name: name,
      adcode: field(document, 'adcode'),
      hypesource: field(document, 'hypesource'),
    });
    // Firefox content-script URLSearchParams iterators may be non-iterable.
    let oversized = false;
    body.forEach((value) => {
      if (value.length > 2048) oversized = true;
    });
    if (oversized) throw new Error('Hypeddit’s email request contains unsupported data.');
    const endpoint = new URL('/verifyEmailAddress', url);
    const response = await (
      document.defaultView?.fetch?.bind(document.defaultView) ?? globalThis.fetch
    )(endpoint.href, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrf,
      },
      body,
    });
    if ([401, 403, 419].includes(response.status))
      throw new Error(
        'Hypeddit rejected this session. Reload and complete any browser check yourself.',
      );
    if (response.status === 429)
      throw new Error('Hypeddit is limiting email attempts. Wait before trying again.');
    if (!response.ok) throw new Error('Hypeddit could not process the email verification request.');
    if (
      response.redirected ||
      (response.url && response.url !== endpoint.href) ||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')
    )
      throw new Error('Hypeddit returned a browser check or unexpected email response.');
    const value: unknown = JSON.parse(await readLimitedText(response, 32 * 1024));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Hypeddit returned unreadable email verification data.');
    const status = (value as Record<string, unknown>)['status'];
    if (status === 'F')
      throw new Error(
        'Hypeddit rejected the generated email address. Random addresses may be refused. Turn off Gatebreaker to enter your own email on Hypeddit.',
      );
    if (status !== 'T')
      throw new Error('Hypeddit returned an unknown email verification result. Reload the page.');
    if (state(document) !== current) return;
    current.acceptedEmail = email;
    current.emailName = name;
    update({
      state: 'complete',
      message:
        'Hypeddit accepted the email verification request. The final download still requires server approval.',
    });
  } catch (error) {
    update({
      state: 'error',
      message:
        error instanceof Error &&
        !['SyntaxError', 'TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
          ? error.message
          : 'Hypeddit’s email request failed, timed out, or returned unreadable data. Try again later.',
    });
  }
}
export function performHypedditAction(
  id: string,
  document: Document,
  url: URL,
  mode: GateActionMode,
): GateActionResult {
  if (!listHypedditActions(document, url).some((action) => action.id === id))
    return { ok: false, message: 'This Hypeddit step is unavailable.' };
  const current = state(document);
  if (hypedditReady(current))
    return { ok: true, message: 'Hypeddit’s server confirmed this download is ready.' };
  if (id === 'prepare-email') {
    const previous = current.progress.get(id);
    if (previous?.state === 'waiting' || previous?.state === 'complete')
      return { ok: true, message: previous.message };
    if (challenge(document))
      return {
        ok: false,
        message:
          'Hypeddit requires a CAPTCHA before another email attempt. Complete it on the website.',
      };
    const email = randomEmail(
      current.lastEmailAttempt ?? current.acceptedEmail ?? field(document, 'email_address'),
    );
    current.lastEmailAttempt = email;
    current.progress.set(id, {
      state: 'waiting',
      message: 'Waiting for Hypeddit’s email verification response…',
    });
    void verifyEmail(document, url, current, email);
    return {
      ok: true,
      value: email,
      message: 'Email verification request started.',
    };
  }
  if (mode !== 'activate')
    return {
      ok: false,
      message: 'Use Gatebreaker’s sign-in button to open the consent window.',
    };
  const service = services.find((service) => id === `sign-in-${service.id}`)!;
  if (service.id === 'soundcloud' && field(document, 'comment_sc') === '1')
    return {
      ok: false,
      message:
        'This Hypeddit step requires a SoundCloud comment. Complete that requirement on the website.',
    };
  const address = hypedditAuthUrl(control(document, service.selector)!, service.id);
  if (!address)
    return {
      ok: false,
      message: 'This Hypeddit sign-in address is unsupported. Use the website’s sign-in.',
    };
  const existing = current.nativeAuth.get(id);
  if (existing && !existing.window.closed && Date.now() - existing.started <= 120000)
    return { ok: true, message: 'Complete sign-in in the existing Hypeddit window.' };
  const popup = document.defaultView?.open(address, '_blank', 'popup,width=720,height=640');
  if (!popup) return { ok: false, message: 'Allow this sign-in popup, then try again.' };
  current.nativeAuth.set(id, {
    id,
    elementId: control(document, service.selector)!.id,
    window: popup,
    callback: '/spotify_callback',
    started: Date.now(),
  });
  listenHypedditNativeAuth(document, url, current);
  current.progress.set(id, {
    state: 'waiting',
    message: `Complete ${service.label} sign-in in Hypeddit’s window.`,
  });
  return {
    ok: true,
    message: `Complete ${service.label} sign-in in Hypeddit’s window. Gatebreaker will check its server response.`,
  };
}
export function hypedditActionProgress(
  id: string,
  document: Document,
  url: URL,
): GateActionProgress | null {
  if (!isHypedditPage(url)) return null;
  const current = state(document);
  if (hypedditReady(current))
    return { state: 'complete', message: 'Hypeddit’s server confirmed this download is ready.' };
  const pending = current.nativeAuth.get(id);
  if (pending && !pending.checking) {
    try {
      // Read only the owned window's public origin/path, never OAuth query data.
      if (
        pending.window.location.origin === 'https://hypeddit.com' &&
        pending.window.location.pathname === pending.callback
      ) {
        checkHypedditNativeAuth(document, url, current, pending);
      } else if (pending.window.closed) {
        checkHypedditNativeAuth(document, url, current, pending);
      }
    } catch {
      // Cross-origin consent is expected. Its content and credentials are not inspected.
      if (pending.window.closed) {
        checkHypedditNativeAuth(document, url, current, pending);
      }
    }
  }
  return current.progress.get(id) ?? null;
}
