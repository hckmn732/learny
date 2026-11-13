// Public payload of a timer: everything, including the listed brick ids and the warning point.
import type { SourceRef } from '../../common';

import type { TimerPayload } from './schema';

export interface TimerPublic {
  durationSec: number;
  scope: 'activity' | 'items';
  itemBrickIds: string[];
  warnAtSec: number;
  autoSubmit: boolean;
  sources: SourceRef[];
}

export function timerPublic(payload: TimerPayload): TimerPublic {
  return {
    durationSec: payload.durationSec,
    scope: payload.scope,
    itemBrickIds: [...payload.itemBrickIds],
    warnAtSec: payload.warnAtSec,
    autoSubmit: payload.autoSubmit,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
