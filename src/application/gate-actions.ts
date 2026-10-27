import type {
  GateAction,
  GateChallenge,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
  GatePresentation,
  GateProvider,
} from '../domain/provider';

export function pendingRequiredSignIns(
  actions: readonly GateAction[] = [],
  states: Readonly<Record<string, GateActionProgress>> = {},
): readonly GateAction[] {
  return actions.filter(
    (action) =>
      action.kind === 'sign-in' && action.required && states[action.id]?.state !== 'complete',
  );
}

export function pendingRequiredInteractions(
  actions: readonly GateAction[] = [],
  states: Readonly<Record<string, GateActionProgress>> = {},
): readonly GateAction[] {
  return actions.filter(
    (action) =>
      action.required &&
      (action.kind === 'sign-in' || action.kind === 'captcha') &&
      states[action.id]?.state !== 'complete',
  );
}

/** Observe native completion without retrying submissions or treating a click as success. */
export function waitForNativeAction(
  read: () => GateActionProgress | null,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<GateActionProgress> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearInterval(ticker);
      clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
    };
    const finish = (value: GateActionProgress) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const observe = () => {
      try {
        const value = read();
        if (value && value.state !== 'waiting') finish(value);
      } catch {
        finish({ state: 'error', message: 'The website could not confirm this step. Try again.' });
      }
    };
    const ticker = setInterval(observe, 100);
    const deadline = setTimeout(
      () =>
        finish({
          state: 'error',
          message: 'The website has not confirmed this step. You can try again.',
        }),
      timeoutMs,
    );
    signal.addEventListener('abort', abort, { once: true });
    observe();
  });
}

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
        message: 'The website could not open this step. Reload the starting page and try again.',
      };
    }
  }

  cancel(document: Document, url: URL): void {
    try {
      this.provider(document, url)?.cancelActions?.(document, url);
    } catch {
      /* Cancelling a provider must not prevent controller cancellation. */
    }
  }

  challenge(document: Document, url: URL): GateChallenge | null {
    return this.provider(document, url)?.challenge?.(document, url) ?? null;
  }
  completeChallenge(nonce: unknown, document: Document, url: URL): void {
    const current = this.challenge(document, url);
    if (typeof nonce !== 'string' || nonce !== current?.nonce) return;
    this.provider(document, url)?.completeChallenge?.(nonce, document, url);
  }
  progress(id: string, document: Document, url: URL): GateActionProgress | null {
    return this.provider(document, url)?.actionProgress?.(id, document, url) ?? null;
  }

  presentation(document: Document, url: URL): GatePresentation | null {
    return this.provider(document, url)?.presentation?.(document, url) ?? null;
  }
}
