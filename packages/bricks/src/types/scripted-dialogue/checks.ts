// Internal rules of a scripted dialogue: criteria total stays between 1 and 20 points.
import { brickIssue, type BrickIssue } from '../../issues';
import { pointsSum } from '../checks-helpers';

import type { ScriptedDialoguePayload } from './schema';

export function scriptedDialogueChecks(payload: ScriptedDialoguePayload): BrickIssue[] {
  const sum = pointsSum(payload.criteria);
  if (sum >= 1 && sum <= 20) return [];
  return [
    brickIssue(
      'CRITERIA_POINTS_MISMATCH',
      'payload.criteria',
      `Criteria points must total between 1 and 20 (found ${String(sum)}).`,
    ),
  ];
}
