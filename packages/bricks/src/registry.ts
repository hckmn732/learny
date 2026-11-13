// Registry of the thirteen brick types (SPEC-501 ET-1, BR-BRI-01). `BRICK_TYPES` and the registry
// are the single contract used by the tutor (SPEC-508), the grading (SPEC-502), the rendering
// (SPEC-503), the qualification (SPEC-506) and the banks (SPEC-513). A missing entry does not
// typecheck and does not pass the registry test: a new type requires code.
import type { z } from 'zod';

import type { BrickType } from './brick-types';
import { BRICK_TYPES } from './brick-types';
import { canonicalAnswer, stemText } from './fingerprint';
import type { BrickIssue } from './issues';
import type { BrickPayload, PublicPayload } from './payloads';
import type { BrickRefs } from './references';
import { categorizationChecks } from './types/categorization/checks';
import { categorizationPublic } from './types/categorization/public';
import { categorizationReferences } from './types/categorization/references';
import { categorizationSchema } from './types/categorization/schema';
import { choiceQuestionChecks } from './types/choice-question/checks';
import { choiceQuestionPublic } from './types/choice-question/public';
import { choiceQuestionReferences } from './types/choice-question/references';
import { choiceQuestionSchema } from './types/choice-question/schema';
import { clozeChecks } from './types/cloze/checks';
import { clozePublic } from './types/cloze/public';
import { clozeReferences } from './types/cloze/references';
import { clozeSchema } from './types/cloze/schema';
import { instructionChecks } from './types/instruction/checks';
import { instructionPublic } from './types/instruction/public';
import { instructionReferences } from './types/instruction/references';
import { instructionSchema } from './types/instruction/schema';
import { matchingChecks } from './types/matching/checks';
import { matchingPublic } from './types/matching/public';
import { matchingReferences } from './types/matching/references';
import { matchingSchema } from './types/matching/schema';
import { openQuestionChecks } from './types/open-question/checks';
import { openQuestionPublic } from './types/open-question/public';
import { openQuestionReferences } from './types/open-question/references';
import { openQuestionSchema } from './types/open-question/schema';
import { orderingChecks } from './types/ordering/checks';
import { orderingPublic } from './types/ordering/public';
import { orderingReferences } from './types/ordering/references';
import { orderingSchema } from './types/ordering/schema';
import { recallCardChecks } from './types/recall-card/checks';
import { recallCardPublic } from './types/recall-card/public';
import { recallCardReferences } from './types/recall-card/references';
import { recallCardSchema } from './types/recall-card/schema';
import { resourceExcerptChecks } from './types/resource-excerpt/checks';
import { resourceExcerptPublic } from './types/resource-excerpt/public';
import { resourceExcerptReferences } from './types/resource-excerpt/references';
import { resourceExcerptSchema } from './types/resource-excerpt/schema';
import { scoringChecks } from './types/scoring/checks';
import { scoringPublic } from './types/scoring/public';
import { scoringReferences } from './types/scoring/references';
import { scoringSchema } from './types/scoring/schema';
import { scriptedDialogueChecks } from './types/scripted-dialogue/checks';
import { scriptedDialoguePublic } from './types/scripted-dialogue/public';
import { scriptedDialogueReferences } from './types/scripted-dialogue/references';
import { scriptedDialogueSchema } from './types/scripted-dialogue/schema';
import { textChecks } from './types/text/checks';
import { textPublic } from './types/text/public';
import { textReferences } from './types/text/references';
import { textSchema } from './types/text/schema';
import { timerChecks } from './types/timer/checks';
import { timerPublic } from './types/timer/public';
import { timerReferences } from './types/timer/references';
import { timerSchema } from './types/timer/schema';

export { BRICK_TYPES };
export type { BrickType };

export interface BrickDefinition<T extends BrickType> {
  type: T;
  schema: z.ZodType<BrickPayload<T>>;
  isQuestion: boolean;
  requiresNotion: boolean;
  gradedBy: 'code' | 'tutor' | 'none';
  canonicalAnswer?: (payload: BrickPayload<T>) => string;
  stem?: (payload: BrickPayload<T>) => string;
  crossCheck: (payload: BrickPayload<T>) => BrickIssue[];
  references: (payload: BrickPayload<T>) => BrickRefs;
  toPublic: (payload: BrickPayload<T>, seed: string) => PublicPayload<T>;
}

export const brickRegistry: { [K in BrickType]: BrickDefinition<K> } = {
  text: {
    type: 'text',
    schema: textSchema,
    isQuestion: false,
    requiresNotion: true,
    gradedBy: 'none',
    crossCheck: textChecks,
    references: textReferences,
    toPublic: textPublic,
  },
  resource_excerpt: {
    type: 'resource_excerpt',
    schema: resourceExcerptSchema,
    isQuestion: false,
    requiresNotion: true,
    gradedBy: 'none',
    crossCheck: resourceExcerptChecks,
    references: resourceExcerptReferences,
    toPublic: resourceExcerptPublic,
  },
  choice_question: {
    type: 'choice_question',
    schema: choiceQuestionSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('choice_question', payload) ?? '',
    stem: (payload) => stemText('choice_question', payload) ?? '',
    crossCheck: choiceQuestionChecks,
    references: choiceQuestionReferences,
    toPublic: choiceQuestionPublic,
  },
  open_question: {
    type: 'open_question',
    schema: openQuestionSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'tutor',
    canonicalAnswer: (payload) => canonicalAnswer('open_question', payload) ?? '',
    stem: (payload) => stemText('open_question', payload) ?? '',
    crossCheck: openQuestionChecks,
    references: openQuestionReferences,
    toPublic: openQuestionPublic,
  },
  cloze: {
    type: 'cloze',
    schema: clozeSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('cloze', payload) ?? '',
    stem: (payload) => stemText('cloze', payload) ?? '',
    crossCheck: clozeChecks,
    references: clozeReferences,
    toPublic: clozePublic,
  },
  matching: {
    type: 'matching',
    schema: matchingSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('matching', payload) ?? '',
    stem: (payload) => stemText('matching', payload) ?? '',
    crossCheck: matchingChecks,
    references: matchingReferences,
    toPublic: matchingPublic,
  },
  ordering: {
    type: 'ordering',
    schema: orderingSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('ordering', payload) ?? '',
    stem: (payload) => stemText('ordering', payload) ?? '',
    crossCheck: orderingChecks,
    references: orderingReferences,
    toPublic: orderingPublic,
  },
  categorization: {
    type: 'categorization',
    schema: categorizationSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('categorization', payload) ?? '',
    stem: (payload) => stemText('categorization', payload) ?? '',
    crossCheck: categorizationChecks,
    references: categorizationReferences,
    toPublic: categorizationPublic,
  },
  recall_card: {
    type: 'recall_card',
    schema: recallCardSchema,
    isQuestion: true,
    requiresNotion: true,
    gradedBy: 'code',
    canonicalAnswer: (payload) => canonicalAnswer('recall_card', payload) ?? '',
    stem: (payload) => stemText('recall_card', payload) ?? '',
    crossCheck: recallCardChecks,
    references: recallCardReferences,
    toPublic: recallCardPublic,
  },
  instruction: {
    type: 'instruction',
    schema: instructionSchema,
    isQuestion: false,
    requiresNotion: true,
    gradedBy: 'tutor',
    crossCheck: instructionChecks,
    references: instructionReferences,
    toPublic: instructionPublic,
  },
  scripted_dialogue: {
    type: 'scripted_dialogue',
    schema: scriptedDialogueSchema,
    isQuestion: false,
    requiresNotion: true,
    gradedBy: 'tutor',
    crossCheck: scriptedDialogueChecks,
    references: scriptedDialogueReferences,
    toPublic: scriptedDialoguePublic,
  },
  timer: {
    type: 'timer',
    schema: timerSchema,
    isQuestion: false,
    requiresNotion: false,
    gradedBy: 'code',
    crossCheck: timerChecks,
    references: timerReferences,
    toPublic: timerPublic,
  },
  scoring: {
    type: 'scoring',
    schema: scoringSchema,
    isQuestion: false,
    requiresNotion: false,
    gradedBy: 'none',
    crossCheck: scoringChecks,
    references: scoringReferences,
    toPublic: scoringPublic,
  },
};
