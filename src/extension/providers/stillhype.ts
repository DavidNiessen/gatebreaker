import {
  stillhype as coreProvider,
  gates,
  inspect,
  session,
  authorizationUrl,
  verifySoundcloud,
} from '../../core/providers/stillhype';
import { readNativeSession } from '../platform/native-session';
import type { GateProvider, GateActionProgress } from '../domain/provider';

const attempts = new WeakMap<
  Document,
  { id: string; popup: Window; controller: AbortController; progress: GateActionProgress }
>();
export const stillhype: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    const current = gates.get(gate);
    return coreProvider.resolve(gate, {
      ...context,
      readNativeSession:
        context.readNativeSession ??
        ((provider, id) =>
          current && provider === 'stillhype' && id === current.id
            ? readNativeSession(current.document, provider, id)
            : null),
    });
  },
  actions(document, url) {
    const current = session(document, url);
    const step = current?.authStep;
    return step && !current.completed.has(step.id)
      ? [
          {
            id: `stillhype-soundcloud-${step.id}`,
            kind: 'sign-in',
            label: 'Sign in with SoundCloud',
            description:
              'Opens StillHype consent. Review its requested public follows, likes, reposts and comments.',
            required: true,
          },
        ]
      : [];
  },
  performAction(id, document, url, mode) {
    const current = session(document, url),
      view = document.defaultView;
    if (
      !current ||
      !view ||
      mode !== 'activate' ||
      !this.actions?.(document, url).some((action) => action.id === id)
    )
      return { ok: false, message: 'This StillHype sign-in is unavailable.' };
    const address = authorizationUrl(current, url),
      step = current.authStep;
    if (!address || !step) return { ok: false, message: 'Reload StillHype before signing in.' };
    const previous = attempts.get(document);
    if (previous?.progress.state === 'waiting' && !previous.popup.closed)
      return { ok: true, message: 'Finish the existing StillHype consent window.' };
    previous?.controller.abort();
    const popup = view.open(
      address,
      `gatebreaker-stillhype-${current.id}`,
      'popup,width=550,height=700',
    );
    if (!popup) return { ok: false, message: 'Allow the StillHype sign-in popup, then retry.' };
    const controller = new AbortController();
    const attempt = {
      id,
      popup,
      controller,
      progress: {
        state: 'waiting' as const,
        message: 'Finish StillHype SoundCloud consent. Its server will verify completion.',
      } as GateActionProgress,
    };
    attempts.set(document, attempt);
    void (async () => {
      const until = Date.now() + 115000;
      while (!controller.signal.aborted && Date.now() < until) {
        await new Promise<void>((resolve) => {
          const stop = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener('abort', stop);
            resolve();
          }, 2000);
          controller.signal.addEventListener('abort', stop, { once: true });
        });
        if (
          controller.signal.aborted ||
          session(document, url) !== current ||
          attempts.get(document) !== attempt
        )
          return;
        try {
          if (
            await verifySoundcloud(current, step, {
              pageUrl: url,
              fetch: view.fetch?.bind(view) ?? globalThis.fetch,
              probePublicFile: async () => null,
              signal: controller.signal,
            })
          ) {
            attempt.progress = {
              state: 'complete',
              message:
                'StillHype verified this SoundCloud step. The final server check is still required.',
            };
            return;
          }
        } catch {
          if (!controller.signal.aborted) {
            attempt.progress = {
              state: 'error',
              message:
                'StillHype could not verify the sign-in. Retry when its service is available.',
            };
            return;
          }
        }
      }
      if (!controller.signal.aborted)
        attempt.progress = {
          state: 'error',
          message: 'StillHype has not confirmed this step. Finish consent, then retry.',
        };
    })();
    return { ok: true, message: 'Complete StillHype SoundCloud consent in its window.' };
  },
  actionProgress(id, document, url) {
    if (!session(document, url)) return null;
    const attempt = attempts.get(document);
    return attempt?.id === id ? attempt.progress : null;
  },
  cancelActions(document) {
    const attempt = attempts.get(document);
    attempt?.controller.abort();
    try {
      attempt?.popup.close();
    } catch {
      /* Already closed. */
    }
    attempts.delete(document);
  },
  presentation(document, url) {
    const gate = inspect(document, url),
      anchor = document.querySelector('h1');
    return gate && anchor ? { anchor } : null;
  },
};
