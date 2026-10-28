import { hypedditState as state } from './session';
import { optionalHypedditStep as optional } from './steps';
// Public native handlers retained on 2026-10-28; these are authorization
// addresses and popup names, never extension-owned OAuth clients or credentials.
const authorization = {
  spotify: {
    origin: 'https://accounts.spotify.com',
    path: '/authorize',
    popup: 'sp_popup',
    callback: '/spotify_callback',
    parameters: ['client_id', 'redirect_uri', 'response_type', 'scope', 'state'],
  },
  mixcloud: {
    origin: 'https://mixcloud.com',
    path: '/oauth/authorize',
    popup: 'mc_popup',
    callback: '/gate/mixcloudlogin',
    parameters: ['client_id', 'redirect_uri', 'state'],
  },
  deezer: {
    origin: 'https://connect.deezer.com',
    path: '/oauth/auth.php',
    popup: 'dz_popup',
    callback: '/deezer_callback',
    parameters: ['app_id', 'redirect_uri', 'perms', 'state'],
  },
} as const;

export const services = [
  {
    id: 'spotify',
    label: 'Spotify',
    selector: '#login_to_sp, #login_sp',
    step: 'sp',
    earlyDiscovery: true,
    auth: authorization.spotify,
  },
  // The native SoundCloud URL contract remains unproven; keep its existing fallback.
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    selector: '#login_to_sc, #login_sc',
    step: 'sc',
    earlyDiscovery: true,
    auth: null,
  },
  {
    id: 'mixcloud',
    label: 'Mixcloud',
    selector: '#login_to_mc',
    step: 'mc',
    earlyDiscovery: false,
    auth: authorization.mixcloud,
  },
  {
    id: 'deezer',
    label: 'Deezer',
    selector: '#login_to_dz',
    step: 'dz',
    earlyDiscovery: false,
    auth: authorization.deezer,
  },
] as const;

export function control(document: Document, selector: string): HTMLElement | null {
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

/** A declared mandatory sign-in must precede the first final download request. */
export function requiresHypedditSignIn(document: Document): boolean {
  return services.some(
    (service) =>
      service.earlyDiscovery &&
      control(document, service.selector) &&
      !optional(document, service.step) &&
      state(document).progress.get('sign-in-' + service.id)?.state !== 'complete',
  );
}
