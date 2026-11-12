// Public payload of a recall card (ET-7): everything, including the back, because the learner
// self-assesses (ADR-0150 §3).
import type { SourceRef } from '../../common';

import type { RecallCardPayload } from './schema';

export interface RecallCardPublic {
  front: string;
  back: string;
  sourceLabel?: string;
  mnemonic?: string;
  sources: SourceRef[];
}

export function recallCardPublic(payload: RecallCardPayload): RecallCardPublic {
  return {
    front: payload.front,
    back: payload.back,
    ...(payload.sourceLabel === undefined ? {} : { sourceLabel: payload.sourceLabel }),
    ...(payload.mnemonic === undefined ? {} : { mnemonic: payload.mnemonic }),
    sources: payload.sources.map((source) => ({ ...source })),
  };
}
