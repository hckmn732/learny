// Payload and public-payload maps of the thirteen types. They exist only as types: the runtime
// contract is the registry, which pairs each type with its schema, checks, references and public
// projection.
import type { BrickType } from './brick-types';
import type { BrickIssueCode } from './issues';
import type { CategorizationPublic } from './types/categorization/public';
import type { CategorizationPayload } from './types/categorization/schema';
import type { ChoiceQuestionPublic } from './types/choice-question/public';
import type { ChoiceQuestionPayload } from './types/choice-question/schema';
import type { ClozePublic } from './types/cloze/public';
import type { ClozePayload } from './types/cloze/schema';
import type { InstructionPublic } from './types/instruction/public';
import type { InstructionPayload } from './types/instruction/schema';
import type { MatchingPublic } from './types/matching/public';
import type { MatchingPayload } from './types/matching/schema';
import type { OpenQuestionPublic } from './types/open-question/public';
import type { OpenQuestionPayload } from './types/open-question/schema';
import type { OrderingPublic } from './types/ordering/public';
import type { OrderingPayload } from './types/ordering/schema';
import type { RecallCardPublic } from './types/recall-card/public';
import type { RecallCardPayload } from './types/recall-card/schema';
import type { ResourceExcerptPublic } from './types/resource-excerpt/public';
import type { ResourceExcerptPayload } from './types/resource-excerpt/schema';
import type { ScoringPublic } from './types/scoring/public';
import type { ScoringPayload } from './types/scoring/schema';
import type { ScriptedDialoguePublic } from './types/scripted-dialogue/public';
import type { ScriptedDialoguePayload } from './types/scripted-dialogue/schema';
import type { TextPublic } from './types/text/public';
import type { TextPayload } from './types/text/schema';
import type { TimerPublic } from './types/timer/public';
import type { TimerPayload } from './types/timer/schema';

export interface BrickPayloadMap {
  text: TextPayload;
  resource_excerpt: ResourceExcerptPayload;
  choice_question: ChoiceQuestionPayload;
  open_question: OpenQuestionPayload;
  cloze: ClozePayload;
  matching: MatchingPayload;
  ordering: OrderingPayload;
  categorization: CategorizationPayload;
  recall_card: RecallCardPayload;
  instruction: InstructionPayload;
  scripted_dialogue: ScriptedDialoguePayload;
  timer: TimerPayload;
  scoring: ScoringPayload;
}

export interface PublicPayloadMap {
  text: TextPublic;
  resource_excerpt: ResourceExcerptPublic;
  choice_question: ChoiceQuestionPublic;
  open_question: OpenQuestionPublic;
  cloze: ClozePublic;
  matching: MatchingPublic;
  ordering: OrderingPublic;
  categorization: CategorizationPublic;
  recall_card: RecallCardPublic;
  instruction: InstructionPublic;
  scripted_dialogue: ScriptedDialoguePublic;
  timer: TimerPublic;
  scoring: ScoringPublic;
}

export type BrickPayload<T extends BrickType> = BrickPayloadMap[T];
export type PublicPayload<T extends BrickType> = PublicPayloadMap[T];
export type AnyBrickPayload = BrickPayloadMap[BrickType];
export type AnyPublicPayload = PublicPayloadMap[BrickType];

/** A valid charge, an invalid charge and the issue code the invalid one must produce (CA-1). */
export interface BrickExample<T extends BrickType> {
  valid: BrickPayload<T>;
  invalid: unknown;
  invalidCode: BrickIssueCode;
}
