import type { PageStatus } from '../platform/messages';

/** Only actionable failures belong in the native-step notice, never a progress log. */
export function actionError(status: PageStatus): string {
  if (status.delivery?.state === 'failed') return status.delivery.message;
  if (status.result?.ok) return '';
  for (const progress of Object.values(status.actionStates ?? {})) {
    if (
      progress.state === 'error' &&
      (!status.result || status.result.ok || progress.message !== status.result.message)
    )
      return progress.message;
  }
  return '';
}
