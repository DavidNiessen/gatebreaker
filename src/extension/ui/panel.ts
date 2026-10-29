import { pendingRequiredInteractions } from '../application/gate-actions';
import type { PageStatus } from '../platform/messages';
import { actionError } from './action-error';
import { createCaptchaView } from './captcha-view';
import { createCommentSettings } from './comment-settings';
import { createDestinationPicker } from './destinations';
import { countdownLabel } from './progress';

export interface GatePanel {
  update(status: PageStatus): void;
  remove(): void;
}

export function createPanel(
  anchor: Element,
  resolve: () => void,
  perform: (id: string) => void,
  cancelCheck: () => void,
  completeChallenge: (nonce: string) => void = () => {},
  placement: 'before' | 'after' = 'after',
): GatePanel {
  const host = document.createElement('div');
  host.id = 'gatebreaker-panel';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;--paper:#f4f6fb;--ink:#202b3d;--muted:#526178;--line:#cbd3df;--control-line:#a4b3cc;--accent:#2555a6;--accent-hover:#1a428b;--action-ink:#fff;--disabled-ink:#5e6d83;--disabled-paper:#e0e6f0;--secondary-hover:#e1e9f7;--focus:#a65313;--selection-paper:#d8e6ff;--selection-ink:#132f58;--error-line:#c5a892;--error-paper:#fff5ed;--error-ink:#713d1d;display:block;margin:16px 0;color-scheme:light;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
    @media(prefers-color-scheme:dark){:host{color-scheme:dark;--paper:#172131;--ink:#edf2fa;--muted:#b3c2d8;--line:#45546c;--control-line:#8495b0;--accent:#bad1fb;--accent-hover:#d0e0ff;--action-ink:#142d56;--disabled-ink:#b1bfd3;--disabled-paper:#2d3d55;--secondary-hover:#2d3d55;--focus:#ebaa6c;--selection-paper:#2555a6;--selection-ink:#edf2fa;--error-line:#a47b58;--error-paper:#36281e;--error-ink:#f3cda9}}
    *{box-sizing:border-box}section{padding:18px;background:var(--paper);border:1px solid var(--line);border-radius:12px}
    h2{font-size:16px;line-height:1.3;margin:0 0 6px;font-weight:700;color:var(--ink)}p{margin:0 0 14px;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
    button,a{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:10px 16px;border-radius:7px;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer}
    button{color:var(--action-ink);background:var(--accent);border:1px solid var(--accent);width:100%}button:hover:not(:disabled){background:var(--accent-hover)}button:disabled{color:var(--disabled-ink);background:var(--disabled-paper);border-color:var(--line);cursor:default}
    a{margin-bottom:10px;color:var(--action-ink);background:var(--accent);border:1px solid var(--accent);text-decoration:none;width:100%}a:hover{background:var(--accent-hover)}button[data-secondary="true"]{color:var(--accent);background:transparent;border-color:var(--control-line)}button[data-secondary="true"]:hover:not(:disabled){background:var(--secondary-hover)}
    button[data-secondary="true"]:disabled{color:var(--disabled-ink);background:var(--disabled-paper);border-color:var(--line)}
    .native-actions[data-error-only="true"]{margin-top:12px;padding-top:0;border-top:0}.native-actions[data-error-only="true"] .action-notice{margin-top:0}
    :focus-visible{outline:3px solid var(--focus);outline-offset:3px}[hidden]{display:none!important}
    .destination-picker{display:block;margin-bottom:10px;font:600 14px/1.4 system-ui,sans-serif}.destination-picker span{display:block;margin-bottom:6px}.destination-picker select{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--control-line);border-radius:7px;font:14px/1.4 system-ui,sans-serif;color:var(--ink);background:var(--paper)}
    ::selection{background:var(--selection-paper);color:var(--selection-ink)}@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease-out}}
    .cancel{margin-top:10px}.native-actions{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}h3{font:700 14px/1.4 system-ui,sans-serif;margin:0 0 8px;color:var(--ink)}.native-actions button{margin-top:8px}.native-actions small{display:block;font-size:12px;color:var(--muted);margin-top:4px}.action-notice{margin:14px 0 0;padding:12px;border:1px solid var(--error-line);border-radius:7px;background:var(--error-paper);color:var(--error-ink)}
  `;
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Gatebreaker download assistant');
  const heading = document.createElement('h2');
  heading.textContent = 'Gatebreaker';
  const statusText = document.createElement('p');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', (event) => {
    if (event.isTrusted) resolve();
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel check';
  cancel.dataset['secondary'] = 'true';
  cancel.className = 'cancel';
  cancel.hidden = true;
  cancel.addEventListener('click', (event) => {
    if (event.isTrusted) cancelCheck();
  });
  const link = document.createElement('a');
  link.textContent = 'Open download';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  const picker = createDestinationPicker(link);
  section.append(heading, statusText, picker.element, link, button, cancel);
  let commentSettings: HTMLDetailsElement | undefined;
  const native = document.createElement('div');
  native.className = 'native-actions';
  native.hidden = true;
  const nativeHeading = document.createElement('h3');
  nativeHeading.textContent = 'Continue with Hypeddit';
  const hint = document.createElement('p');
  hint.textContent =
    'Sign-in stays with Hypeddit. Review its requested follows, saves, and permissions.';
  const controls = document.createElement('div');
  const notice = document.createElement('p');
  notice.className = 'action-notice';
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-live', 'assertive');
  native.append(nativeHeading, hint, controls, notice);
  section.append(native);
  let actionKey = '';
  let captchaView: ReturnType<typeof createCaptchaView> | undefined;
  let challengeNonce = '';
  const captchaHost = document.createElement('div');
  captchaHost.hidden = true;
  button.after(captchaHost);

  root.append(style, section);
  anchor.insertAdjacentElement(placement === 'before' ? 'beforebegin' : 'afterend', host);
  return {
    update(status) {
      const locked = pendingRequiredInteractions(status.actions, status.actionStates).length > 0;
      section.setAttribute('aria-busy', String(status.busy));
      button.disabled =
        status.busy ||
        !status.enabled ||
        locked ||
        status.actionStates?.['prepare-email']?.state === 'waiting';
      button.textContent = status.busy
        ? status.cancelled
          ? 'Cancelling…'
          : (countdownLabel(status.progress) ?? 'Checking download…')
        : status.result
          ? 'Try again'
          : 'Download';
      const result = status.result;
      const needsComment = result?.ok === false && result.code === 'input-required';
      button.hidden = needsComment;
      if (needsComment && !commentSettings) {
        commentSettings = createCommentSettings({ required: true, saved: resolve });
        statusText.after(commentSettings);
      }
      if (commentSettings) commentSettings.hidden = !needsComment;
      button.dataset['secondary'] = String(result?.ok === true);
      statusText.textContent = status.busy
        ? status.cancelled
          ? 'Cancelling the current check…'
          : (status.progress?.message ??
            'Checking for a download link. This can take up to 20 seconds.')
        : status.cancelled
          ? 'Check cancelled. You can try again when you are ready.'
          : locked
            ? status.waitingForLogin
              ? 'Complete the required steps below. Download will continue automatically.'
              : 'Complete the required steps below to enable Download.'
            : actionError(status)
              ? 'The download needs attention. Details are shown below.'
              : status.delivery?.state === 'started'
                ? status.delivery.message
                : result
                  ? result.ok
                    ? result.method === 'embedded-link' || result.method === 'provider-request'
                      ? result.destinations && result.destinations.length > 1
                        ? 'The gate’s files are ready. Choose a file, then open it.'
                        : 'The gate’s destination is ready. Open it to continue.'
                      : 'A download link is ready. Open it to continue.'
                    : result.message
                  : status.gate?.provider === 'hypeddit'
                    ? 'Choose Download to handle email and supported gate steps automatically.'
                    : 'Choose Download to handle the supported gate steps automatically.';
      link.hidden = locked || !result?.ok;
      cancel.hidden = !status.busy && !status.waitingForLogin;
      cancel.disabled = status.cancelled === true;
      link.textContent =
        result?.ok && (result.method === 'embedded-link' || result.method === 'provider-request')
          ? 'Open destination'
          : 'Open download';
      if (result?.ok) link.href = result.url;
      else link.removeAttribute('href');
      picker.update(locked ? null : result, status.busy || !status.enabled || locked);
      const available = (status.actions ?? []).filter(
        (action) =>
          (action.kind === 'sign-in' || action.kind === 'captcha' || action.kind === 'social') &&
          action.required,
      );
      const emailProgress = status.actionStates?.['prepare-email'];
      const message = actionError(status);
      native.hidden = available.length === 0 && !message;
      native.dataset['errorOnly'] = String(available.length === 0);
      nativeHeading.hidden = available.length === 0;
      nativeHeading.textContent = available.length
        ? `Continue with ${status.providerName ?? 'the website'}`
        : 'Email step';
      hint.textContent = available.some((action) => action.kind === 'social')
        ? 'Complete the required action in SoundCloud. The gate verifies it when you return.'
        : `Sign-in stays with ${status.providerName ?? 'the website'}. Review its requested actions and permissions.`;
      hint.hidden = available.length === 0;
      const nextKey = JSON.stringify(available);
      if (nextKey !== actionKey) {
        actionKey = nextKey;
        controls.replaceChildren();
        for (const action of available) {
          const item = document.createElement('div');
          const control = document.createElement('button');
          control.type = 'button';
          control.textContent = action.label;
          control.dataset['secondary'] = 'true';
          control.addEventListener('click', (event) => {
            if (event.isTrusted) perform(action.id);
          });
          const detail = document.createElement('small');
          detail.textContent =
            action.kind === 'social'
              ? action.description
              : action.required
                ? 'Required by this gate.'
                : 'Optional for this gate.';
          control.dataset['action'] = action.id;
          item.append(control, detail);
          controls.append(item);
        }
      }
      controls.querySelectorAll<HTMLButtonElement>('button').forEach((control) => {
        const progress = status.actionStates?.[control.dataset['action']!];
        control.disabled =
          status.busy ||
          !status.enabled ||
          progress?.state === 'complete' ||
          (progress?.state === 'waiting' &&
            (control.dataset['action'] === 'prepare-email' ||
              status.gate?.provider === 'hypeddit'));
        const detail = control.parentElement?.querySelector('small');
        if (detail) detail.hidden = progress?.state === 'complete' || progress?.state === 'error';
        const nativeAction = available.find((action) => action.id === control.dataset['action']);
        if (nativeAction)
          control.textContent =
            progress?.state === 'error' && progress.retryLabel
              ? progress.retryLabel
              : progress?.state === 'complete'
                ? nativeAction.label.replace('Sign in with', 'Connected to')
                : progress?.state === 'waiting' &&
                    nativeAction.kind === 'sign-in' &&
                    status.gate?.provider === 'hypeddit'
                  ? nativeAction.label.replace('Sign in with', 'Waiting for') + '…'
                  : nativeAction.label;
      });
      const challenge = status.challenge ?? null;
      if (challenge?.nonce !== challengeNonce) {
        captchaView?.remove();
        captchaView = undefined;
        challengeNonce = challenge?.nonce ?? '';
        if (challenge) {
          captchaView = createCaptchaView(challenge, {
            solved: completeChallenge,
            cancel: cancelCheck,
          });
          captchaHost.append(captchaView.element);
        }
      }
      captchaHost.hidden = !challenge;
      if (challenge) {
        cancel.hidden = true;
        if (!available.some((action) => action.kind === 'sign-in')) native.hidden = true;
      }
      notice.textContent = message;
      notice.hidden = !message;
      if (!status.busy && !status.challenge && emailProgress?.state === 'error')
        button.textContent = 'Try again';
    },
    remove() {
      captchaView?.remove();
      host.remove();
    },
  };
}
