// Internal rules of a choice question (ET-4): correct answer presence, single mode, all-correct,
// distractor notions, duplicate texts and duplicate ids (BR-BRI-07).
import { brickIssue, type BrickIssue } from '../../issues';
import { duplicateIds, duplicateTexts } from '../checks-helpers';

import type { ChoiceQuestionPayload } from './schema';

export function choiceQuestionChecks(payload: ChoiceQuestionPayload): BrickIssue[] {
  const issues: BrickIssue[] = [];
  const correct = payload.options.filter((option) => option.correct);

  if (correct.length === 0) {
    issues.push(
      brickIssue('CHOICE_NO_CORRECT', 'payload.options', 'At least one option must be correct.'),
    );
  }
  if (payload.mode === 'single' && correct.length !== 1) {
    issues.push(
      brickIssue(
        'CHOICE_SINGLE_NEEDS_ONE',
        'payload.options',
        `Single mode requires exactly one correct option (found ${String(correct.length)}).`,
      ),
    );
  }
  if (correct.length === payload.options.length) {
    issues.push(
      brickIssue('CHOICE_ALL_CORRECT', 'payload.options', 'At least one option must be wrong.'),
    );
  }
  for (const [index, option] of payload.options.entries()) {
    if (option.correct || option.notionId !== null) continue;
    issues.push(
      brickIssue(
        'DISTRACTOR_NOTION_MISSING',
        `payload.options.${String(index)}.notionId`,
        'Every wrong option must carry the notion it represents.',
      ),
    );
  }

  issues.push(
    ...duplicateTexts(
      payload.options.map((option, index) => ({
        text: option.text,
        path: `payload.options.${String(index)}.text`,
      })),
      'DUPLICATE_OPTION',
      'option text',
    ),
  );
  issues.push(
    ...duplicateIds(
      payload.options.map((option, index) => ({
        id: option.id,
        path: `payload.options.${String(index)}.id`,
      })),
    ),
  );

  return issues;
}
