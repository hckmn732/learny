// Review filter of the mock exam results (SPEC-614 EF-4, BR-PRA-04). Pure: the screen can show
// every answered question or only the errors, without recomputing anything server-side.
import type { ExamReviewFilter, ExamReviewRow } from '@learny/contracts';

/** BR-PRA-04 — « toutes » keeps every row, « erreurs » keeps wrong or unanswered questions. */
export function filterExamReview(
  rows: readonly ExamReviewRow[],
  filter: ExamReviewFilter,
): ExamReviewRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => !row.isCorrect);
}

export interface ExamReviewCounts {
  all: number;
  errors: number;
}

/** Counts displayed next to the two review filters. */
export function countExamReview(rows: readonly ExamReviewRow[]): ExamReviewCounts {
  return {
    all: rows.length,
    errors: rows.filter((row) => !row.isCorrect).length,
  };
}
