import { actionError } from '../ui/action-error';
import { safeHttpsUrl } from '../domain/urls';
import { providers } from '../providers';
import { extension, isEnabled } from '../platform/browser';
import { messages } from '../platform/messages';
import type { PageStatus } from '../platform/messages';
import { countdownLabel } from '../ui/progress';
import { createDestinationPicker } from '../ui/destinations';
import { pendingRequiredSignIns } from '../application/gate-actions';

const title = document.querySelector<HTMLElement>('#gate-title')!;
const description = document.querySelector<HTMLElement>('#description')!;
const stateText = document.querySelector<HTMLElement>('#state')!;
const action = document.querySelector<HTMLButtonElement>('#resolve')!;
const download = document.querySelector<HTMLAnchorElement>('#download')!;
const picker = createDestinationPicker(download);
download.before(picker.element);
const toggle = document.querySelector<HTMLInputElement>('#enabled')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const native = document.querySelector<HTMLElement>('#native-actions')!;
const nativeControls = document.querySelector<HTMLElement>('#native-controls')!;
const nativeNotice = document.querySelector<HTMLElement>('#native-notice')!;

let actionKey = '';
let tabId: number | undefined;
let pageUrl: URL | undefined;
let pending = false;
let waitingForLogin = false;
let channel: chrome.runtime.Port | undefined;

function render(status: PageStatus): void {
  const locked = pendingRequiredSignIns(status.actions, status.actionStates).length > 0;
  waitingForLogin = status.waitingForLogin === true;
  toggle.checked = status.enabled;
  pending = status.busy;
  title.textContent = status.gate?.title ?? 'Open a supported gate';
  stateText.textContent = status.busy
    ? status.cancelled
      ? 'Cancelling'
      : status.progress?.remainingSeconds
        ? 'Waiting for provider'
        : 'Checking'
    : status.cancelled
      ? 'Cancelled'
      : locked
        ? 'Sign-in required'
        : status.delivery?.state === 'started'
          ? status.delivery.files
            ? 'Download started'
            : 'Destination opened'
          : status.result?.ok
            ? 'Link ready'
            : status.result
              ? 'Unable to skip'
              : status.gate
                ? `${status.providerName ?? 'Gate'} detected`
                : 'Waiting for a gate';
  description.textContent = status.busy
    ? status.cancelled
      ? 'Cancelling the current check…'
      : (status.progress?.message ??
        'Checking for a download link. This can take up to 20 seconds.')
    : status.cancelled
      ? 'Check cancelled. You can try again when you are ready.'
      : locked
        ? waitingForLogin
          ? 'Complete the required sign-ins below. Download will continue automatically.'
          : 'Complete the required sign-ins below to enable Download.'
        : actionError(status)
          ? 'The download needs attention. Details are shown below.'
          : status.delivery?.state === 'started'
            ? status.delivery.message
            : status.result
              ? status.result.ok
                ? status.result.method === 'embedded-link' ||
                  status.result.method === 'provider-request'
                  ? status.result.destinations && status.result.destinations.length > 1
                    ? 'The gate’s files are ready. Choose a file, then open it.'
                    : 'The gate’s destination is ready. Open it to continue.'
                  : 'Open the link to continue to the download.'
                : status.result.message
              : status.gate
                ? status.gate.provider === 'hypeddit'
                  ? 'Choose Download to handle email and supported gate steps automatically.'
                  : 'Choose Download to handle the supported gate steps automatically.'
                : 'Open a supported download gate, then reopen Gatebreaker. See Source & help for the provider list.';
  action.disabled =
    pending ||
    !status.enabled ||
    !status.gate ||
    locked ||
    status.actionStates?.['prepare-email']?.state === 'waiting';
  action.dataset['secondary'] = String(status.result?.ok === true);
  action.textContent = pending
    ? status.cancelled
      ? 'Cancelling…'
      : (countdownLabel(status.progress) ?? 'Checking download…')
    : status.result
      ? 'Try again'
      : 'Download';
  document.querySelector('main')?.setAttribute('aria-busy', String(pending));
  cancel.hidden = !status.busy && !waitingForLogin;
  cancel.disabled = status.cancelled === true;
  const destination = !locked && status.result?.ok ? safeHttpsUrl(status.result.url) : null;
  download.hidden = !destination;
  download.textContent =
    status.result?.ok &&
    (status.result.method === 'embedded-link' || status.result.method === 'provider-request')
      ? 'Open destination'
      : 'Open download';
  if (destination) download.href = destination;
  else download.removeAttribute('href');
  picker.update(locked ? null : status.result, pending || !status.enabled || locked);
  const actions = (status.actions ?? []).filter((item) => item.kind === 'sign-in' && item.required);
  const emailProgress = status.actionStates?.['prepare-email'];
  const message = actionError(status);
  native.hidden = actions.length === 0 && !message;
  native.dataset['errorOnly'] = String(actions.length === 0);
  document.querySelector<HTMLElement>('#native-title')!.hidden = actions.length === 0;
  document.querySelector('#native-title')!.textContent = actions.length
    ? `Continue with ${status.providerName ?? 'the website'}`
    : 'Email step';
  const nativeHint = document.querySelector<HTMLElement>('#native-hint')!;
  nativeHint.hidden = actions.length === 0;
  nativeHint.textContent = `Sign-in stays with ${status.providerName ?? 'the website'}. Review its requested actions and permissions.`;
  const nextKey = JSON.stringify(actions);
  if (nextKey !== actionKey) {
    actionKey = nextKey;
    nativeControls.replaceChildren();
    for (const item of actions) {
      const row = document.createElement('div');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset['secondary'] = 'true';
      button.textContent = item.label;
      button.addEventListener('click', () => {
        void runNativeAction(item.id);
      });
      const detail = document.createElement('small');
      detail.textContent = item.required ? 'Required by this gate.' : 'Optional for this gate.';
      button.dataset['action'] = item.id;
      detail.dataset['action'] = item.id;
      row.append(button, detail);
      nativeControls.append(row);
    }
  }
  nativeControls.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    const id = button.dataset['action']!;
    const progress = status.actionStates?.[id];
    button.disabled =
      pending || !status.enabled || progress?.state === 'complete' || progress?.state === 'waiting';
    const detail = button.parentElement?.querySelector('small');
    if (detail) detail.hidden = progress?.state === 'complete' || progress?.state === 'error';
    const nativeAction = actions.find((item) => item.id === id);
    if (nativeAction)
      button.textContent =
        progress?.state === 'complete'
          ? nativeAction.label.replace('Sign in with', 'Connected to')
          : progress?.state === 'waiting' && nativeAction.kind === 'sign-in'
            ? nativeAction.label.replace('Sign in with', 'Waiting for') + '…'
            : nativeAction.label;
  });
  nativeNotice.textContent = message;
  nativeNotice.hidden = !message;
  if (!pending && emailProgress?.state === 'error') action.textContent = 'Try again';
}

async function runNativeAction(id: string): Promise<void> {
  if (tabId === undefined || pending) return;
  pending = true;
  action.disabled = true;
  picker.update(null, true);
  nativeControls.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  try {
    render(
      (await extension.tabs.sendMessage(tabId, {
        type: messages.action,
        action: id,
      })) as PageStatus,
    );
  } catch {
    showUnavailable('The gate step could not open. Reload the page and try again.');
  }
}

function showUnavailable(message: string): void {
  pending = false;
  action.disabled = true;
  download.hidden = true;
  download.removeAttribute('href');
  picker.update(null, true);
  native.hidden = true;
  cancel.hidden = true;
  stateText.textContent = 'Page unavailable';
  description.textContent = message;
  document.querySelector('main')?.setAttribute('aria-busy', 'false');
}

async function readStatus(): Promise<void> {
  if (tabId === undefined) return;
  try {
    render((await extension.tabs.sendMessage(tabId, { type: messages.status })) as PageStatus);
  } catch {
    showUnavailable(
      'Reload the gate tab after installing or updating Gatebreaker, then reopen this popup.',
    );
  }
}

action.addEventListener('click', () => {
  if (tabId === undefined || pending) return;
  pending = true;
  action.disabled = true;
  action.textContent = 'Checking download…';
  picker.update(null, true);
  nativeControls.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  stateText.textContent = 'Checking';
  description.textContent = 'Checking for a download link. This can take up to 20 seconds.';
  download.hidden = true;
  download.removeAttribute('href');
  void extension.tabs
    .sendMessage(tabId, { type: messages.resolve })
    .then((status: PageStatus) => render(status))
    .catch(() => showUnavailable('The page stopped responding. Reload the gate and try again.'));
});

cancel.addEventListener('click', () => {
  if (tabId === undefined || (!pending && !waitingForLogin)) return;
  cancel.disabled = true;
  void extension.tabs
    .sendMessage(tabId, { type: messages.cancel })
    .catch(() => showUnavailable('The page stopped responding. Reload the gate and try again.'));
});

toggle.addEventListener('change', () => {
  toggle.disabled = true;
  void extension.storage.local
    .set({ enabled: toggle.checked })
    .then(readStatus)
    .catch(() =>
      showUnavailable('Your preference could not be saved. Reopen Gatebreaker and try again.'),
    )
    .finally(() => {
      toggle.disabled = false;
    });
});

async function initialize(): Promise<void> {
  toggle.checked = await isEnabled();
  const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    if (tab?.url) pageUrl = new URL(tab.url);
  } catch {
    /* Non-web browser surface. */
  }
  if (!pageUrl || !providers.some((provider) => provider.matches(pageUrl!))) {
    action.disabled = true;
    return;
  }
  await readStatus();
  channel = extension.tabs.connect(tabId!, { name: 'gatebreaker:popup' });
  channel.onMessage.addListener((state: PageStatus) => render(state));
}

void initialize().catch(() =>
  showUnavailable('Gatebreaker could not read the active page. Reopen the popup and try again.'),
);
