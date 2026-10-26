import type { GateSummary, Resolution } from '../domain/provider';

export const messages = {
  status: 'gatebreaker:status',
  resolve: 'gatebreaker:resolve',
  publicFile: 'gatebreaker:public-file',
} as const;

export interface PageStatus {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly gate: GateSummary | null;
  readonly result: Resolution | null;
}

export function messageType(value: unknown): string | null {
  return value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string'
    ? value.type
    : null;
}
