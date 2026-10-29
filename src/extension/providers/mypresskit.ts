import type { Session } from '../../core/providers/mypresskit';
import {
  mypresskit as coreProvider,
  documents,
  inspect,
  verify,
} from '../../core/providers/mypresskit';
import type { GateProvider } from '../domain/provider';
export * from '../../core/providers/mypresskit';

function cancel(current: Session): void {
  current.authController?.abort();
  delete current.authController;
  const popup = current.popup;
  delete current.popup;
  try {
    popup?.close();
  } catch {
    /* Only this adapter's owned window is closed. */
  }
}
function poll(current: Session, url: URL): void {
  current.authController?.abort();
  const controller = new AbortController();
  current.authController = controller;
  const pending = current.pending!;
  const active = () =>
    !controller.signal.aborted &&
    documents.get(current.document) === current &&
    current.pending === pending;
  void (async () => {
    const deadline = Date.now() + 120000;
    while (active() && Date.now() < deadline) {
      try {
        const status = await verify(current, {
          pageUrl: url,
          fetch: current.document.defaultView!.fetch.bind(current.document.defaultView),
          signal: controller.signal,
        });
        if (!active()) return;
        if (status.unlocked || pending.indexes.every((index) => status.completed.includes(index))) {
          current.progress = {
            state: 'complete',
            message: 'MyPressKit confirmed the account step. Its server will verify the download.',
          };
          const popup = current.popup;
          delete current.popup;
          try {
            popup?.close();
          } catch {
            /* The native window may already have closed. */
          }
          return;
        }
      } catch {
        if (!active()) return;
      }
      await new Promise<void>((resolve) => {
        const stop = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          controller.signal.removeEventListener('abort', stop);
          resolve();
        }, 1000);
        controller.signal.addEventListener('abort', stop, { once: true });
      });
    }
    if (active())
      current.progress = {
        state: 'error',
        message: 'MyPressKit has not confirmed this sign-in. Finish its window, then try again.',
      };
  })();
}
export const mypresskit: GateProvider = {
  ...coreProvider,
  actions(document, url) {
    if (!inspect(document, url)) return [];
    const pending = documents.get(document)?.pending;
    return pending
      ? [
          {
            id: pending.id,
            kind: 'sign-in',
            label: `Sign in with ${pending.service === 'soundcloud' ? 'SoundCloud' : 'Spotify'}`,
            description:
              'Opens MyPressKit’s native authorization. Review requested follows, saves, reposts and any configured public comment.',
            required: true,
          },
        ]
      : [];
  },
  performAction(id, document, url, mode) {
    if (!inspect(document, url))
      return { ok: false, message: 'This MyPressKit gate is unavailable.' };
    const current = documents.get(document)!,
      view = document.defaultView,
      pending = current.pending;
    if (!view || !pending || id !== pending.id || mode !== 'activate')
      return { ok: false, message: 'Use MyPressKit’s sign-in action to connect your account.' };
    if (current.progress?.state === 'complete')
      return { ok: true, message: current.progress.message };
    if (current.popup && !current.popup.closed)
      return { ok: true, message: 'Complete the existing MyPressKit authorization window.' };
    const address = new URL(`/api/download-gates/oauth/${pending.service}/start`, url);
    const parameters = new URLSearchParams({
      gate: current.model.id,
      ...(pending.step === -1 ? { combo: '1' } : { step: String(pending.step) }),
      popup: '1',
    });
    if (pending.comment) parameters.set('comment', pending.comment);
    address.search = parameters.toString();
    const popup = view.open(
      address.href,
      'mpk-gate-oauth',
      'width=520,height=720,scrollbars=yes,resizable=yes',
    );
    if (!popup || popup.closed)
      return { ok: false, message: 'Allow MyPressKit’s authorization window and try again.' };
    current.popup = popup;
    current.progress = {
      state: 'waiting',
      message: 'Complete the required authorization in MyPressKit’s window.',
    };
    poll(current, new URL(url.href));
    return { ok: true, message: current.progress.message };
  },
  actionProgress(id, document, url) {
    if (!inspect(document, url)) return null;
    const current = documents.get(document)!;
    return current.pending?.id === id ? (current.progress ?? null) : null;
  },
  cancelActions(document) {
    const current = documents.get(document);
    if (!current) return;
    cancel(current);
    delete current.pending;
    delete current.progress;
  },
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector('h1');
    return anchor ? { anchor } : null;
  },
};
