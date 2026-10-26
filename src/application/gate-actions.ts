import type {
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
  GateProvider,
} from '../domain/provider';

export class GateActions {
  constructor(private readonly providers: readonly GateProvider[]) {}

  private provider(document: Document, url: URL): GateProvider | undefined {
    return this.providers.find(
      (provider) => provider.matches(url) && provider.inspect(document, url),
    );
  }

  list(document: Document, url: URL): readonly GateAction[] {
    return this.provider(document, url)?.actions?.(document, url) ?? [];
  }

  perform(id: unknown, document: Document, url: URL, mode: GateActionMode): GateActionResult {
    try {
      if (typeof id !== 'string' || !this.list(document, url).some((action) => action.id === id))
        return {
          ok: false,
          message: 'This gate action is unavailable. Reload the page and try again.',
        };
      return (
        this.provider(document, url)?.performAction?.(id, document, url, mode) ?? {
          ok: false,
          message: 'This provider does not support that action.',
        }
      );
    } catch {
      return {
        ok: false,
        message: 'Hypeddit could not open this step. Reload the starting page and try again.',
      };
    }
  }

  progress(id: string, document: Document, url: URL): GateActionProgress | null {
    return this.provider(document, url)?.actionProgress?.(id, document, url) ?? null;
  }
}
