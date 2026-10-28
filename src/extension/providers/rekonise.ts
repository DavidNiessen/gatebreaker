import { rekonise as coreProvider, nativeHeading } from '../../core/providers/rekonise';
import type { GateProvider } from '../domain/provider';
export * from '../../core/providers/rekonise';

export const rekonise: GateProvider = {
  ...coreProvider,
  presentation(document, url) {
    if (!this.inspect(document, url)) return null;
    const heading = nativeHeading(document);
    if (!heading) return null;
    return {
      anchor: heading.closest('.title-row') ?? heading,
    };
  },
};
