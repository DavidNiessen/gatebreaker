export interface GateSummary {
  readonly provider: string;
  readonly id: string;
  readonly title: string;
  readonly steps: readonly string[];
}

export interface Gate extends GateSummary {
  readonly metadata: Readonly<Record<string, string>>;
}

export interface GateAction {
  readonly id: string;
  readonly kind: 'sign-in' | 'email';
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
}

export interface GatePresentation {
  readonly anchor: Element;
  readonly startControl: string;
  readonly hiddenSelectors: readonly string[];
}

export interface GateActionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly value?: string;
}

export type GateActionMode = 'activate' | 'reveal';

export interface GateActionProgress {
  readonly state: 'waiting' | 'complete' | 'error';
  readonly message: string;
}

export type FailureCode =
  | 'not-supported'
  | 'server-required'
  | 'session-expired'
  | 'rate-limited'
  | 'network-error'
  | 'invalid-response'
  | 'unsafe-destination';

export type Resolution =
  | {
      readonly ok: true;
      readonly url: string;
      readonly method:
        'public-file' | 'skip-request' | 'website-session' | 'embedded-link' | 'provider-request';
    }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string };

export interface ResolutionProgress {
  readonly message: string;
  readonly remainingSeconds?: number;
}

export interface ProviderContext {
  readonly pageUrl: URL;
  readonly fetch: typeof fetch;
  readonly probePublicFile: (gateId: string) => Promise<string | null>;
  readonly signal?: AbortSignal;
  readonly intent?: 'direct' | 'website-session';
  readonly onProgress?: (progress: ResolutionProgress) => void;
}

export interface GateProvider {
  readonly id: string;
  readonly name: string;
  matches(url: URL): boolean;
  inspect(document: Document, url: URL): Gate | null;
  resolve(gate: Gate, context: ProviderContext): Promise<Resolution>;
  actions?(document: Document, url: URL): readonly GateAction[];
  performAction?(id: string, document: Document, url: URL, mode: GateActionMode): GateActionResult;
  actionProgress?(id: string, document: Document, url: URL): GateActionProgress | null;
  presentation?(document: Document, url: URL): GatePresentation | null;
}

export function fail(code: FailureCode, message: string): Resolution {
  return { ok: false, code, message };
}
