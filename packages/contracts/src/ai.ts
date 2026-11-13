import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the AI usage API (SPEC-507 EF-4, EF-5, ET-3, ET-4). The response carries money,
// tokens and dates only: no key, no prompt, no provider secret ever crosses this boundary.

export const AI_CALL_STATUSES = ['ok', 'error', 'refused', 'capped', 'invalid_output'] as const;
export const AiCallStatus = z.enum(AI_CALL_STATUSES);
export type AiCallStatus = z.infer<typeof AiCallStatus>;

/** Six decimals, the precision of `ai_calls.cost_usd` (`numeric(12,6)`). */
export const UsdAmount = z.string().regex(/^\d{1,6}\.\d{6}$/u);

/** EF-5 — optional local civil days; both bounds are inclusive and default to the last 30 days. */
export const AiUsageQuery = z.object({
  from: CivilDate.optional(),
  to: CivilDate.optional(),
});
export type AiUsageQuery = z.infer<typeof AiUsageQuery>;

/** BR-IA-08 — cost aggregate of one formation and one local day. */
export const AiUsageHistoryRow = z.object({
  day: CivilDate,
  formationId: Uuid.nullable(),
  calls: z.int().min(0),
  spentUsd: UsdAmount,
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  cacheReadTokens: z.int().min(0),
  cacheWriteTokens: z.int().min(0),
});
export type AiUsageHistoryRow = z.infer<typeof AiUsageHistoryRow>;

/** EF-5 — current local-day spend, cap, percentage, next renewal and cost history. */
export const AiUsageOutput = z.object({
  day: CivilDate,
  timezone: z.string().min(1).max(64),
  spentUsd: UsdAmount,
  capUsd: UsdAmount,
  percentUsed: z.number().min(0),
  alertThresholdPercent: z.int().min(1).max(100),
  alert: z.boolean(),
  /** Next local midnight, in UTC ISO 8601. */
  resetsAt: IsoDateTime,
  history: z.array(AiUsageHistoryRow),
});
export type AiUsageOutput = z.infer<typeof AiUsageOutput>;

export const aiRoutes = {
  aiUsage: defineRoute({
    id: 'ai.usage',
    method: 'GET',
    path: '/api/v1/me/ai/usage',
    auth: 'user',
    query: AiUsageQuery,
    output: AiUsageOutput,
    successStatus: 200,
    summary: 'Dépense et plafond de l’IA fournie, avec l’historique par formation et par jour.',
    errors: ['VALIDATION_FAILED'],
  }),
} as const;
export const { aiUsage } = aiRoutes;
