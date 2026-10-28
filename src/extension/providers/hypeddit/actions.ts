import type { GatePreferences } from '../../../core/domain/preferences';
import type {
  AuthorizationOpener,
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
} from '../../../core/domain/provider';
import { verifyHypedditEmail } from '../../../core/providers/hypeddit/email';
import { control, services } from '../../../core/providers/hypeddit/requirements';
import type { HypedditState as State } from '../../../core/providers/hypeddit/session';
import { hypedditReady, hypedditState as state } from '../../../core/providers/hypeddit/session';
import { optionalHypedditStep as optional } from '../../../core/providers/hypeddit/steps';
import { isHypedditPage } from '../../../core/providers/hypeddit/urls';
import { automaticEmail } from '../../../core/providers/shared/automatic-email';
import { challengeDescriptor, emailChallenge, validChallengeNonce } from './captcha';
import {
  cancelHypedditNativeAuth,
  checkHypedditNativeAuth,
  listenHypedditNativeAuth,
  nativeFinalUnavailable,
  observeHypedditNativeAuth,
} from './native-auth';
export { hypedditEmail } from '../../../core/providers/hypeddit/session';
function field(document: Document, id: string): string {
  return document.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value.trim() ?? '';
}
export function listHypedditActions(document: Document, url: URL): readonly GateAction[] {
  if (!isHypedditPage(url)) return [];
  const actions: GateAction[] = services
    .filter(
      (service) =>
        (state(document).authRequired ||
          (service.earlyDiscovery && !!state(document).acceptedEmail)) &&
        control(document, service.selector),
    )
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
      description: `Submits ${automaticEmail} to Hypeddit’s verification request.`,
      required: !optional(document, 'email'),
    });
  if (state(document).captchaRequired)
    actions.push({
      id: 'solve-captcha',
      kind: 'captcha',
      label: 'Solve CAPTCHA',
      description:
        'Complete Google reCAPTCHA manually. Gatebreaker resumes after Hypeddit accepts the email.',
      required: true,
    });
  return actions;
}
/** Firefox content-script URLSearchParams iterators can be non-iterable. */
function onlyQueryParameters(parameters: URLSearchParams, allowed: readonly string[]): boolean {
  let valid = true;
  parameters.forEach((_value, key) => {
    if (!allowed.includes(key)) valid = false;
  });
  return valid;
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
    const contract = services.find((candidate) => candidate.id === service)?.auth;
    if (!contract || url.origin !== contract.origin || url.pathname !== contract.path) return null;
    for (const key of contract.parameters)
      if (url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)?.trim())
        return null;
    // Preserve Spotify's established optional query handling. MC/DZ are bounded to
    // the exact parameter sets found in their native handlers.
    if (service !== 'spotify' && !onlyQueryParameters(url.searchParams, contract.parameters))
      return null;
    const callback = url.searchParams.get('redirect_uri')!;
    if (service === 'mixcloud') {
      const redirect = new URL(callback);
      if (
        redirect.origin !== 'https://hypeddit.com' ||
        redirect.pathname !== contract.callback ||
        redirect.username ||
        redirect.password ||
        redirect.port ||
        redirect.hash ||
        redirect.searchParams.getAll('state').length !== 1 ||
        !onlyQueryParameters(redirect.searchParams, ['state']) ||
        redirect.searchParams.get('state') !== url.searchParams.get('state')
      )
        return null;
    } else if (callback !== 'https://hypeddit.com' + contract.callback) return null;
    if (service === 'spotify' && url.searchParams.get('response_type') !== 'code') return null;
    return url.href;
  } catch {
    return null;
  }
}
async function verifyEmail(
  document: Document,
  url: URL,
  current: State,
  email: string,
): Promise<void> {
  current.emailCheck?.abort();
  const check = new AbortController();
  current.emailCheck = check;
  const active = () =>
    state(document) === current && !check.signal.aborted && current.emailCheck === check;
  const update = (value: GateActionProgress) => {
    if (active()) current.progress.set('prepare-email', value);
  };
  try {
    const { name } = await verifyHypedditEmail(document, url, email, {
      fetch: document.defaultView?.fetch?.bind(document.defaultView) ?? globalThis.fetch,
      signal: check.signal,
    });
    if (!active()) return;
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
  opener?: AuthorizationOpener,
  preferences?: GatePreferences,
): GateActionResult {
  if (preferences) state(document).preferences = preferences;
  if (!listHypedditActions(document, url).some((action) => action.id === id))
    return { ok: false, message: 'This Hypeddit step is unavailable.' };
  const current = state(document);
  if (hypedditReady(current))
    return { ok: true, message: 'Hypeddit’s server confirmed this download is ready.' };
  if (id === 'solve-captcha') {
    if (current.captcha?.verifying)
      return { ok: true, message: 'Waiting for Hypeddit’s email verification.' };
    current.captcha = {
      view: challengeDescriptor(
        url,
        mode === 'reveal' ? 'popup' : 'page',
        field(document, 'current_download_file_listner'),
      ),
      started: Date.now(),
      verifying: false,
    };
    current.progress.set(id, {
      state: 'waiting',
      message: 'Complete the CAPTCHA in Gatebreaker. Download will continue automatically.',
    });
    return { ok: true, message: 'CAPTCHA ready to open.' };
  }
  if (id === 'prepare-email') {
    const previous = current.progress.get(id);
    if (previous?.state === 'waiting' || previous?.state === 'complete')
      return { ok: true, message: previous.message };
    const needed = emailChallenge(document);
    if (needed === 'unknown')
      return {
        ok: false,
        message:
          'Hypeddit’s email attempt data could not be read. Reload the gate before trying again.',
      };
    if (needed === 'required') {
      current.captchaRequired = true;
      current.captcha = {
        view: challengeDescriptor(url, 'page', field(document, 'current_download_file_listner')),
        started: Date.now(),
        verifying: false,
      };
      current.progress.set('solve-captcha', {
        state: 'waiting',
        message: 'Complete the CAPTCHA in Gatebreaker.',
      });
      current.progress.set(id, {
        state: 'error',
        message: 'Hypeddit requires a CAPTCHA. Complete it in Gatebreaker to continue.',
      });
      return {
        ok: true,
        message: 'Hypeddit requires a CAPTCHA. Choose Solve CAPTCHA to continue.',
      };
    }
    const email = automaticEmail;
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
  if (mode !== 'activate' && !(mode === 'reuse' && id === 'sign-in-spotify' && opener))
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
  if (!address || !service.auth)
    return {
      ok: false,
      message: 'This Hypeddit sign-in address is unsupported. Use the website’s sign-in.',
    };
  const existing = current.nativeAuth.get(id);
  if (existing && Date.now() - existing.started <= 120000 && current.progress.get(id)?.retryLabel) {
    checkHypedditNativeAuth(document, url, current, existing);
    return { ok: true, message: 'Checking Hypeddit’s download server again.' };
  }
  if (existing && !existing.window?.closed && Date.now() - existing.started <= 120000)
    return { ok: true, message: 'Complete sign-in in the existing Hypeddit window.' };
  existing?.controller.abort();
  const nativeControl = control(document, service.selector)!;
  const step = nativeControl.closest('.fangate-slider-content');
  const stepWasAdvanced = step?.classList.contains('move-left') ?? false;
  const finalButton = document.getElementById('gateDownloadButton');
  const finalWasUnavailable = !!finalButton && nativeFinalUnavailable(finalButton);
  const correlated = service.id === 'spotify' && !!opener;
  const popup = correlated
    ? undefined
    : document.defaultView?.open(address, service.auth.popup, 'popup,width=720,height=640');
  if (!correlated && !popup)
    return { ok: false, message: 'Allow this sign-in popup, then try again.' };
  current.nativeAuth.set(id, {
    id,
    elementId: nativeControl.id,
    step,
    stepWasAdvanced,
    finalButton,
    finalWasUnavailable,
    window: popup ?? undefined,
    correlatedReturn: correlated,
    controller: new AbortController(),
    callback: service.auth.callback,
    started: Date.now(),
    // A closed/opaque handle can precede the callback. Wait for its native
    // return signal before making the first final request.
  });
  listenHypedditNativeAuth(document, url, current);
  if (correlated && opener) {
    const pending = current.nativeAuth.get(id)!;
    const signals = {
      returned: () => {
        if (
          pending.controller.signal.aborted ||
          state(document) !== current ||
          current.nativeAuth.get(id) !== pending
        )
          return;
        pending.callbackSeen = true;
        pending.returnObserved = true;
        checkHypedditNativeAuth(document, url, current, pending);
      },
      closed: () => {
        if (pending.closeTimer || pending.controller.signal.aborted) return;
        pending.closeTimer = setTimeout(() => {
          if (
            pending.controller.signal.aborted ||
            state(document) !== current ||
            current.nativeAuth.get(id) !== pending ||
            pending.callbackSeen ||
            pending.returnObserved
          )
            return;
          current.nativeAuth.delete(id);
          pending.controller.abort();
          current.progress.set(id, {
            state: 'error',
            message:
              'The Spotify window closed before sign-in was confirmed. Choose Sign in with Spotify to try again.',
          });
        }, 1500);
      },
    };
    void opener(address, pending.controller.signal, signals)
      .then((opened) => {
        if (
          opened ||
          pending.controller.signal.aborted ||
          state(document) !== current ||
          current.nativeAuth.get(id) !== pending
        )
          return;
        current.nativeAuth.delete(id);
        pending.controller.abort();
        current.progress.set(id, {
          state: 'error',
          message: 'Spotify sign-in could not open. Choose Sign in with Spotify to try again.',
        });
      })
      .catch(() => {
        if (
          pending.controller.signal.aborted ||
          state(document) !== current ||
          current.nativeAuth.get(id) !== pending
        )
          return;
        current.nativeAuth.delete(id);
        pending.controller.abort();
        current.progress.set(id, {
          state: 'error',
          message: 'Spotify sign-in could not open. Choose Sign in with Spotify to try again.',
        });
      });
  }
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
    return {
      state: 'complete',
      message: 'Hypeddit’s server confirmed this download is ready.',
      ...(current.progress.get(id)?.reusable ? { reusable: true } : {}),
    };
  const pending = current.nativeAuth.get(id);
  if (pending) observeHypedditNativeAuth(document, url, current, pending);
  return current.progress.get(id) ?? null;
}

export function hypedditChallenge(document: Document) {
  const current = state(document);
  if (current.captcha && Date.now() - current.captcha.started > 300000) {
    current.emailCheck?.abort();
    delete current.captcha;
    current.progress.set('solve-captcha', {
      state: 'error',
      message: 'The CAPTCHA session expired. Choose Solve CAPTCHA to try again.',
    });
    current.progress.set('prepare-email', {
      state: 'error',
      message: 'The CAPTCHA session expired. Choose Solve CAPTCHA to try again.',
    });
  }
  return current.captcha?.view ?? null;
}
export function completeHypedditChallenge(nonce: string, document: Document, url: URL): void {
  const current = state(document),
    session = current.captcha;
  if (
    !validChallengeNonce(nonce) ||
    session?.view.nonce !== nonce ||
    session.verifying ||
    !hypedditChallenge(document)
  )
    return;
  session.verifying = true;
  current.progress.set('prepare-email', {
    state: 'waiting',
    message: 'Checking the email with Hypeddit after CAPTCHA.',
  });
  void verifyEmail(document, url, current, automaticEmail).then(() => {
    if (state(document) !== current || current.captcha !== session) return;
    const progress = current.progress.get('prepare-email');
    if (!progress || progress.state === 'waiting') return;
    current.progress.set('solve-captcha', progress);
    current.captchaRequired = progress.state !== 'complete';
    delete current.captcha;
  });
}
export function cancelHypedditActions(document: Document): void {
  cancelHypedditNativeAuth(document);
  const current = state(document);
  current.emailCheck?.abort();
  if (current.captchaRequired || current.captcha) {
    delete current.captcha;
    current.captchaRequired = false;
    const progress: GateActionProgress = {
      state: 'error',
      message: 'CAPTCHA cancelled. Choose Download to try again.',
    };
    current.progress.set('prepare-email', progress);
    current.progress.set('solve-captcha', progress);
  }
}
