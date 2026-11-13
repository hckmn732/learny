// Public payload of a matching (ET-7): lefts keep their pair id and order; rights (pairs and extra
// rights) are shuffled deterministically and renamed `r1..rn`, so the answer mapping never reaches
// the browser. `opaqueMapping` is the single source of that mapping: the public projection and the
// grading (SPEC-502) both use it, so a seed always rebuilds the same ids.
import type { SourceRef } from '../../common';
import { shuffleSeeded } from '../../random';

import type { MatchingPayload } from './schema';

export interface MatchingPublic {
  instruction: string;
  lefts: { id: string; text: string }[];
  rights: { id: string; text: string }[];
  sources: SourceRef[];
}

/** One opaque right and the pair it actually belongs to (`null` for an extra right). */
export interface MatchingOpaqueRight {
  id: string;
  text: string;
  pairId: string | null;
}

export function opaqueMapping(payload: MatchingPayload, seed: string): MatchingOpaqueRight[] {
  const candidates = [
    ...payload.pairs.map((pair) => ({ text: pair.right, pairId: pair.id })),
    ...payload.extraRights.map((text) => ({ text, pairId: null })),
  ];
  return shuffleSeeded(candidates, `${seed}:rights`).map((candidate, index) => ({
    id: `r${String(index + 1)}`,
    text: candidate.text,
    pairId: candidate.pairId,
  }));
}

export function matchingPublic(payload: MatchingPayload, seed: string): MatchingPublic {
  return {
    instruction: payload.instruction,
    lefts: payload.pairs.map((pair) => ({ id: pair.id, text: pair.left })),
    rights: opaqueMapping(payload, seed).map((right) => ({ id: right.id, text: right.text })),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
