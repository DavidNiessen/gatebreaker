import { valorizd as coreProvider, nativeHeading } from '../../core/providers/valorizd';
import type { GateProvider } from '../domain/provider';
export * from '../../core/providers/valorizd';

export const valorizd: GateProvider = {
  ...coreProvider,
  presentation(document, url) {
    if (!this.inspect(document, url)) return null;
    const heading = nativeHeading(document);
    const anchor = heading?.closest('div.flex.items-start.gap-4');
    const content = heading?.closest('div.relative.px-5.pb-5.pt-5');
    if (!heading || !anchor || !content) return null;
    return {
      anchor,
    };
  },
};
