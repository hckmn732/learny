// Response schema of a cloze (SPEC-502 ET-1): one entry per gap, empty allowed and false
// (CL-1). Unknown gap ids and missing gaps are `RESPONSE_INVALID`.
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError, GradeIssue } from '../../grade-types';

import type { ClozePayload } from './schema';

export const clozeResponseSchema = z
  .object({
    gaps: z.record(z.string(), z.string().max(120)),
  })
  .strict();

export type ClozeResponse = z.infer<typeof clozeResponseSchema>;

export function parseClozeResponse(
  payload: ClozePayload,
  response: unknown,
): Result<ClozeResponse, GradeError> {
  const parsed = clozeResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));

  const expected = new Set(payload.gaps.map((gap) => String(gap.id)));
  const given = new Set(Object.keys(parsed.data.gaps));
  const issues: GradeIssue[] = [];
  for (const id of expected) {
    if (!given.has(id)) {
      issues.push({ path: `response.gaps.${id}`, message: `Missing gap "${id}".` });
    }
  }
  for (const id of given) {
    if (!expected.has(id)) {
      issues.push({ path: `response.gaps.${id}`, message: `Unknown gap "${id}".` });
    }
  }
  if (issues.length > 0) return err(invalidResponse(issues));
  return ok(parsed.data);
}
