import { sub2unlock as coreProvider } from '../../core/providers/sub2unlock';
import type { GateProvider } from '../domain/provider';
export * from '../../core/providers/sub2unlock';

export const sub2unlock: GateProvider = {
  ...coreProvider,
  presentation(document, url) {
    if (!sub2unlock.inspect(document, url)) return null;
    const anchor =
      document.querySelector('#__next .section-padding-equal h3, #__next h3, h1') ??
      document.body.firstElementChild;
    return anchor
      ? {
          anchor,
        }
      : null;
  },
};
