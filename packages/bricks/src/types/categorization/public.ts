// Public payload of a categorization (ET-7): categories stay visible, items are shuffled and lose
// their `categoryId`.
import type { SourceRef } from '../../common';
import { shuffleSeeded } from '../../random';

import type { CategorizationPayload } from './schema';

export interface CategorizationPublic {
  instruction: string;
  categories: { id: string; label: string }[];
  items: { id: string; text: string }[];
  sources: SourceRef[];
}

export function categorizationPublic(
  payload: CategorizationPayload,
  seed: string,
): CategorizationPublic {
  return {
    instruction: payload.instruction,
    categories: payload.categories.map((category) => ({
      id: category.id,
      label: category.label,
    })),
    items: shuffleSeeded(
      payload.items.map((item) => ({ id: item.id, text: item.text })),
      `${seed}:items`,
    ),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
