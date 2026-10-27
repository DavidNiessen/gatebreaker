import type {
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
} from '../../domain/provider';
import { isHypedditPage } from './urls';

const signIns = [
  { id: 'spotify', label: 'Spotify', selector: '#login_to_sp, #login_sp', step: 'sp' },
  { id: 'soundcloud', label: 'SoundCloud', selector: '#login_to_sc, #login_sc', step: 'sc' },
] as const;

function signInControl(document: Document, selector: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      (element) =>
        !element.hidden &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true' &&
        ![
          'hide',
          'disabled',
          'disable',
          'hy-btn-spotify-disable',
          'hy-btn-soundcloud-disable',
        ].some((name) => element.classList.contains(name)),
    ) ?? null
  );
}

function optional(document: Document, step: string): boolean {
  return [...document.querySelectorAll<HTMLElement>(`[data-step="${step}"]`)].some(
    (element) =>
      (element.id === `skipper_${step}` || element.id === 'skipper') &&
      !element.classList.contains('hide') &&
      !element.hidden,
  );
}

export function listHypedditActions(document: Document, url: URL): readonly GateAction[] {
  if (!isHypedditPage(url)) return [];
  const actions: GateAction[] = [];
  for (const service of signIns) {
    if (signInControl(document, service.selector))
      actions.push({
        id: `sign-in-${service.id}`,
        kind: 'sign-in',
        label: `Sign in with ${service.label}`,
        description:
          'Uses Hypeddit’s sign-in. Review the follows, saves, and permissions it requests.',
        required: !optional(document, service.step),
      });
  }
  if (
    document.querySelector('#email_address') &&
    document.querySelector('#email_to_downloads_next, .email_to_downloads')
  )
    actions.push({
      id: 'prepare-email',
      kind: 'email',
      label: 'Email step',
      description:
        'Automatically submits a random-word iCloud placeholder through Hypeddit’s native email step.',
      required: !optional(document, 'email'),
    });
  return actions;
}

const emailWords = [
  'acacia',
  'alder',
  'alpine',
  'amber',
  'amethyst',
  'anemone',
  'apricot',
  'arbutus',
  'aspen',
  'aster',
  'aurora',
  'azalea',
  'bamboo',
  'barley',
  'basalt',
  'beech',
  'birch',
  'blossom',
  'bluebell',
  'boulder',
  'bramble',
  'breeze',
  'brook',
  'buckeye',
  'cactus',
  'camellia',
  'canyon',
  'cedar',
  'cherry',
  'chestnut',
  'clover',
  'cobalt',
  'coral',
  'cosmos',
  'cove',
  'cricket',
  'cypress',
  'dahlia',
  'daisy',
  'delta',
  'driftwood',
  'dune',
  'elm',
  'ember',
  'fern',
  'fir',
  'firefly',
  'flint',
  'forest',
  'foxglove',
  'frost',
  'garnet',
  'ginger',
  'glacier',
  'granite',
  'grove',
  'harbor',
  'hazel',
  'heather',
  'hemlock',
  'hibiscus',
  'hickory',
  'holly',
  'horizon',
  'indigo',
  'iris',
  'ivy',
  'jasmine',
  'juniper',
  'kestrel',
  'lagoon',
  'larch',
  'laurel',
  'lavender',
  'lilac',
  'lily',
  'linden',
  'lotus',
  'lupine',
  'magnolia',
  'maple',
  'marigold',
  'meadow',
  'moonstone',
  'moss',
  'mulberry',
  'myrtle',
  'nectar',
  'nutmeg',
  'oak',
  'olive',
  'onyx',
  'orchid',
  'otter',
  'pebble',
  'pepper',
  'pine',
  'poppy',
  'primrose',
  'quartz',
  'rainbow',
  'raven',
  'reed',
  'robin',
  'rosemary',
  'rowan',
  'ruby',
  'saffron',
  'sage',
  'sapphire',
  'sequoia',
  'sorrel',
  'sparrow',
  'spruce',
  'starling',
  'stone',
  'sunflower',
  'sunset',
  'sycamore',
  'thistle',
  'thyme',
  'tulip',
  'violet',
  'walnut',
  'willow',
  'wisteria',
  'yarrow',
  'zephyr',
] as const;

/** A single dictionary-word placeholder; this does not create or control a mailbox. */
export function randomEmail(exclude?: string): string {
  const sample = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const index = sample % emailWords.length;
  const email = `${emailWords[index]}@icloud.com`;
  return email === exclude?.trim().toLowerCase()
    ? `${emailWords[(index + 1) % emailWords.length]}@icloud.com`
    : email;
}

export function performHypedditAction(
  id: string,
  document: Document,
  url: URL,
  _mode: GateActionMode,
): GateActionResult {
  if (
    !isHypedditPage(url) ||
    !listHypedditActions(document, url).some((action) => action.id === id)
  )
    return { ok: false, message: 'This Hypeddit step is not available on the current page.' };
  for (const service of signIns) {
    if (id !== `sign-in-${service.id}`) continue;
    const button = signInControl(document, service.selector)!;
    button.click();
    return {
      ok: true,
      message: `Complete ${service.label} sign-in in Hypeddit’s window, then return here. Hypeddit manages the session; the download is not yet confirmed.`,
    };
  }
  if (id === 'prepare-email') {
    const input = document.querySelector<HTMLInputElement>('#email_address')!;
    const email = randomEmail(input.value);
    input.value = email;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const name = document.querySelector<HTMLInputElement>('#email_name');
    if (name && !name.value.trim()) {
      name.value = 'Listener';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      name.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelector<HTMLElement>('#email_to_downloads_next, .email_to_downloads')!.click();
    return {
      ok: true,
      value: email,
      message: 'Generated email submitted through Hypeddit. Waiting for the website’s response.',
    };
  }
  return { ok: false, message: 'This gate step is not available.' };
}

export function hypedditActionProgress(
  id: string,
  document: Document,
  url: URL,
): GateActionProgress | null {
  if (!isHypedditPage(url)) return null;
  const email = id === 'prepare-email';
  const service = signIns.find((candidate) => id === `sign-in-${candidate.id}`);
  if (!email && !service) return null;
  const control = email
    ? document.querySelector<HTMLElement>('#email_address')
    : document.querySelector<HTMLElement>(service!.selector);
  const selectors = email
    ? '.name_error_email, .name_error_email_name, #error_download_email_address'
    : service?.id === 'soundcloud'
      ? '.name_error_soundcloud, #sc_comment_error'
      : '.name_error_spotify, #spotify_error';
  for (const element of document.querySelectorAll<HTMLElement>(selectors)) {
    if (
      !element.hidden &&
      !element.classList.contains('hide') &&
      element.style.display !== 'none' &&
      element.textContent?.trim()
    )
      return { state: 'error', message: element.textContent.trim().slice(0, 300) };
  }
  if (control?.closest('.fangate-slider-content')?.classList.contains('move-left'))
    return {
      state: 'complete',
      message: email
        ? 'Email step completed on Hypeddit.'
        : `${service!.label} step completed on Hypeddit.`,
    };
  if (email) {
    const captcha = document.querySelector<HTMLElement>('#gatePreviewCaptcha');
    if (captcha && !captcha.hidden && !captcha.classList.contains('hide'))
      return {
        state: 'error',
        message: 'Hypeddit requires a CAPTCHA before it can accept this email step.',
      };
  }
  return null;
}
