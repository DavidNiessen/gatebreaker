import { bandcamp as coreProvider, inspect } from '../../core/providers/bandcamp';
import type { GateProvider } from '../domain/provider';
import { readBandcampMetadata } from './bandcamp-transport';
export * from '../../core/providers/bandcamp';

export const bandcamp: GateProvider = {
  ...coreProvider,
  resolve(gate, context) {
    return coreProvider.resolve(gate, {
      ...context,
      parseHtml:
        context.parseHtml ?? ((html) => new DOMParser().parseFromString(html, 'text/html')),
      fetch: (async (input, init) => {
        if (input instanceof Request || init?.body || (init?.method && init.method !== 'GET'))
          throw new Error('Unsupported Bandcamp request');
        return readBandcampMetadata(String(input), init?.signal ?? undefined);
      }) as typeof fetch,
    });
  },
  presentation(document, url) {
    if (!inspect(document, url)) return null;
    const anchor = document.querySelector(
      '#name-section h2, #name-section, h2.trackTitle, h1, .download-panel',
    );
    return anchor ? { anchor } : null;
  },
};
