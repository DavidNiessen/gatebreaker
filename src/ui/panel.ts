import { actionError } from './action-error';
import type { PageStatus } from '../platform/messages';
import { countdownLabel } from './progress';
import { createDestinationPicker } from './destinations';
import { pendingRequiredSignIns } from '../application/gate-actions';

export interface GatePanel {
  update(status: PageStatus): void;
  remove(): void;
}

export function createPanel(
  anchor: Element,
  resolve: () => void,
  perform: (id: string) => void,
  cancelCheck: () => void,
): GatePanel {
  const host = document.createElement('div');
  host.id = 'gatebreaker-panel';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;display:block;margin:16px 0;color-scheme:light;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#242820}
    *{box-sizing:border-box}section{padding:18px;background:#f5f4ed;border:1px solid #d2d5c8;border-radius:12px}
    h2{font-size:16px;line-height:1.3;margin:0 0 6px;font-weight:700;color:#242820}p{margin:0 0 14px;font-size:13px;color:#50564a;overflow-wrap:anywhere}
    button,a{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:10px 16px;border-radius:7px;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer}
    button{color:#fff;background:#365339;border:1px solid #365339;width:100%}button:hover:not(:disabled){background:#29412c}button:disabled{color:#666e5f;background:#e2e5d9;border-color:#d2d5c8;cursor:default}
    a{margin-bottom:10px;color:#fff;background:#365339;border:1px solid #365339;text-decoration:none;width:100%}a:hover{background:#29412c}button[data-secondary="true"]{color:#365339;background:transparent;border-color:#a6b79e}button[data-secondary="true"]:hover:not(:disabled){background:#e3ebdc}
    button[data-secondary="true"]:disabled{color:#666e5f;background:#e2e5d9;border-color:#d2d5c8}
    .native-actions[data-error-only="true"]{margin-top:12px;padding-top:0;border-top:0}.native-actions[data-error-only="true"] .action-notice{margin-top:0}
    :focus-visible{outline:3px solid #a65313;outline-offset:3px}[hidden]{display:none!important}
    .destination-picker{display:block;margin-bottom:10px;font:600 14px/1.4 system-ui,sans-serif}.destination-picker span{display:block;margin-bottom:6px}.destination-picker select{width:100%;min-height:44px;padding:10px 12px;border:1px solid #a6b79e;border-radius:7px;font:14px/1.4 system-ui,sans-serif;color:#242820;background:#f5f4ed}
    ::selection{background:#dbe6c8;color:#1d2819}@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease-out}}
    .cancel{margin-top:10px}.native-actions{margin-top:18px;padding-top:16px;border-top:1px solid #d2d5c8}h3{font:700 14px/1.4 system-ui,sans-serif;margin:0 0 8px;color:#242820}.native-actions button{margin-top:8px}.native-actions small{display:block;font-size:12px;color:#50564a;margin-top:4px}.action-notice{margin:14px 0 0;padding:12px;border:1px solid #c5a892;border-radius:7px;background:#fff5ed;color:#713d1d}
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
  root.append(style, section);
  anchor.insertAdjacentElement('afterend', host);
  return {
    update(status) {
      const locked = pendingRequiredSignIns(status.actions, status.actionStates).length > 0;
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
              ? 'Complete the required sign-ins below. Download will continue automatically.'
              : 'Complete the required sign-ins below to enable Download.'
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
        (action) => action.kind === 'sign-in' && action.required,
      );
      const emailProgress = status.actionStates?.['prepare-email'];
      const message = actionError(status);
      native.hidden = available.length === 0 && !message;
      native.dataset['errorOnly'] = String(available.length === 0);
      nativeHeading.hidden = available.length === 0;
      nativeHeading.textContent = available.length
        ? `Continue with ${status.providerName ?? 'the website'}`
        : 'Email step';
      hint.textContent = `Sign-in stays with ${status.providerName ?? 'the website'}. Review its requested actions and permissions.`;
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
          detail.textContent = action.required
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
            progress?.state === 'complete'
              ? nativeAction.label.replace('Sign in with', 'Connected to')
              : progress?.state === 'waiting' &&
                  nativeAction.kind === 'sign-in' &&
                  status.gate?.provider === 'hypeddit'
                ? nativeAction.label.replace('Sign in with', 'Waiting for') + '…'
                : nativeAction.label;
      });
      notice.textContent = message;
      notice.hidden = !message;
      if (!status.busy && emailProgress?.state === 'error') button.textContent = 'Try again';
    },
    remove() {
      host.remove();
    },
  };
}
