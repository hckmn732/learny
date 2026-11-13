// Public payload of an open question: the expected elements and the model answer stay server-side.
import type { SourceRef } from '../../common';

import type { OpenQuestionPayload } from './schema';

export interface OpenQuestionPublic {
  stem: string;
  answerMaxChars: number;
  criteria: { label: string; points: number }[];
  sources: SourceRef[];
}

export function openQuestionPublic(payload: OpenQuestionPayload): OpenQuestionPublic {
  return {
    stem: payload.stem,
    answerMaxChars: payload.answerMaxChars,
    criteria: payload.criteria.map((criterion) => ({
      label: criterion.label,
      points: criterion.points,
    })),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
