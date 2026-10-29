/** A host-owned, real repost. Account credentials remain in the host's SoundCloud session. */
export interface SoundcloudRepostRequest {
  readonly provider: 'droploud';
  readonly gateId: string;
  readonly url: string;
}

export interface SoundcloudRepostResult {
  readonly state:
    | 'complete'
    | 'login-required'
    | 'challenge-required'
    | 'rate-limited'
    | 'failed'
    | 'cancelled'
    | 'loading';
}
