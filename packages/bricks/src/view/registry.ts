// Registry of the thirteen views (SPEC-503 BR-BRI-01, CA-1). A missing type does not typecheck and
// fails `registry.test.tsx`.
import type { ComponentType } from 'react';

import type { BrickType } from '../brick-types';
import { CategorizationView } from '../types/categorization/view';
import { ChoiceQuestionView } from '../types/choice-question/view';
import { ClozeView } from '../types/cloze/view';
import { InstructionView } from '../types/instruction/view';
import { MatchingView } from '../types/matching/view';
import { OpenQuestionView } from '../types/open-question/view';
import { OrderingView } from '../types/ordering/view';
import { RecallCardView } from '../types/recall-card/view';
import { ResourceExcerptView } from '../types/resource-excerpt/view';
import { ScoringView } from '../types/scoring/view';
import { ScriptedDialogueView } from '../types/scripted-dialogue/view';
import { TextView } from '../types/text/view';
import { TimerView } from '../types/timer/view';
import type { BrickViewProps } from '../view-types';

export type BrickView<T extends BrickType> = ComponentType<BrickViewProps<T>>;

export const brickViews: { [K in BrickType]: BrickView<K> } = {
  text: TextView,
  resource_excerpt: ResourceExcerptView,
  choice_question: ChoiceQuestionView,
  open_question: OpenQuestionView,
  cloze: ClozeView,
  matching: MatchingView,
  ordering: OrderingView,
  categorization: CategorizationView,
  recall_card: RecallCardView,
  instruction: InstructionView,
  scripted_dialogue: ScriptedDialogueView,
  timer: TimerView,
  scoring: ScoringView,
};
