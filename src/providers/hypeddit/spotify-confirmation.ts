import type { HypedditState } from './session';
/** Retain native return only in this document; final server approval decides reuse. */
export function confirmSpotifyReturn(current: HypedditState): void {
  if (current.spotifyReturnSeen)
    current.progress.set('sign-in-spotify', {
      state: 'complete',
      message: 'Hypeddit’s server confirmed the download is ready.',
      reusable: true,
    });
}
