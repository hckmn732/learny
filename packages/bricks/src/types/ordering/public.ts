// Public payload of an ordering (ET-7): items are shuffled deterministically; if the shuffle gives
// the correct order back, one rotation always breaks it.
import type { SourceRef } from '../../common';
import { shuffleSeeded } from '../../random';

import type { OrderingPayload } from './schema';

export interface OrderingPublic {
  instruction: string;
  items: { id: string; text: string }[];
  sources: SourceRef[];
}

export function orderingPublic(payload: OrderingPayload, seed: string): OrderingPublic {
  const original = payload.items.map((item) => ({ id: item.id, text: item.text }));
  let items = shuffleSeeded(original, `${seed}:items`);
  const sameOrder = items.every((item, index) => item.id === original[index]?.id);
  if (sameOrder && items.length > 1) {
    items = [...items.slice(1), items[0] as (typeof items)[number]];
  }
  return {
    instruction: payload.instruction,
    items,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
