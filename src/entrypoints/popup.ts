import { safeHttpsUrl } from '../domain/urls';
import { extension, isEnabled } from '../platform/browser';
import { messages } from '../platform/messages';
import type { PageStatus } from '../platform/messages';

const title = document.querySelector<HTMLElement>('#gate-title')!;
const description = document.querySelector<HTMLElement>('#description')!;
const stateText = document.querySelector<HTMLElement>('#state')!;
const steps = document.querySelector<HTMLElement>('#steps')!;
const action = document.querySelector<HTMLButtonElement>('#resolve')!;
const download = document.querySelector<HTMLAnchorElement>('#download')!;
const toggle = document.querySelector<HTMLInputElement>('#enabled')!;
let tabId: number | undefined;
let pageUrl: URL | undefined;
let pending = false;

function render(status: PageStatus): void {
  toggle.checked = status.enabled;
  pending = status.busy;
  title.textContent = status.gate?.title ?? 'Open a Hypeddit gate';
  stateText.textContent = status.busy
    ? 'Checking'
    : status.result?.ok
      ? 'Link ready'
      : status.result
        ? 'Unable to skip'
        : status.gate
          ? 'Hypeddit detected'
          : 'Waiting for a gate';
  steps.textContent = status.gate?.steps.length
    ? `Gate steps: ${status.gate.steps.join(', ')}`
    : '';
  steps.hidden = !steps.textContent;
  description.textContent = status.busy
    ? 'Checking for a download link. This can take up to 20 seconds.'
    : status.result
      ? status.result.ok
        ? 'Open the link to continue to the download.'
        : status.result.message
      : status.gate
        ? 'Try a direct download without sharing an email or connecting social accounts. Some gates enforce steps on their server.'
        : 'Visit a download gate on hypeddit.com, then reopen Gatebreak.';
  action.disabled = pending || !status.enabled || !status.gate;
  action.textContent = pending
    ? 'Checking download…'
    : status.result
      ? 'Try again'
      : 'Try skipping gates';
  document.querySelector('main')?.setAttribute('aria-busy', String(pending));
  const destination = status.result?.ok ? safeHttpsUrl(status.result.url) : null;
  download.hidden = !destination;
  if (destination) download.href = destination;
  else download.removeAttribute('href');
}

function showUnavailable(message: string): void {
  pending = false;
  action.disabled = true;
  download.hidden = true;
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
      'Reload the Hypeddit tab after installing or updating Gatebreak, then reopen this popup.',
    );
  }
}

action.addEventListener('click', () => {
  if (tabId === undefined || pending) return;
  pending = true;
  action.disabled = true;
  action.textContent = 'Checking download…';
  stateText.textContent = 'Checking';
  description.textContent = 'Checking for a download link. This can take up to 20 seconds.';
  download.hidden = true;
  void extension.tabs
    .sendMessage(tabId, { type: messages.resolve })
    .then((status: PageStatus) => render(status))
    .catch(() => showUnavailable('The page stopped responding. Reload the gate and try again.'));
});

toggle.addEventListener('change', () => {
  toggle.disabled = true;
  void extension.storage.local
    .set({ enabled: toggle.checked })
    .then(readStatus)
    .catch(() =>
      showUnavailable('Your preference could not be saved. Reopen Gatebreak and try again.'),
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
  if (
    !pageUrl ||
    !['hypeddit.com', 'www.hypeddit.com'].includes(pageUrl.hostname) ||
    pageUrl.protocol !== 'https:'
  ) {
    action.disabled = true;
    return;
  }
  await readStatus();
}

void initialize().catch(() =>
  showUnavailable('Gatebreak could not read the active page. Reopen the popup and try again.'),
);
