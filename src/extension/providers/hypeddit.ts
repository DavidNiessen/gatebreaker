import { hypeddit as coreProvider } from '../../core/providers/hypeddit';
import type { GateProvider } from '../domain/provider';
import {
  cancelHypedditActions,
  completeHypedditChallenge,
  hypedditActionProgress,
  hypedditChallenge,
  listHypedditActions,
  performHypedditAction,
} from './hypeddit/actions';
import { hypedditPresentation } from './hypeddit/presentation';
export * from '../../core/providers/hypeddit';

export const hypeddit: GateProvider = {
  ...coreProvider,
  actions: listHypedditActions,
  performAction: performHypedditAction,
  actionProgress: hypedditActionProgress,
  cancelActions: cancelHypedditActions,
  challenge: hypedditChallenge,
  completeChallenge: completeHypedditChallenge,
  presentation: hypedditPresentation,
};
