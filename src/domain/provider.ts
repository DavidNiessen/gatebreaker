export interface GateSummary {
  readonly provider: string;
  readonly id: string;
  readonly title: string;
  readonly steps: readonly string[];
}

export interface Gate extends GateSummary {
  readonly metadata: Readonly<Record<string, string>>;
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
  | { readonly ok: true; readonly url: string; readonly method: 'public-file' | 'skip-request' }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string };

export interface ProviderContext {
  readonly pageUrl: URL;
  readonly fetch: typeof fetch;
  readonly probePublicFile: (gateId: string) => Promise<string | null>;
}

export interface GateProvider {
  readonly id: string;
  readonly name: string;
  matches(url: URL): boolean;
  inspect(document: Document, url: URL): Gate | null;
  resolve(gate: Gate, context: ProviderContext): Promise<Resolution>;
}

export function fail(code: FailureCode, message: string): Resolution {
  return { ok: false, code, message };
}
