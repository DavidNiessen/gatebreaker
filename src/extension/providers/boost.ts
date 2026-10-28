import { boost as coreProvider, inspect } from '../../core/providers/boost';
import type { GateProvider } from '../domain/provider';
export * from '../../core/providers/boost';

export const boost: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    return coreProvider.resolve(gate, {
      ...context,
      parseHtml:
        context.parseHtml ?? ((html) => new DOMParser().parseFromString(html, 'text/html')),
    });
  },
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector('h1');
    return anchor
      ? {
          anchor,
        }
      : null;
  },
};
