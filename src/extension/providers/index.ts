import type { GateProvider } from '../domain/provider';
import { boost } from './boost';
import { droploud } from './droploud';
import { gaterush } from './gaterush';
import { hypeddit } from './hypeddit';
import { push } from './push';
import { rekonise } from './rekonise';
import { sub2unlock } from './sub2unlock';
import { valorizd } from './valorizd';
export const providers: readonly GateProvider[] = [
  hypeddit,
  sub2unlock,
  boost,
  rekonise,
  valorizd,
  push,
  gaterush,
  droploud,
];
