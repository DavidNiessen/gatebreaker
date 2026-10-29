import { GateResolver } from './application/resolve-gate';
import type { GatePreferences } from './domain/preferences';
import type {
  GateProvider,
  GateSummary,
  ProviderContext,
  Resolution,
  ResolutionProgress,
} from './domain/provider';
import { fail } from './domain/provider';
import { safeHttpsUrl } from './domain/urls';

/** Resolution does not depend on extension messaging, presentation or browser actions. */
export type CoreProvider = Pick<GateProvider, 'id' | 'name' | 'matches' | 'inspect' | 'resolve'>;

export interface CoreOptions {
  readonly providers: readonly CoreProvider[];
  readonly fetch: typeof fetch;
  /** Supply an inert DOM parser. The core never executes page scripts. */
  readonly parseHtml: (html: string, url: URL) => Document;
  readonly probePublicFile?: ProviderContext['probePublicFile'];
  /** Read a provider's existing native session identifier; the core writes no storage. */
  readonly readNativeSession?: ProviderContext['readNativeSession'];
  /** Restore only a receipt for this provider, gate and declared action driver. */
  readonly readNativeReceipt?: ProviderContext['readNativeReceipt'];
  readonly repostSoundcloud?: ProviderContext['repostSoundcloud'];
  readonly preferences?: GatePreferences;
}

export type GatePage = { readonly url: string | URL } & (
  | { readonly html: string; readonly document?: never }
  | { readonly document: Document; readonly html?: never }
);

export interface ResolveOptions {
  readonly signal?: AbortSignal;
  /** Explicitly permit supported automatic gate steps for this resolution. */
  readonly automate?: boolean;
  readonly intent?: ProviderContext['intent'];
  readonly onProgress?: (progress: ResolutionProgress) => void;
  readonly preferences?: GatePreferences;
}

export interface GateSession {
  readonly url: string;
  /** Return a copied summary, never CSRF/session metadata or the underlying DOM. */
  inspect(): GateSummary | null;
  /** Resolve only. The caller owns sign-in, CAPTCHA, file delivery and navigation. */
  resolve(options?: ResolveOptions): Promise<Resolution>;
}

export interface Gatebreaker {
  readonly providers: readonly { readonly id: string; readonly name: string }[];
  supports(url: string | URL): boolean;
  createSession(page: GatePage): GateSession;
}

function pageUrl(input: string | URL): URL {
  const value = typeof input === 'string' ? input : input.href;
  const safe = safeHttpsUrl(value);
  if (!safe) throw new TypeError('Gate pages must use a public HTTPS URL without credentials.');
  return new URL(safe);
}

/**
 * Create a host-neutral resolver. HTML and all I/O capabilities are caller supplied;
 * importing this module never reads a browser global, opens a page or starts a request.
 */
export function createGatebreaker(options: CoreOptions): Gatebreaker {
  const providers = [...options.providers];
  const defaults = options.preferences ? { ...options.preferences } : undefined;
  const supports = (input: string | URL): boolean => {
    try {
      const url = pageUrl(input);
      return providers.some((provider) => provider.matches(new URL(url.href)));
    } catch {
      return false;
    }
  };

  return {
    providers: Object.freeze(
      providers.map((provider) => Object.freeze({ id: provider.id, name: provider.name })),
    ),
    supports,
    createSession(input) {
      const url = pageUrl(input.url);
      const html = input.html;
      let document = input.document;
      if (
        (typeof html === 'string') === (document !== undefined) ||
        (document !== undefined &&
          (document.nodeType !== 9 || typeof document.querySelector !== 'function'))
      )
        throw new TypeError('Supply exactly one inert HTML string or Document.');

      // One resolver belongs to one page. Its in-flight attempt cannot be shared
      // accidentally by two API requests for different gates.
      const resolver = new GateResolver(providers);
      let pending: Promise<Resolution> | undefined;
      const getDocument = (): Document => {
        document ??= options.parseHtml(html!, new URL(url.href));
        return document;
      };
      return {
        url: url.href,
        inspect() {
          if (!supports(url)) return null;
          try {
            const current = resolver.inspect(getDocument(), new URL(url.href))?.gate;
            return current
              ? Object.freeze({
                  provider: current.provider,
                  id: current.id,
                  title: current.title,
                  steps: Object.freeze([...current.steps]),
                  ...(current.inputs
                    ? {
                        inputs: Object.freeze(
                          current.inputs.map((input) =>
                            Object.freeze({ kind: input.kind, required: input.required }),
                          ),
                        ),
                      }
                    : {}),
                })
              : null;
          } catch {
            return null;
          }
        },
        resolve(resolveOptions = {}) {
          if (pending) return pending;
          const run = async (): Promise<Resolution> => {
            resolveOptions.signal?.throwIfAborted();
            if (!supports(url))
              return fail('not-supported', 'This URL is not a supported download gate.');
            let page: Document;
            try {
              page = getDocument();
            } catch {
              return fail('invalid-response', 'The supplied gate page could not be parsed.');
            }
            const preferences = resolveOptions.preferences ?? defaults;
            const context: ProviderContext = {
              pageUrl: new URL(url.href),
              fetch: options.fetch,
              parseHtml: options.parseHtml,
              probePublicFile: options.probePublicFile ?? (async () => null),
              ...(options.readNativeSession
                ? { readNativeSession: options.readNativeSession }
                : {}),
              ...(options.readNativeReceipt
                ? { readNativeReceipt: options.readNativeReceipt }
                : {}),
              ...(options.repostSoundcloud ? { repostSoundcloud: options.repostSoundcloud } : {}),
              ...(preferences ? { preferences: { ...preferences } } : {}),
              ...(resolveOptions.signal ? { signal: resolveOptions.signal } : {}),
              ...(resolveOptions.intent ? { intent: resolveOptions.intent } : {}),
              ...(resolveOptions.automate !== undefined
                ? { automate: resolveOptions.automate }
                : {}),
              ...(resolveOptions.onProgress ? { onProgress: resolveOptions.onProgress } : {}),
            };
            const result = await resolver.resolve(page, context);
            resolveOptions.signal?.throwIfAborted();
            return result;
          };
          pending = run().finally(() => {
            pending = undefined;
          });
          return pending;
        },
      };
    },
  };
}
