import type { GatePreferences } from '../../core/domain/preferences';
import type {
  AuthorizationOpener,
  GateProvider as CoreProvider,
  GateAction,
  GateActionMode,
  GateActionProgress,
  GateActionResult,
  GateChallenge,
  GatePresentation,
} from '../../core/domain/provider';
export * from '../../core/domain/provider';
export interface GateProvider extends CoreProvider {
  actions?(document: Document, url: URL): readonly GateAction[];
  performAction?(
    id: string,
    document: Document,
    url: URL,
    mode: GateActionMode,
    opener?: AuthorizationOpener,
    preferences?: GatePreferences,
  ): GateActionResult;
  cancelActions?(document: Document, url: URL): void;
  challenge?(document: Document, url: URL): GateChallenge | null;
  completeChallenge?(nonce: string, document: Document, url: URL): void;
  actionProgress?(id: string, document: Document, url: URL): GateActionProgress | null;
  presentation?(document: Document, url: URL): GatePresentation | null;
}
