// The reference examples of the thirteen types, indexed by type. Used by the unit tests, the demo
// page, the qualification (SPEC-506) and the gallery (SPEC-503).
import type { BrickType } from './brick-types';
import type { BrickExample } from './payloads';
import { categorizationExample } from './types/categorization/examples';
import { choiceQuestionExample } from './types/choice-question/examples';
import { clozeExample } from './types/cloze/examples';
import { instructionExample } from './types/instruction/examples';
import { matchingExample } from './types/matching/examples';
import { openQuestionExample } from './types/open-question/examples';
import { orderingExample } from './types/ordering/examples';
import { recallCardExample } from './types/recall-card/examples';
import { resourceExcerptExample } from './types/resource-excerpt/examples';
import { scoringExample } from './types/scoring/examples';
import { scriptedDialogueExample } from './types/scripted-dialogue/examples';
import { textExample } from './types/text/examples';
import { timerExample } from './types/timer/examples';

export const brickExamples = {
  text: textExample,
  resource_excerpt: resourceExcerptExample,
  choice_question: choiceQuestionExample,
  open_question: openQuestionExample,
  cloze: clozeExample,
  matching: matchingExample,
  ordering: orderingExample,
  categorization: categorizationExample,
  recall_card: recallCardExample,
  instruction: instructionExample,
  scripted_dialogue: scriptedDialogueExample,
  timer: timerExample,
  scoring: scoringExample,
} satisfies { [K in BrickType]: BrickExample<K> };
