import type { GatePreferences } from './preferences';
import type { SoundcloudRepostRequest, SoundcloudRepostResult } from './soundcloud';

export interface GateSummary {
  readonly provider: string;
  readonly id: string;
  readonly title: string;
  readonly steps: readonly string[];
  readonly inputs?: readonly { readonly kind: 'soundcloud-comment'; readonly required: true }[];
}

export interface Gate extends GateSummary {
  readonly metadata: Readonly<Record<string, string>>;
}

export interface GateAction {
  readonly id: string;
  readonly kind: 'sign-in' | 'email' | 'captcha' | 'social';
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
}

export interface GateChallenge {
  readonly id: string;
  readonly gate: string;
  readonly nonce: string;
  readonly url: string;
  readonly surface: 'page' | 'popup';
}

export interface GatePresentation {
  readonly anchor: Element;
}

export interface GateActionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly value?: string;
}

export type GateActionMode = 'activate' | 'reveal' | 'reuse';
export type AuthorizationOpener = (
  address: string,
  signal: AbortSignal,
  signals: { returned(): void; closed(): void },
) => Promise<boolean>;

export interface GateActionProgress {
  readonly state: 'waiting' | 'complete' | 'error';
  readonly retryLabel?: string;
  /** A native handoff and final server approval confirmed this reusable sign-in. */
  readonly reusable?: boolean;
  readonly message: string;
}

export type FailureCode =
  | 'input-required'
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
      readonly kind?: 'file' | 'page';
      readonly destinations?: readonly { readonly label: string; readonly url: string }[];
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
  readonly preferences?: GatePreferences;
  readonly parseHtml?: (html: string, url: URL) => Document;
  readonly readNativeSession?: (provider: string, gateId: string) => string | null;
  /** Opaque gate-service receipt supplied by a host, never an account OAuth token. */
  readonly readNativeReceipt?: (provider: string, gateId: string, driver: string) => string | null;
  /** Perform a declared public repost after Download. Never return account credentials. */
  readonly repostSoundcloud?: (
    request: SoundcloudRepostRequest,
    signal?: AbortSignal,
    onProgress?: (progress: ResolutionProgress) => void,
  ) => Promise<SoundcloudRepostResult>;
  readonly probePublicFile: (gateId: string) => Promise<string | null>;
  readonly signal?: AbortSignal;
  readonly intent?: 'direct' | 'website-session';
  /** Permits supported automatic gate steps after an explicit Download request. */
  readonly automate?: boolean;
  readonly onProgress?: (progress: ResolutionProgress) => void;
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
