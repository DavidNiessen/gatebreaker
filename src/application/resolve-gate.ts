import type { Gate, GateProvider, ProviderContext, Resolution } from '../domain/provider';
import { fail } from '../domain/provider';
import { safeHttpsUrl } from '../domain/urls';

export class GateResolver {
  private pending: Promise<Resolution> | undefined;

  constructor(private readonly providers: readonly GateProvider[]) {}

  inspect(document: Document, url: URL): { provider: GateProvider; gate: Gate } | null {
    for (const provider of this.providers) {
      if (!provider.matches(url)) continue;
      const gate = provider.inspect(document, url);
      if (gate) return { provider, gate };
    }
    return null;
  }

  resolve(document: Document, context: ProviderContext): Promise<Resolution> {
    if (this.pending) return this.pending;
    this.pending = this.perform(document, context).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async perform(document: Document, context: ProviderContext): Promise<Resolution> {
    try {
      const match = this.inspect(document, context.pageUrl);
      if (!match)
        return fail('not-supported', 'Open a supported Hypeddit download gate, then try again.');
      const result = await match.provider.resolve(match.gate, context);
      if (result.ok) {
        const url = safeHttpsUrl(result.url);
        return url
          ? { ...result, url }
          : fail(
              'unsafe-destination',
              'The provider returned an unrecognized download address. No link was opened.',
            );
      }
      return result;
    } catch {
      return fail(
        'network-error',
        'The request could not finish. Check your connection, reload the gate, and try again.',
      );
    }
  }
}
