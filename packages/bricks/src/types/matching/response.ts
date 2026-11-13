// Response schema of a matching (SPEC-502 ET-1): one right id (or null) per pair id. Missing pairs
// and unknown opaque ids are `RESPONSE_INVALID`; null is allowed and counts as false (CL-5).
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError, GradeIssue } from '../../grade-types';

import { opaqueMapping } from './public';
import type { MatchingPayload } from './schema';

export const matchingResponseSchema = z
  .object({
    pairs: z.record(z.string(), z.string().nullable()),
  })
  .strict();

export type MatchingResponse = z.infer<typeof matchingResponseSchema>;

export function parseMatchingResponse(
  payload: MatchingPayload,
  response: unknown,
  seed: string,
): Result<MatchingResponse, GradeError> {
  const parsed = matchingResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));

  const expected = new Set(payload.pairs.map((pair) => pair.id));
  const given = new Set(Object.keys(parsed.data.pairs));
  const rightIds = new Set(opaqueMapping(payload, seed).map((right) => right.id));
  const issues: GradeIssue[] = [];
  for (const id of expected) {
    if (!given.has(id)) {
      issues.push({ path: `response.pairs.${id}`, message: `Missing pair "${id}".` });
    }
  }
  for (const id of given) {
    if (!expected.has(id)) {
      issues.push({ path: `response.pairs.${id}`, message: `Unknown pair "${id}".` });
    }
  }
  for (const [pairId, rightId] of Object.entries(parsed.data.pairs)) {
    if (rightId !== null && !rightIds.has(rightId)) {
      issues.push({
        path: `response.pairs.${pairId}`,
        message: `Unknown right "${rightId}".`,
      });
    }
  }
  if (issues.length > 0) return err(invalidResponse(issues));
  return ok(parsed.data);
}
