export { createGatebreaker } from './client';
export type {
  CoreOptions,
  CoreProvider,
  GatePage,
  GateSession,
  Gatebreaker,
  ResolveOptions,
} from './client';
export type { GatePreferences } from './domain/preferences';
export type { SoundcloudRepostRequest, SoundcloudRepostResult } from './domain/soundcloud';
export type {
  FailureCode,
  Gate,
  GateSummary,
  ProviderContext,
  Resolution,
  ResolutionProgress,
} from './domain/provider';
export { safeHttpsUrl } from './domain/urls';
export { providers } from './providers';
