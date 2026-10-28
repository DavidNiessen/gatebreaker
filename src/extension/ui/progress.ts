import type { ResolutionProgress } from '../../core/domain/provider';

export function countdownLabel(progress: ResolutionProgress | null | undefined): string | null {
  const value = progress?.remainingSeconds;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const seconds = Math.ceil(value);
  const duration =
    seconds >= 60
      ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
      : `${seconds}s`;
  return `Waiting ${duration}…`;
}
