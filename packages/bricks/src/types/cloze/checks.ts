// Internal rules of a cloze (ET-4): tokens and gap ids agree, ids are consecutive from 1, no token
// repeats and no accepted answer is already visible outside the gaps.
import { brickIssue, type BrickIssue } from '../../issues';
import { normalizeText } from '../../normalize';
import { duplicateIds } from '../checks-helpers';

import type { ClozePayload } from './schema';

const TOKEN = /\{\{(\d+)\}\}/gu;

function tokenIds(template: string): number[] {
  return [...template.matchAll(TOKEN)].map((match) => Number(match[1]));
}

export function clozeChecks(payload: ClozePayload): BrickIssue[] {
  const issues: BrickIssue[] = [];
  const tokens = tokenIds(payload.template);
  const ids = payload.gaps.map((gap) => gap.id);
  const uniqueTokens = new Set(tokens);
  const expected = Array.from({ length: ids.length }, (_, index) => index + 1);

  const idsConsecutive =
    ids.length === expected.length && ids.every((id, index) => id === expected[index]);
  const tokensMatch =
    uniqueTokens.size === tokens.length &&
    uniqueTokens.size === new Set(ids).size &&
    [...uniqueTokens].every((id) => ids.includes(id));

  if (!idsConsecutive || !tokensMatch) {
    issues.push(
      brickIssue(
        'CLOZE_GAP_MISMATCH',
        'payload.template',
        'Template tokens must match the gap ids, with ids consecutive from 1 and no repeated token.',
      ),
    );
  }

  issues.push(
    ...duplicateIds(
      payload.gaps.map((gap, index) => ({
        id: String(gap.id),
        path: `payload.gaps.${String(index)}.id`,
      })),
    ),
  );

  const outside = normalizeText(payload.template.replace(TOKEN, ' '));
  const haystack = ` ${outside} `;
  payload.gaps.forEach((gap, index) => {
    const answer = normalizeText(gap.answers[0] ?? '');
    if (answer === '') return;
    if (haystack.includes(` ${answer} `)) {
      issues.push(
        brickIssue(
          'CLOZE_ANSWER_LEAK',
          `payload.gaps.${String(index)}.answers.0`,
          `Accepted answer "${gap.answers[0] ?? ''}" already appears outside the gaps.`,
        ),
      );
    }
  });

  return issues;
}
