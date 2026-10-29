import type { ResolutionProgress } from '../../core/domain/provider';
import type { SoundcloudRepostRequest, SoundcloudRepostResult } from '../../core/domain/soundcloud';
import { extension } from './browser';

const states = new Set<SoundcloudRepostResult['state']>([
  'complete',
  'login-required',
  'challenge-required',
  'rate-limited',
  'failed',
  'cancelled',
  'loading',
]);
const progressText: Readonly<Record<SoundcloudRepostResult['state'], string>> = {
  loading: 'Checking the repost in SoundCloud…',
  'login-required':
    'Sign in to SoundCloud in the opened window. Gatebreaker will continue automatically.',
  'challenge-required':
    'Complete SoundCloud’s verification in the opened window. Gatebreaker will continue automatically.',
  'rate-limited': 'SoundCloud is limiting repost requests. Try again later.',
  failed: 'SoundCloud could not confirm the repost.',
  cancelled: 'The SoundCloud repost was cancelled.',
  complete: 'SoundCloud confirmed the repost.',
};

function result(value: unknown): SoundcloudRepostResult | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1
  )
    return null;
  const state = (value as Record<string, unknown>)['state'];
  return typeof state === 'string' && states.has(state as SoundcloudRepostResult['state'])
    ? { state: state as SoundcloudRepostResult['state'] }
    : null;
}

/** Start an owned background operation; no SoundCloud account data enters the client. */
export function repostSoundcloud(
  request: SoundcloudRepostRequest,
  signal?: AbortSignal,
  onProgress?: (progress: ResolutionProgress) => void,
): Promise<SoundcloudRepostResult> {
  if (signal?.aborted) return Promise.resolve({ state: 'cancelled' });
  const operation = crypto.randomUUID();
  return new Promise((resolve) => {
    let finished = false;
    let pinging = false;
    let previous: SoundcloudRepostResult['state'] | undefined;
    const report = (state: SoundcloudRepostResult['state']) => {
      if (previous === state) return;
      previous = state;
      try {
        onProgress?.({ message: progressText[state] });
      } catch {
        /* A view callback cannot own the operation. */
      }
    };
    const finish = (state: SoundcloudRepostResult['state']) => {
      if (finished) return;
      finished = true;
      clearInterval(heartbeat);
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      report(state);
      resolve({ state });
    };
    const cancel = () => {
      void extension.runtime
        .sendMessage({ type: 'gatebreaker:cancel-soundcloud-repost', operation })
        .catch(() => {});
    };
    const abort = () => {
      cancel();
      finish('cancelled');
    };
    const heartbeat = setInterval(() => {
      if (finished || pinging) return;
      pinging = true;
      void extension.runtime
        .sendMessage({ type: 'gatebreaker:soundcloud-repost-heartbeat', operation })
        .then((value: unknown) => {
          if (finished) return;
          const current = result(value);
          if (!current) {
            cancel();
            finish('failed');
            return;
          }
          report(current.state);
          if (['complete', 'failed', 'cancelled', 'rate-limited'].includes(current.state))
            finish(current.state);
        })
        .catch(() => {
          if (!finished) {
            cancel();
            finish('cancelled');
          }
        })
        .finally(() => {
          pinging = false;
        });
    }, 2000);
    const deadline = setTimeout(() => {
      cancel();
      finish('cancelled');
    }, 120000);
    signal?.addEventListener('abort', abort, { once: true });
    report('loading');
    void extension.runtime
      .sendMessage({
        type: 'gatebreaker:soundcloud-repost',
        operation,
        provider: request.provider,
        gateId: request.gateId,
        url: request.url,
      })
      .then((value: unknown) => {
        if (finished) return;
        const completed = result(value);
        if (!completed || completed.state === 'loading') {
          cancel();
          finish('failed');
        } else finish(completed.state);
      })
      .catch(() => {
        if (!finished) {
          cancel();
          finish('failed');
        }
      });
  });
}
