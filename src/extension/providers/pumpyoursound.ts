import type { GateActionProgress, GateProvider } from '../domain/provider';
import { soundcloudComment } from '../../core/domain/preferences';
import {
  pumpyoursound as coreProvider,
  documents,
  inspect,
  pendingPumpSteps,
  pumpId,
  pumpSteps,
  readPumpPage,
} from '../../core/providers/pumpyoursound';
import { extension } from '../platform/browser';
import { pumpNativeCancel, pumpNativeStart } from './pumpyoursound/protocol';

interface Action {
  readonly id: string;
  readonly operation: string;
  readonly popup: Window;
  readonly controller: AbortController;
  readonly startedAt: number;
  state: GateActionProgress;
  probing?: boolean;
  lastProbe?: number;
  closedAt?: number;
}
const actions = new WeakMap<Document, Action>();
function nativeKinds(document: Document): readonly string[] {
  const current = documents.get(document);
  if (!current?.authRequired) return [];
  return pendingPumpSteps(current)
    .map((step) => step.kind)
    .filter((kind) => ['soundcloud', 'comment', 'spotify'].includes(kind));
}
async function confirmed(
  document: Document,
  page: URL,
  kinds: readonly string[],
  signal: AbortSignal,
): Promise<boolean> {
  const current = documents.get(document);
  const view = document.defaultView;
  if (!current || !view) return false;
  const fresh = await readPumpPage(
    {
      pageUrl: page,
      fetch: view.fetch?.bind(view) ?? globalThis.fetch,
      parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
      probePublicFile: async () => null,
      signal,
    },
    page.href,
  );
  if (signal.aborted || !fresh || !inspect(fresh, page)) return false;
  const steps = pumpSteps(fresh);
  if (!kinds.every((kind) => steps.some((step) => step.kind === kind && step.done))) return false;
  kinds.forEach((kind) => current.verified.add(kind));
  return true;
}
export const pumpyoursound: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    return coreProvider.resolve(gate, {
      ...context,
      parseHtml:
        context.parseHtml ?? ((html) => new DOMParser().parseFromString(html, 'text/html')),
    });
  },
  actions(document, url) {
    if (!inspect(document, url)) return [];
    const required = nativeKinds(document);
    return [
      ...(required.some((kind) => kind === 'soundcloud' || kind === 'comment')
        ? [
            {
              id: 'pumpyoursound-soundcloud',
              kind: 'sign-in' as const,
              required: true,
              label: 'Sign in with SoundCloud',
              description:
                'Opens PumpYourSound’s SoundCloud consent. Its app may follow accounts and publish your configured comment.',
            },
          ]
        : []),
      ...(required.includes('spotify')
        ? [
            {
              id: 'pumpyoursound-spotify',
              kind: 'sign-in' as const,
              required: true,
              label: 'Sign in with Spotify',
              description:
                'Opens PumpYourSound’s Spotify consent. Review the requested actions and permissions.',
            },
          ]
        : []),
    ];
  },
  performAction(id, document, url, mode, _opener, preferences) {
    const current = documents.get(document),
      view = document.defaultView;
    if (
      !current ||
      !view ||
      mode !== 'activate' ||
      !this.actions?.(document, url).some((action) => action.id === id)
    )
      return { ok: false, message: 'This PumpYourSound sign-in action is unavailable.' };
    const previous = actions.get(document);
    if (previous?.state.state === 'waiting' && !previous.popup.closed)
      return {
        ok: previous.id === id,
        message: 'Complete the existing PumpYourSound sign-in window first.',
      };
    const isSoundcloud = id === 'pumpyoursound-soundcloud';
    const required = nativeKinds(document).filter((kind) =>
      isSoundcloud ? kind === 'soundcloud' || kind === 'comment' : kind === 'spotify',
    );
    const text = soundcloudComment(preferences?.soundcloudComment);
    if (required.includes('comment') && !text)
      return { ok: false, message: 'Save your SoundCloud comment before signing in.' };
    const operation = crypto.randomUUID();
    const popup = view.open(
      isSoundcloud ? 'about:blank' : `${url.origin}/auth/spotify-follow/?fangateId=${current.id}`,
      `gatebreaker-pys-${operation}`,
      'popup,width=600,height=700',
    );
    if (!popup || popup.closed)
      return { ok: false, message: 'Allow the PumpYourSound sign-in window and try again.' };
    const controller = new AbortController();
    const job: Action = {
      id,
      operation,
      popup,
      controller,
      startedAt: Date.now(),
      state: {
        state: 'waiting',
        message: 'Review and complete PumpYourSound’s authorization window.',
      },
    };
    const stoppedPrevious = previous
      ? extension.runtime
          .sendMessage({ type: pumpNativeCancel, operation: previous.operation })
          .catch(() => {})
      : Promise.resolve();
    previous?.controller.abort();
    actions.set(document, job);
    if (isSoundcloud)
      document
        .querySelector('#frm-freeDownloadForm')
        ?.setAttribute('data-gatebreaker-pys-operation', operation);
    if (isSoundcloud)
      void stoppedPrevious
        .then(() =>
          extension.runtime.sendMessage({
            type: pumpNativeStart,
            operation,
            gate: current.id,
            ...(text ? { comment: text } : {}),
          }),
        )
        .then(async (response: unknown) => {
          if (actions.get(document) !== job || controller.signal.aborted) return;
          if (
            !response ||
            typeof response !== 'object' ||
            !('state' in response) ||
            response.state !== 'complete' ||
            !(await confirmed(document, url, required, controller.signal))
          ) {
            job.state = {
              state: 'error',
              message:
                'PumpYourSound did not confirm the connection. Allow its popup and sign in again, or use its native flow.',
            };
            try {
              popup.close();
            } catch {
              /* Only this owned failed popup is closed. */
            }
            return;
          }
          job.state = {
            state: 'complete',
            message:
              'PumpYourSound confirmed the account step; its server will still verify the download.',
          };
        })
        .catch(() => {
          if (!controller.signal.aborted)
            job.state = {
              state: 'error',
              message: 'PumpYourSound could not finish this sign-in. Try again.',
            };
          try {
            popup.close();
          } catch {
            /* The failed authorization may already be closed. */
          }
        });
    return {
      ok: true,
      message: 'Complete PumpYourSound’s sign-in and review its requested actions.',
    };
  },
  actionProgress(id, document, url) {
    if (id !== 'pumpyoursound-soundcloud' && id !== 'pumpyoursound-spotify') return null;
    const job = actions.get(document);
    if (!job || job.id !== id) return null;
    if (id === 'pumpyoursound-spotify' && job.state.state === 'waiting') {
      if (job.popup.closed) job.closedAt ??= Date.now();
      if (
        Date.now() - job.startedAt >= 120000 ||
        (job.closedAt !== undefined && Date.now() - job.closedAt >= 5000)
      ) {
        job.controller.abort();
        try {
          job.popup.close();
        } catch {
          /* Only this owned expired authorization is closed. */
        }
        job.state = {
          state: 'error',
          message: 'PumpYourSound did not confirm Spotify. Sign in again, or use its native flow.',
        };
      }
    }
    if (
      id === 'pumpyoursound-spotify' &&
      job.state.state === 'waiting' &&
      !job.probing &&
      Date.now() - (job.lastProbe ?? 0) >= 2000
    ) {
      job.probing = true;
      job.lastProbe = Date.now();
      void confirmed(document, url, ['spotify'], job.controller.signal)
        .then((done) => {
          if (done && !job.controller.signal.aborted)
            job.state = {
              state: 'complete',
              message: 'PumpYourSound confirmed Spotify; the download still needs server approval.',
            };
        })
        .catch(() => {})
        .finally(() => {
          job.probing = false;
        });
    }
    return job.state;
  },
  cancelActions(document) {
    const job = actions.get(document);
    if (!job) return;
    job.controller.abort();
    try {
      job.popup.close();
    } catch {
      /* Only this owned popup is closed. */
    }
    void extension.runtime
      .sendMessage({ type: pumpNativeCancel, operation: job.operation })
      .catch(() => {});
    actions.delete(document);
  },
  presentation(document, url) {
    return pumpId(url) && inspect(document, url) && document.querySelector('h1.fangateTitle, h1')
      ? { anchor: document.querySelector('h1.fangateTitle, h1')! }
      : null;
  },
};
