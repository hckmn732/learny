// Response schema of a categorization (SPEC-502 ET-1): one category id (or null) per item id.
// Missing items and unknown categories are `RESPONSE_INVALID`; null counts as false.
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError, GradeIssue } from '../../grade-types';

import type { CategorizationPayload } from './schema';

export const categorizationResponseSchema = z
  .object({
    assignments: z.record(z.string(), z.string().nullable()),
  })
  .strict();

export type CategorizationResponse = z.infer<typeof categorizationResponseSchema>;

export function parseCategorizationResponse(
  payload: CategorizationPayload,
  response: unknown,
): Result<CategorizationResponse, GradeError> {
  const parsed = categorizationResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));

  const expected = new Set(payload.items.map((item) => item.id));
  const categories = new Set(payload.categories.map((category) => category.id));
  const given = new Set(Object.keys(parsed.data.assignments));
  const issues: GradeIssue[] = [];
  for (const id of expected) {
    if (!given.has(id)) {
      issues.push({ path: `response.assignments.${id}`, message: `Missing item "${id}".` });
    }
  }
  for (const id of given) {
    if (!expected.has(id)) {
      issues.push({ path: `response.assignments.${id}`, message: `Unknown item "${id}".` });
    }
  }
  for (const [itemId, categoryId] of Object.entries(parsed.data.assignments)) {
    if (categoryId !== null && !categories.has(categoryId)) {
      issues.push({
        path: `response.assignments.${itemId}`,
        message: `Unknown category "${categoryId}".`,
      });
    }
  }
  if (issues.length > 0) return err(invalidResponse(issues));
  return ok(parsed.data);
}
