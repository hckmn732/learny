// Public payload of an instruction (ET-7, ADR-0150 §2): everything except the criteria descriptions
// and the hints, replaced by their count.
import type { SourceRef } from '../../common';

import type { InstructionPayload, InstructionProduction } from './schema';

export interface InstructionPublic {
  title: string;
  taskMd: string;
  data: string[];
  deliverable: string;
  production: InstructionProduction;
  explanationPrompt: string | null;
  hintsCount: number;
  criteria: { key: string; label: string; points: number }[];
  estimatedMinutes: number;
  passPoints: number;
  sources: SourceRef[];
}

export function instructionPublic(payload: InstructionPayload): InstructionPublic {
  return {
    title: payload.title,
    taskMd: payload.taskMd,
    data: [...payload.data],
    deliverable: payload.deliverable,
    production: payload.production,
    explanationPrompt: payload.explanationPrompt,
    hintsCount: payload.hints.length,
    criteria: payload.criteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      points: criterion.points,
    })),
    estimatedMinutes: payload.estimatedMinutes,
    passPoints: payload.passPoints,
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
