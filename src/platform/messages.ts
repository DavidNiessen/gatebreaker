import type { DeliveryState } from '../application/deliver';
import type {
  GateAction,
  GateChallenge,
  GateActionProgress,
  GateSummary,
  Resolution,
  ResolutionProgress,
} from '../domain/provider';

export const messages = {
  status: 'gatebreaker:status',
  resolve: 'gatebreaker:resolve',
  publicFile: 'gatebreaker:public-file',
  action: 'gatebreaker:action',
  cancel: 'gatebreaker:cancel',
  challenge: 'gatebreaker:challenge',
  deliver: 'gatebreaker:deliver',
  cancelDelivery: 'gatebreaker:cancel-delivery',
} as const;

export interface PageStatus {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly gate: GateSummary | null;
  readonly providerName?: string | null;
  readonly progress?: ResolutionProgress | null;
  readonly cancelled?: boolean;
  readonly result: Resolution | null;
  readonly delivery?: DeliveryState | null;
  readonly actions?: readonly GateAction[];
  readonly actionMessage?: string | null;
  readonly preparedEmail?: string | null;
  readonly actionStates?: Readonly<Record<string, GateActionProgress>>;
  readonly challenge?: GateChallenge | null;
  readonly websiteSession?: boolean;
  readonly waitingForLogin?: boolean;
}

export function messageType(value: unknown): string | null {
  return value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string'
    ? value.type
    : null;
}

export const providerUpdateEvent = 'gatebreaker:provider-update';
