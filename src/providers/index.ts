import type { GateProvider } from '../domain/provider';
import { hypeddit } from './hypeddit';
import { sub2unlock } from './sub2unlock';
import { boost } from './boost';

export const providers: readonly GateProvider[] = [hypeddit, sub2unlock, boost];
