// Internal rule of a timer (ET-4): item ids are required in `items` scope and forbidden in
// `activity` scope.
import { brickIssue, type BrickIssue } from '../../issues';

import type { TimerPayload } from './schema';

export function timerChecks(payload: TimerPayload): BrickIssue[] {
  if (payload.scope === 'items' && payload.itemBrickIds.length === 0) {
    return [
      brickIssue(
        'TIMER_SCOPE_INVALID',
        'payload.itemBrickIds',
        'Items scope requires at least one brick id.',
      ),
    ];
  }
  if (payload.scope === 'activity' && payload.itemBrickIds.length > 0) {
    return [
      brickIssue(
        'TIMER_SCOPE_INVALID',
        'payload.itemBrickIds',
        'Activity scope forbids item brick ids.',
      ),
    ];
  }
  return [];
}
