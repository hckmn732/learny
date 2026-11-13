// Shared helpers of the six grade modules: rounding, outcome assembly and response issues. They are
// pure and synchronous; importing a model SDK here is forbidden by the architecture test (CA-7).
import type { z } from 'zod';

import type { BrickType } from './brick-types';
import type { Confusion, GradeError, GradeIssue, GradeOutcome } from './grade-types';

/** Rounds to 4 decimals, half up (ET-3). Scores are never negative. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Rounds points to 2 decimals, half up (ET-5). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Clamps a success ratio to [0, 1]. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function feedbackTitle(isCorrect: boolean): 'Exact.' | 'Pas tout à fait.' {
  return isCorrect ? 'Exact.' : 'Pas tout à fait.';
}

/** Removes duplicate confusion pairs, keeping the first occurrence order (ET-2). */
export function dedupeConfusions(confusions: readonly Confusion[]): Confusion[] {
  const seen = new Set<string>();
  const result: Confusion[] = [];
  for (const confusion of confusions) {
    const key = `${confusion.notionId}\u0000${confusion.confusedWithNotionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(confusion);
  }
  return result;
}

/** Converts Zod issues of a response into stable, readable grading issues. */
export function zodGradeIssues(error: z.ZodError, prefix = 'response'): GradeIssue[] {
  return error.issues.map((issue) => {
    const path = [prefix, ...issue.path.map(String)].filter((part) => part !== '').join('.');
    return { path: path === '' ? prefix : path, message: issue.message };
  });
}

export function invalidResponse(issues: readonly GradeIssue[]): GradeError {
  return { code: 'RESPONSE_INVALID', issues: [...issues] };
}

export function gradedByTutor(type: string): GradeError {
  return {
    code: 'GRADED_BY_TUTOR',
    issues: [
      {
        path: 'type',
        message: `Brick type "${type}" is graded by the tutor, not by code (BR-BRI-08).`,
      },
    ],
  };
}

/** Assembles an outcome and derives `feedbackTitle` from `isCorrect` (EF-1). */
export function outcome<T extends BrickType>(
  input: Omit<GradeOutcome<T>, 'feedbackTitle'>,
): GradeOutcome<T> {
  return { ...input, feedbackTitle: feedbackTitle(input.isCorrect) };
}
