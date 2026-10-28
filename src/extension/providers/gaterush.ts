import type { Session } from '../../core/providers/gaterush';
import {
  gaterush as coreProvider,
  documents,
  origin,
  record,
  requiresComment,
  session,
  unsupported,
} from '../../core/providers/gaterush';
import type { GateAction, GateActionProgress, GateProvider } from '../domain/provider';
export * from '../../core/providers/gaterush';
function listen(current: Session, view: Window): void {
  if (current.listening) return;
  current.listening = true;
  view.addEventListener(
    'message',
    (event: MessageEvent<unknown>) => {
      // A matching callback is provisional; only the final authenticated HTTP HEAD
      // can authorize delivery. No OAuth credentials or native storage are read.
      if (
        documents.get(current.document) !== current ||
        !current.popup ||
        event.source !== current.popup ||
        event.origin !== origin ||
        !record(event.data) ||
        (event.data['slug'] !== undefined && event.data['slug'] !== current.model.slug)
      )
        return;
      if (event.data['type'] === 'sc-auth') {
        current.oauthConfirmed = true;
        delete current.popup;
      } else if (event.data['type'] === 'sc-auth-error') {
        current.oauthError = true;
        delete current.popup;
      }
    },
    { once: false },
  );
}
export const gaterush: GateProvider = {
  ...coreProvider,
  cancelActions(document) {
    const current = documents.get(document);
    if (!current) return;
    const popup = current.popup;
    delete current.popup;
    delete current.savedComment;
    delete current.authRequired;
    delete current.oauthConfirmed;
    delete current.oauthError;
    try {
      popup?.close();
    } catch {
      // A navigated or already-closed owned window must not prevent cancellation.
    }
  },
  actions(document, url) {
    const current = session(document, url);
    if (
      !current ||
      unsupported(current) ||
      (requiresComment(current) && !current.savedComment) ||
      !current.authRequired
    )
      return [];
    const soundcloud = current.model.steps.find((step) => step.id === 'soundcloud');
    const actions: GateAction[] =
      soundcloud && !soundcloud.allowSkip
        ? [
            {
              id: 'gaterush-soundcloud',
              kind: 'sign-in',
              label: 'Sign in with SoundCloud',
              description:
                'Opens GateRush’s SoundCloud consent. Review the actions and permissions it requests.',
              required: true,
            },
          ]
        : [];
    return actions;
  },
  performAction(id, document, url, mode) {
    const current = session(document, url);
    const view = document.defaultView;
    if (!current || !view || !this.actions?.(document, url).some((action) => action.id === id))
      return { ok: false, message: 'This GateRush connection is unavailable.' };
    if (mode !== 'activate')
      return {
        ok: false,
        message: 'Use Sign in with SoundCloud to open GateRush’s consent window.',
      };
    if (current.oauthConfirmed)
      return { ok: true, message: 'GateRush confirmed the SoundCloud connection.' };
    delete current.oauthError;
    // Native /auth/soundcloud immediately redirects to SoundCloud authorization,
    // even on email-first gates. The site's cookie/PKCE state remains its own.
    const popup = view.open(
      `${origin}/auth/soundcloud?slug=${current.model.slug}`,
      `gatebreaker-gaterush-${current.model.slug}`,
      'popup,width=500,height=650',
    );
    if (!popup || popup.closed)
      return { ok: false, message: 'Allow popups for GateRush and try signing in again.' };
    current.popup = popup;
    listen(current, view);
    return { ok: true, message: 'Complete GateRush’s SoundCloud consent, then return here.' };
  },
  actionProgress(id, document, url): GateActionProgress | null {
    const current = session(document, url);
    if (!current || id !== 'gaterush-soundcloud' || !this.actions?.(document, url).length)
      return null;
    if (current.oauthError)
      return {
        state: 'error',
        message: 'GateRush could not confirm SoundCloud. Try signing in again.',
      };
    return current.oauthConfirmed
      ? {
          state: 'complete',
          message: 'GateRush confirmed SoundCloud; its server will verify the download.',
        }
      : { state: 'waiting', message: 'Complete GateRush’s SoundCloud consent window.' };
  },
  presentation(document, url) {
    const current = session(document, url);
    const heading = document.querySelector('h1.track');
    if (!current || !heading || unsupported(current)) return null;
    return {
      anchor: heading,
    };
  },
};
