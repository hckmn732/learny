// Public payload of a choice question: option texts only, no `correct`, no rationale, no objective
// (ET-7, CA-4). The order of the options is preserved.
import type { SourceRef } from '../../common';

import type { ChoiceQuestionPayload } from './schema';

export interface ChoiceQuestionPublic {
  stem: string;
  mode: 'single' | 'multiple';
  options: { id: string; text: string }[];
  sources: SourceRef[];
}

export function choiceQuestionPublic(payload: ChoiceQuestionPayload): ChoiceQuestionPublic {
  return {
    stem: payload.stem,
    mode: payload.mode,
    options: payload.options.map((option) => ({ id: option.id, text: option.text })),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
