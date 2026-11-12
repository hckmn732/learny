// Internal rules of a matching (ET-4): no duplicate left or right text, including extra rights, and
// no duplicate pair id.
import { type BrickIssue } from '../../issues';
import { duplicateIds, duplicateTexts } from '../checks-helpers';

import type { MatchingPayload } from './schema';

export function matchingChecks(payload: MatchingPayload): BrickIssue[] {
  const entries = payload.pairs.flatMap((pair, index) => [
    { text: pair.left, path: `payload.pairs.${String(index)}.left`, side: 'left' },
    { text: pair.right, path: `payload.pairs.${String(index)}.right`, side: 'right' },
  ]);
  payload.extraRights.forEach((right, index) => {
    entries.push({
      text: right,
      path: `payload.extraRights.${String(index)}`,
      side: 'right',
    });
  });

  const lefts = entries.filter((entry) => entry.side === 'left');
  const rights = entries.filter((entry) => entry.side === 'right');
  return [
    ...duplicateTexts(
      lefts.map(({ text, path }) => ({ text, path })),
      'MATCHING_DUPLICATE',
      'left text',
    ),
    ...duplicateTexts(
      rights.map(({ text, path }) => ({ text, path })),
      'MATCHING_DUPLICATE',
      'right text',
    ),
    ...duplicateIds(
      payload.pairs.map((pair, index) => ({
        id: pair.id,
        path: `payload.pairs.${String(index)}.id`,
      })),
    ),
  ];
}
