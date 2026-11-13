// Response schema of a choice question (SPEC-502 ET-1): 1 to 6 unique option ids; exactly one in
// single mode. Unknown ids and a wrong cardinality are `RESPONSE_INVALID` (CL-1, CL-2).
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError, GradeIssue } from '../../grade-types';

import type { ChoiceQuestionPayload } from './schema';

export const choiceResponseSchema = z
  .object({
    optionIds: z
      .array(z.string().trim().min(1).max(8))
      .min(1)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Option ids must be unique.',
      }),
  })
  .strict();

export type ChoiceResponse = z.infer<typeof choiceResponseSchema>;

export function parseChoiceResponse(
  payload: ChoiceQuestionPayload,
  response: unknown,
): Result<ChoiceResponse, GradeError> {
  const parsed = choiceResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));

  const { optionIds } = parsed.data;
  const issues: GradeIssue[] = [];
  if (payload.mode === 'single' && optionIds.length !== 1) {
    issues.push({
      path: 'response.optionIds',
      message: 'A single-choice question accepts exactly one option.',
    });
  }
  const known = new Set(payload.options.map((option) => option.id));
  optionIds.forEach((id, index) => {
    if (!known.has(id)) {
      issues.push({
        path: `response.optionIds.${String(index)}`,
        message: `Unknown option "${id}".`,
      });
    }
  });
  if (issues.length > 0) return err(invalidResponse(issues));
  return ok(parsed.data);
}
