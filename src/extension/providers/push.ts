import { push as coreProvider, nativeHeading } from '../../core/providers/push';
import type { GateProvider } from '../domain/provider';
import { performPushAction, pushActionProgress, pushActions } from './push-session';
export * from '../../core/providers/push';

export const push: GateProvider = {
  ...coreProvider,
  actions(document, url) {
    return this.inspect(document, url) ? pushActions(document) : [];
  },
  performAction(id, document, url, mode) {
    return this.inspect(document, url)
      ? performPushAction(id, document, mode)
      : { ok: false, message: 'Open a supported PUSH.fm gate first.' };
  },
  actionProgress(id, document, url) {
    return this.inspect(document, url) ? pushActionProgress(id, document) : null;
  },
  presentation(document, url) {
    const heading = nativeHeading(document);
    if (!heading?.parentElement || !this.inspect(document, url)) return null;
    return {
      anchor: heading.parentElement,
    };
  },
};
