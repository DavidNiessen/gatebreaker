import type { GateAction, GateActionProgress, GateSummary, Resolution } from '../domain/provider';

export const messages = {
  status: 'gatebreaker:status',
  resolve: 'gatebreaker:resolve',
  publicFile: 'gatebreaker:public-file',
  action: 'gatebreaker:action',
} as const;

export interface PageStatus {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly gate: GateSummary | null;
  readonly result: Resolution | null;
  readonly actions?: readonly GateAction[];
  readonly actionMessage?: string | null;
  readonly preparedEmail?: string | null;
  readonly actionStates?: Readonly<Record<string, GateActionProgress>>;
  readonly websiteSession?: boolean;
}

export function messageType(value: unknown): string | null {
  return value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string'
    ? value.type
    : null;
}
