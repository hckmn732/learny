// Internal rules of an ordering (ET-4): no duplicate text and no duplicate id.
import { type BrickIssue } from '../../issues';
import { duplicateIds, duplicateTexts } from '../checks-helpers';

import type { OrderingPayload } from './schema';

export function orderingChecks(payload: OrderingPayload): BrickIssue[] {
  return [
    ...duplicateTexts(
      payload.items.map((item, index) => ({
        text: item.text,
        path: `payload.items.${String(index)}.text`,
      })),
      'ORDERING_DUPLICATE',
      'item text',
    ),
    ...duplicateIds(
      payload.items.map((item, index) => ({
        id: item.id,
        path: `payload.items.${String(index)}.id`,
      })),
    ),
  ];
}
