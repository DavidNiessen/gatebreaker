import type { GateProvider } from '../domain/provider';
import { hypeddit } from './hypeddit';
import { sub2unlock } from './sub2unlock';
import { boost } from './boost';
import { rekonise } from './rekonise';
import { valorizd } from './valorizd';
import { push } from './push';
import { gaterush } from './gaterush';

export const providers: readonly GateProvider[] = [
  hypeddit,
  sub2unlock,
  boost,
  rekonise,
  valorizd,
  push,
  gaterush,
];
