// Public payload of a matching (ET-7): lefts keep their pair id and order; rights (pairs and extra
// rights) are shuffled deterministically and renamed `r1..rn`, so the answer mapping never reaches
// the browser.
import type { SourceRef } from '../../common';
import { shuffleSeeded } from '../../random';

import type { MatchingPayload } from './schema';

export interface MatchingPublic {
  instruction: string;
  lefts: { id: string; text: string }[];
  rights: { id: string; text: string }[];
  sources: SourceRef[];
}

export function matchingPublic(payload: MatchingPayload, seed: string): MatchingPublic {
  const rights = [...payload.pairs.map((pair) => pair.right), ...payload.extraRights];
  const shuffled = shuffleSeeded(rights, `${seed}:rights`).map((text, index) => ({
    id: `r${String(index + 1)}`,
    text,
  }));
  return {
    instruction: payload.instruction,
    lefts: payload.pairs.map((pair) => ({ id: pair.id, text: pair.left })),
    rights: shuffled,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
