import type { GatePreferences } from '../../core/domain/preferences';
import { soundcloudComment } from '../../core/domain/preferences';
import type { Session } from '../../core/providers/droploud';
import {
  apiOrigin,
  droploud as coreProvider,
  sessionId as coreSessionId,
  documents,
  gateId,
  gates,
  inspect,
  object,
  post,
  statusValue,
} from '../../core/providers/droploud';
import type { AuthorizationOpener, GateProvider } from '../domain/provider';
import { readNativeSession } from '../platform/native-session';
export * from '../../core/providers/droploud';
function sessionId(session: Session) {
  return coreSessionId(session, {
    readNativeSession: (provider, id) => readNativeSession(session.document, provider, id),
  });
}
/** Poll only the native status endpoint after the explicit provider OAuth window opens. */
function poll(session: Session): void {
  const view = session.document.defaultView;
  if (session.polling || !view || typeof view.fetch !== 'function') return;
  session.polling = true;
  let attempts = 0;
  const deadline = Date.now() + 90000;
  const controller = new AbortController();
  session.pollController?.abort();
  session.pollController = controller;
  const expectedSid = sessionId(session);
  const check = async () => {
    if (controller.signal.aborted || session.pollController !== controller) return;
    if (documents.get(session.document) !== session || attempts++ >= 60 || Date.now() >= deadline) {
      session.polling = false;
      return;
    }
    try {
      const sid = sessionId(session);
      if (!sid || sid !== expectedSid || controller.signal.aborted) {
        session.polling = false;
        return;
      }
      const status = await post(
        session.id,
        'status',
        { track_id: session.id, session_id: sid },
        {
          pageUrl: new URL(`https://droploud.com/track/${session.id}`),
          fetch: view.fetch.bind(view),
          probePublicFile: async () => null,
          signal: controller.signal,
        },
      );
      if (
        controller.signal.aborted ||
        session.pollController !== controller ||
        sessionId(session) !== expectedSid
      )
        return;
      const social = status.response.ok ? statusValue(status.value) : null;
      if (social) {
        session.social = social;
        session.connected = social.connected;
        if (!social.connected) {
          session.socialController?.abort();
          delete session.socialAction;
        }
      } else if ([401, 403, 429].includes(status.response.status)) {
        session.polling = false;
        return;
      }
    } catch {
      /* A transient error is retried within the bounded native window. */
    }
    if (controller.signal.aborted || session.pollController !== controller) return;
    if (session.connected) {
      session.polling = false;
      return;
    }
    view.setTimeout(() => {
      void check();
    }, 1500);
  };
  void check();
}

/** The user performs the actual public action; Droploud alone verifies its result. */
function watchSocialAction(session: Session, view: Window): void {
  session.socialController?.abort();
  const controller = new AbortController();
  session.socialController = controller;
  const expectedSid = sessionId(session);
  let checking = false,
    lastCheck = 0;
  const check = async () => {
    if (controller.signal.aborted || checking || Date.now() - lastCheck < 3500) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const sid = sessionId(session);
      if (!sid || sid !== expectedSid || controller.signal.aborted) return;
      const result = await post(
        session.id,
        'verify',
        { track_id: session.id, session_id: sid, fresh: false },
        {
          pageUrl: new URL(`https://droploud.com/track/${session.id}`),
          fetch: view.fetch.bind(view),
          signal: controller.signal,
          probePublicFile: async () => null,
        },
      );
      if (
        controller.signal.aborted ||
        session.socialController !== controller ||
        sessionId(session) !== expectedSid
      )
        return;
      if (
        result.response.ok &&
        object(result.value) &&
        result.value['found'] === true &&
        !(session.social?.like_mode === 'manual' && result.value['like'] === 'missing')
      ) {
        session.socialAction = {
          state: 'complete',
          message: 'Droploud verified the SoundCloud actions.',
        };
        controller.abort();
      } else
        session.socialAction = {
          state: 'error',
          retryLabel: 'Check SoundCloud actions again',
          message:
            result.response.status === 429
              ? 'Droploud is limiting verification. Wait before checking again.'
              : 'Droploud has not verified the required repost or like yet. Complete it in SoundCloud, then check again.',
        };
    } catch {
      if (!controller.signal.aborted)
        session.socialAction = {
          state: 'error',
          retryLabel: 'Check SoundCloud actions again',
          message: 'The SoundCloud action could not be verified. Try again.',
        };
    } finally {
      checking = false;
    }
  };
  view.addEventListener(
    'focus',
    () => {
      void check();
    },
    { signal: controller.signal },
  );
  const ticker = view.setInterval(() => {
    if (session.socialPopup?.closed) {
      view.clearInterval(ticker);
      void check();
    }
  }, 500);
  const timeout = view.setTimeout(() => {
    session.socialAction = {
      state: 'error',
      retryLabel: 'Check SoundCloud actions again',
      message: 'Verification timed out. Complete the action in SoundCloud, then check again.',
    };
    controller.abort();
  }, 90000);
  controller.signal.addEventListener(
    'abort',
    () => {
      view.clearInterval(ticker);
      view.clearTimeout(timeout);
    },
    { once: true },
  );
  if (session.socialAction?.state === 'error') {
    session.socialAction = {
      state: 'waiting',
      message: 'Checking Droploud’s SoundCloud verification…',
    };
    void check();
  }
}
export const droploud: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    const current = gates.get(gate);
    return coreProvider.resolve(gate, {
      ...context,
      readNativeSession:
        context.readNativeSession ??
        ((provider, id) => (current ? readNativeSession(current.document, provider, id) : null)),
    });
  },
  actions(document, url) {
    const gate = inspect(document, url);
    const current = gate && gates.get(gate);
    if (current?.socialAction && current.model.soundcloudUrl)
      return [
        {
          id: 'droploud-social',
          kind: 'social',
          label: 'Complete SoundCloud actions',
          description:
            'Opens this track in SoundCloud. Complete the required repost or like; Droploud verifies it when you return.',
          required: true,
        },
      ];
    return gate &&
      gates.get(gate)?.connected === false &&
      gate.steps.some((type) => type.startsWith('soundcloud_')) &&
      (!gate.steps.includes('soundcloud_comment') || !!gates.get(gate)?.preparedComment)
      ? [
          {
            id: 'droploud-soundcloud',
            kind: 'sign-in',
            label: 'Connect SoundCloud',
            description:
              'Uses Droploud’s SoundCloud window. Review the actions and permissions in its native controls.',
            required: true,
          },
        ]
      : [];
  },
  performAction(
    id,
    document,
    url,
    mode,
    _opener?: AuthorizationOpener,
    preferences?: GatePreferences,
  ) {
    const gate = inspect(document, url),
      view = document.defaultView;
    const social = gate && gates.get(gate);
    if (
      id === 'droploud-social' &&
      social?.socialAction &&
      social.model.soundcloudUrl &&
      view &&
      mode === 'activate'
    ) {
      if (!social.socialPopup || social.socialPopup.closed) {
        const popup = view.open(
          social.model.soundcloudUrl,
          `gatebreaker-droploud-social-${gate!.id}`,
          'width=1000,height=800,scrollbars=yes,resizable=yes',
        );
        if (!popup) return { ok: false, message: 'Allow the SoundCloud window, then try again.' };
        social.socialPopup = popup;
      }
      watchSocialAction(social, view);
      return {
        ok: true,
        message: 'Complete the SoundCloud action, then return here for verification.',
      };
    }
    if (
      id !== 'droploud-soundcloud' ||
      !gate ||
      !view ||
      !this.actions?.(document, url).some((action) => action.id === id)
    )
      return {
        ok: false,
        message: 'This Droploud flow cannot open a supported sign-in action.',
      };
    const session = gates.get(gate)!;
    const currentSid = sessionId(session);
    if (
      gate.steps.includes('soundcloud_comment') &&
      soundcloudComment(preferences?.soundcloudComment) !== session.preparedComment
    )
      return {
        ok: false,
        message: 'Save your current SoundCloud comment and choose Download before signing in.',
      };
    try {
      const sid = currentSid;
      if (!sid)
        return {
          ok: false,
          message: 'Reload Droploud to refresh its native session.',
        };
      if (mode !== 'activate')
        return {
          ok: true,
          message: 'Review Droploud’s requested SoundCloud actions before signing in.',
        };
      const connect = new URL(`${apiOrigin}/api/soundcloud/connect`);
      connect.search = new URLSearchParams({
        track_id: gate.id,
        session_id: sid,
        disclose_droploud: session.model.advertise ? '1' : '0',
      }).toString();
      const popup = view.open(
        connect.href,
        'sc_connect',
        'width=600,height=700,scrollbars=yes,resizable=yes',
      );
      if (!popup)
        return {
          ok: false,
          message: 'Allow Droploud’s SoundCloud sign-in window, then try again.',
        };
      session.popup = popup;
      poll(session);
      return {
        ok: true,
        message: 'Review and finish Droploud’s SoundCloud authorization window.',
      };
    } catch {
      return {
        ok: false,
        message: 'Droploud’s native session could not be opened. Reload this page.',
      };
    }
  },
  cancelActions(document, url) {
    if (!gateId(url)) return;
    const current = documents.get(document);
    if (!current) return;
    current.pollController?.abort();
    current.socialController?.abort();
    const popup = current.popup;
    const socialPopup = current.socialPopup;
    delete current.popup;
    delete current.socialPopup;
    delete current.preparedComment;
    delete current.connected;
    delete current.social;
    delete current.socialAction;
    current.polling = false;
    try {
      popup?.close();
    } catch {
      /* Cancellation must still discard prepared state. */
    }
    try {
      socialPopup?.close();
    } catch {
      /* The owned track window may already be gone. */
    }
  },
  actionProgress(id, document, url) {
    const gate = inspect(document, url);
    if (id === 'droploud-social' && gate) return gates.get(gate)?.socialAction ?? null;
    if (id !== 'droploud-soundcloud' || !gate) return null;
    return gates.get(gate)?.connected
      ? {
          state: 'complete',
          message: 'Droploud’s server confirmed SoundCloud authorization.',
        }
      : {
          state: 'waiting',
          message: 'Complete Droploud’s SoundCloud authorization window.',
        };
  },
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector('.dtr-caption-title');
    return anchor ? { anchor } : null;
  },
};
