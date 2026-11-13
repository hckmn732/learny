// Response schema of an ordering (SPEC-502 ET-1): the order must be an exact permutation of the
// item ids; unknown, missing or duplicate ids are `RESPONSE_INVALID` (CL-6).
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError, GradeIssue } from '../../grade-types';

import type { OrderingPayload } from './schema';

export const orderingResponseSchema = z
  .object({
    order: z
      .array(z.string().trim().min(1).max(8))
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Ordered ids must be unique.',
      }),
  })
  .strict();

export type OrderingResponse = z.infer<typeof orderingResponseSchema>;

export function parseOrderingResponse(
  payload: OrderingPayload,
  response: unknown,
): Result<OrderingResponse, GradeError> {
  const parsed = orderingResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));

  const expected = new Set(payload.items.map((item) => item.id));
  const { order } = parsed.data;
  const issues: GradeIssue[] = [];
  if (order.length !== payload.items.length) {
    issues.push({
      path: 'response.order',
      message: `The order must contain exactly ${String(payload.items.length)} items.`,
    });
  }
  order.forEach((id, index) => {
    if (!expected.has(id)) {
      issues.push({
        path: `response.order.${String(index)}`,
        message: `Unknown item "${id}".`,
      });
    }
  });
  for (const id of expected) {
    if (!order.includes(id)) {
      issues.push({ path: 'response.order', message: `Missing item "${id}".` });
    }
  }
  if (issues.length > 0) return err(invalidResponse(issues));
  return ok(parsed.data);
}
