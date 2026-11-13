// Cost guard of the provided AI (SPEC-507 EF-1 to EF-3, ET-1, CL-1 to CL-3; BR-IA-07, ADR-0012).
//
// `checkBudget` is pure: it reads no clock, writes nothing and calls no provider. The caller gives
// the actual spend of the learner's local day and the conservative estimate of the call; the
// decision is `allow`, `downgrade` to Haiku, or `defer` (the programme, never degraded). A personal
// key is outside the cap: it returns `allow` with no alert and a zero, unpriced estimate.
import { z } from 'zod';

import { AI_MODEL_IDS, AI_RULES, AI_TASKS, isAiTask, type AiTask } from '@learny/config';

import { estimateUsageCost, formatUsdMicros, parseUsdMicros, type UsageCost } from './price';

export const BUDGET_DECISIONS = ['allow', 'downgrade', 'defer'] as const;
export type BudgetDecision = (typeof BUDGET_DECISIONS)[number];

export const BUDGET_REASONS = [
  'within_budget',
  'alert_threshold',
  'cap_downgrade',
  'cap_deferred',
  'already_light',
  'personal_key',
  'price_unavailable',
] as const;
export type BudgetReason = (typeof BUDGET_REASONS)[number];

export interface EstimatedTokens {
  /** Estimated input tokens (four characters per token). */
  inputTokens: number;
  /** Output ceiling of the task: the conservative amount billed by the provider. */
  outputTokens: number;
}

const moneySchema = z
  .union([z.string(), z.number()])
  .refine((value) => typeof value === 'number' && Number.isFinite(value), {
    message: 'montant USD fini attendu',
  })
  .or(z.string().regex(/^\d{1,6}(\.\d{1,6})?$/u, { message: 'montant USD non négatif attendu' }));

const estimatedTokensSchema = z.object({
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
});

export const budgetCheckSchema = z.object({
  userId: z.uuid(),
  task: z.enum(AI_TASKS),
  model: z.string().trim().min(1).max(200),
  estimatedTokens: estimatedTokensSchema,
  at: z.date(),
  capUsd: moneySchema.refine((value) => micros(value) > 0, {
    message: 'un plafond strictement positif est attendu',
  }),
  spentUsd: moneySchema,
  /** False for a personal key: the cap does not apply (ADR-0012). */
  managed: z.boolean().default(true),
});

export type BudgetCheckInput = z.input<typeof budgetCheckSchema>;
export type ParsedBudgetCheckInput = z.output<typeof budgetCheckSchema>;

export interface BudgetCheckResult {
  decision: BudgetDecision;
  /** Model that the call must use; equal to the requested model unless downgraded. */
  model: string;
  requestedModel: string;
  reason: BudgetReason;
  /** Share of the cap already spent, in percent, with two decimals. */
  percentUsed: number;
  spentUsd: string;
  capUsd: string;
  estimatedCostUsd: string;
  /** False when no configured tariff applies (personal or unknown model). */
  priced: boolean;
  /** One in-app alert must exist for the local day. */
  alert: boolean;
  alertThresholdPercent: number;
  /** True when the call must be postponed to the next local midnight. */
  defer: boolean;
}

function micros(value: string | number): number {
  return typeof value === 'number' ? Math.round(value * 1_000_000) : parseUsdMicros(value);
}

export function budgetPercent(spentUsd: string | number, capUsd: string | number): number {
  const cap = micros(capUsd);
  if (cap <= 0) return 0;
  return Math.min(1_000_000, Math.round((micros(spentUsd) / cap) * 10_000) / 100);
}

/** EF-2 — the 80 % threshold of BR-IA-07, inclusive and compared without display rounding. */
export function shouldAlert(spentUsd: string | number, capUsd: string | number): boolean {
  const cap = micros(capUsd);
  if (cap <= 0) return false;
  return micros(spentUsd) * 100 >= cap * AI_RULES.alertThresholdPercent;
}

function estimate(input: ParsedBudgetCheckInput): UsageCost {
  if (!input.managed) return { costUsd: formatUsdMicros(0), priced: false };
  return estimateUsageCost({
    model: input.model,
    managed: true,
    inputTokens: input.estimatedTokens.inputTokens,
    outputTokens: input.estimatedTokens.outputTokens,
  });
}

/**
 * ET-1 — the single budget decision. A call whose estimate straddles the cap is never allowed as
 * requested: the programme is deferred, every other task is downgraded to Haiku (CL-1). At the
 * cap, a task already on Haiku keeps working on that model until the next local midnight.
 */
export function checkBudget(input: BudgetCheckInput): BudgetCheckResult {
  const value = budgetCheckSchema.parse(input);
  const spentMicros = micros(value.spentUsd);
  const capMicros = micros(value.capUsd);
  const estimated = estimate(value);
  const estimatedMicros = parseUsdMicros(estimated.costUsd);
  const percentUsed = budgetPercent(value.spentUsd, value.capUsd);
  const alert = shouldAlert(value.spentUsd, value.capUsd);
  const base = {
    requestedModel: value.model,
    spentUsd: formatUsdMicros(spentMicros),
    capUsd: formatUsdMicros(capMicros),
    percentUsed,
    estimatedCostUsd: estimated.costUsd,
    priced: estimated.priced,
    alert,
    alertThresholdPercent: AI_RULES.alertThresholdPercent,
  } as const;

  // A personal key never consumes the provided-AI cap (ADR-0012).
  if (!value.managed) {
    return {
      ...base,
      decision: 'allow',
      model: value.model,
      reason: 'personal_key',
      alert: false,
      percentUsed: 0,
      estimatedCostUsd: formatUsdMicros(0),
      priced: false,
      defer: false,
    };
  }

  // A provided model always has a configured price; an unknown one is never guessed.
  if (!estimated.priced) {
    return {
      ...base,
      decision: 'defer',
      model: value.model,
      reason: 'price_unavailable',
      defer: true,
    };
  }

  const reachesCap = spentMicros >= capMicros;
  const straddlesCap = spentMicros + estimatedMicros > capMicros;
  if (!reachesCap && !straddlesCap) {
    return {
      ...base,
      decision: 'allow',
      model: value.model,
      reason: alert ? 'alert_threshold' : 'within_budget',
      defer: false,
    };
  }

  if (value.task === 'programme') {
    return { ...base, decision: 'defer', model: value.model, reason: 'cap_deferred', defer: true };
  }
  if (value.model === AI_MODEL_IDS.haiku) {
    return {
      ...base,
      decision: 'allow',
      model: value.model,
      reason: 'already_light',
      defer: false,
    };
  }
  return {
    ...base,
    decision: 'downgrade',
    model: AI_MODEL_IDS.haiku,
    reason: 'cap_downgrade',
    defer: false,
  };
}

/** ET-1 — validates an untrusted task identifier before the guard is called. */
export function isBudgetTask(value: string): value is AiTask {
  return isAiTask(value);
}
