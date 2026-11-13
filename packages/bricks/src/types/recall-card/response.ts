// Response schema of a recall card (SPEC-502 ET-1): the learner self-assesses (BR-MEM-02).
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import { RECALL_SELF_GRADES, type GradeError, type RecallSelfGrade } from '../../grade-types';

export const recallCardResponseSchema = z
  .object({
    selfGrade: z.enum(RECALL_SELF_GRADES),
  })
  .strict();

export type RecallCardResponse = z.infer<typeof recallCardResponseSchema>;

export function parseRecallCardResponse(response: unknown): Result<RecallCardResponse, GradeError> {
  const parsed = recallCardResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));
  return ok(parsed.data);
}

/** Convenience alias used by the demo and the tests. */
export type RecallCardSelfGrade = RecallSelfGrade;
