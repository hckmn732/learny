// Gallery data of the thirteen types (SPEC-3301 EF-8, § 10): every `brickExamples` entry, its
// public projection, the response a learner would give and the correction the server would send
// back. The `/_dev/bricks` page reads only this module, so the gallery can never show a state the
// application cannot produce.
//
// Pure: no React Native import (`@learny/bricks` is the pure entry, ADR-3009 § 1), so Vitest
// checks that every projected example really parses with the public mirrors.
import type {
  AutoGradedType,
  BrickExample,
  BrickPayload,
  BrickPublic,
  BrickType,
  CorrectionView,
  GradeOutcome,
} from '@learny/bricks';
import {
  AUTO_GRADED_TYPES,
  brickExamples,
  gradeBrick,
  opaqueMapping,
  toPublicBrick,
} from '@learny/bricks';

import { BRICK_RENDERERS } from './registry';
import {
  categorizationResponse,
  choiceResponse,
  clozeResponse,
  matchingResponse,
  orderingResponse,
  recallResponse,
} from './responses';

/** Version id used as the shuffle seed of the gallery: the same ids on every run (ADR-0150). */
export const SHOWCASE_SEED = '00000000-0000-4000-8000-000000003301';

/** One example of the gallery: the charge, a plausible answer and its correction. */
export interface ShowcaseBrick {
  readonly type: BrickType;
  readonly brick: BrickPublic;
  readonly response: unknown;
  readonly correction: CorrectionView | null;
  readonly outcome: GradeOutcome | null;
}

/** The response a learner gives when they answer correctly (used by CA-2 as well). */
export function correctResponseFor(type: AutoGradedType, payload: unknown, seed: string): unknown {
  switch (type) {
    case 'choice_question': {
      const charge = payload as BrickPayload<'choice_question'>;
      const correct = charge.options.filter((option) => option.correct).map((option) => option.id);
      return choiceResponse(charge.mode === 'single' ? correct.slice(0, 1) : correct);
    }
    case 'cloze': {
      const charge = payload as BrickPayload<'cloze'>;
      const values: Record<string, string> = {};
      for (const gap of charge.gaps) values[String(gap.id)] = gap.answers[0] ?? '';
      return clozeResponse(values);
    }
    case 'matching': {
      const charge = payload as BrickPayload<'matching'>;
      const pairs: Record<string, string | null> = {};
      for (const right of opaqueMapping(charge, seed)) {
        if (right.pairId !== null) pairs[right.pairId] = right.id;
      }
      return matchingResponse(pairs);
    }
    case 'ordering': {
      const charge = payload as BrickPayload<'ordering'>;
      return orderingResponse(charge.items.map((item) => item.id));
    }
    case 'categorization': {
      const charge = payload as BrickPayload<'categorization'>;
      const assignments: Record<string, string | null> = {};
      for (const item of charge.items) assignments[item.id] = item.categoryId;
      return categorizationResponse(assignments);
    }
    case 'recall_card':
      return recallResponse('good');
  }
}

/** True when the code corrects the type (BR-BRI-08). */
export function isAutoGraded(type: BrickType): type is AutoGradedType {
  return (AUTO_GRADED_TYPES as readonly BrickType[]).includes(type);
}

/** One example of the gallery, built from `brickExamples` and the public projection. */
export function showcaseFor(type: BrickType): ShowcaseBrick {
  const example = brickExamples[type] as BrickExample<BrickType>;
  const brick = toPublicBrick({
    brickId: `gallery-${type}`,
    versionId: SHOWCASE_SEED,
    type,
    notionIds: [],
    payload: example.valid,
  });
  if (!isAutoGraded(type)) {
    return { type, brick, response: null, correction: null, outcome: null };
  }
  const response = correctResponseFor(type, example.valid, SHOWCASE_SEED);
  const graded = gradeBrick(
    type,
    example.valid as BrickPayload<AutoGradedType>,
    response,
    SHOWCASE_SEED,
  );
  if (!graded.ok) return { type, brick, response, correction: null, outcome: null };
  return { type, brick, response, correction: graded.value.correction, outcome: graded.value };
}

/** The thirteen examples, in the order of `BRICK_TYPES` (native first, then the web hand-offs). */
export const SHOWCASE_BRICKS: readonly ShowcaseBrick[] = (
  Object.keys(BRICK_RENDERERS) as BrickType[]
).map((type) => showcaseFor(type));
