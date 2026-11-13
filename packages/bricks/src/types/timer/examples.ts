// Reference examples of the `timer` type. The invalid one scopes to items without listing any.
import type { BrickExample } from '../../payloads';
import { BRICK_A } from '../example-ids';

import type { TimerPayload } from './schema';

export const timerExample: BrickExample<'timer'> = {
  valid: {
    durationSec: 600,
    scope: 'items',
    itemBrickIds: [BRICK_A],
    warnAtSec: 120,
    autoSubmit: true,
    sources: [],
  },
  invalid: {
    durationSec: 600,
    scope: 'items',
    itemBrickIds: [],
    warnAtSec: 120,
    autoSubmit: true,
    sources: [],
  },
  invalidCode: 'TIMER_SCOPE_INVALID',
};

export type TimerExamplePayload = TimerPayload;
