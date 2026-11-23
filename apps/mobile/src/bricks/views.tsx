// Binding of the thirteen types to their component (SPEC-3301 ET-1).
//
// `Record<BrickType, NativeBrickView>` makes the compiler refuse a missing type; the Jest test
// `test/bricks/registry.test.tsx` proves the same binding at runtime, and `registry.test.ts`
// proves the decision table against `BRICK_TYPES`. Both are the guard of BR-BRI-01.
import type { BrickType } from '@learny/bricks';

import type { NativeBrickView } from './registry';
import { CategorizationView } from './types/categorization/CategorizationView';
import { ChoiceQuestionView } from './types/choice-question/ChoiceQuestionView';
import { ClozeView } from './types/cloze/ClozeView';
import { MatchingView } from './types/matching/MatchingView';
import { OpenQuestionView } from './types/open-question/OpenQuestionView';
import { OrderingView } from './types/ordering/OrderingView';
import { RecallCardView } from './types/recall-card/RecallCardView';
import { ResourceExcerptView } from './types/resource-excerpt/ResourceExcerptView';
import { TextView } from './types/text/TextView';
import { WebOnlyView } from './types/web-only/WebOnlyView';

/** One component per type of `BRICK_TYPES`: nine native views, four hand-off cards. */
export const nativeBrickViews: Record<BrickType, NativeBrickView> = {
  text: TextView,
  resource_excerpt: ResourceExcerptView,
  choice_question: ChoiceQuestionView,
  open_question: OpenQuestionView,
  cloze: ClozeView,
  matching: MatchingView,
  ordering: OrderingView,
  categorization: CategorizationView,
  recall_card: RecallCardView,
  instruction: WebOnlyView,
  scripted_dialogue: WebOnlyView,
  timer: WebOnlyView,
  scoring: WebOnlyView,
};
