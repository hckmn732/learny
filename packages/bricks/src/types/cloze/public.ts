// Public payload of a cloze: only the hint of each gap; accepted answers stay server-side.
import type { SourceRef } from '../../common';

import type { ClozePayload } from './schema';

export interface ClozePublic {
  template: string;
  gaps: { id: number; hint?: string }[];
  sources: SourceRef[];
}

export function clozePublic(payload: ClozePayload): ClozePublic {
  return {
    template: payload.template,
    gaps: payload.gaps.map((gap) =>
      gap.hint === undefined ? { id: gap.id } : { id: gap.id, hint: gap.hint },
    ),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
