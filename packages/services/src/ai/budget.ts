// Budget service of the provided AI (SPEC-507 EF-1 to EF-3, ET-1 to ET-3, CL-1 to CL-5).
//
// The pure decision lives in `@learny/llm`; this service reads the profile's local day, the
// subscription cap and the actual spend, then reserves the estimate under the per-learner lock of
// `packages/db`. A deferral writes a zero-cost `capped` journal row and one notification per local
// day; a downgrade continues on Haiku and the journal records the effective model (ADR-0294).
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { AI_MODEL_IDS, AI_RULES, isProvidedModel, type AiTask } from '@learny/config';
import { AppError, err, ok, userDayBounds, userLocalDay, type Result } from '@learny/core';
import {
  aiTaskSchema,
  getSpendToday,
  reserveBudget,
  schema,
  serviceDb,
  settleBudgetReservation,
  sumReservedUsd,
  type Db,
} from '@learny/db';
import {
  checkBudget,
  estimateUsageCost,
  formatUsdMicros,
  parseUsdMicros,
  type BudgetCheckResult,
  type BudgetGuard,
} from '@learny/llm';
import { notify } from '@learny/notifications';

import { ensureCostAlert, recordAiCall, type AiContext, type AiDeps } from './journal';
import { programmeDeferredKey } from './usage-key';

const { profiles, subscriptions } = schema;

/** A crashed caller cannot hold a lease longer than the longest task timeout plus a margin. */
export const BUDGET_RESERVATION_TTL_MS = 15 * 60_000;

export interface BudgetAttemptInput {
  userId: string;
  task: AiTask;
  formationId?: string | null | undefined;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  /** False for a personal key: no cap is consumed (ADR-0012). */
  managed?: boolean | undefined;
  at?: Date | undefined;
}

export interface BudgetAttempt {
  decision: BudgetCheckResult['decision'];
  model: string;
  requestedModel: string;
  reason: BudgetCheckResult['reason'];
  reservationId: string | null;
  spentUsd: string;
  capUsd: string;
  percentUsed: number;
  alert: boolean;
  alertThresholdPercent: number;
  estimatedCostUsd: string;
  priced: boolean;
  /** Next local midnight, ISO 8601: the cap and the deferral end there. */
  resetsAt: string;
  localDay: string;
  timezone: string;
  /** True when the programme is postponed instead of degraded. */
  defer: boolean;
  /** True when this attempt created the 80 % notification. */
  alertCreated: boolean;
  /** True when this attempt created the programme deferral notification. */
  deferredNotified: boolean;
}

const attemptSchema = z.object({
  userId: z.uuid(),
  task: aiTaskSchema,
  formationId: z.uuid().nullish(),
  model: z.string().trim().min(1).max(200),
  estimatedInputTokens: z.int().min(0),
  estimatedOutputTokens: z.int().min(0),
  managed: z.boolean().default(true),
  at: z.date().optional(),
});

function validationFailure(error: z.ZodError): AppError {
  return new AppError('VALIDATION_FAILED', 'Entrée de budget invalide.', {
    errors: error.issues.map((issue) => ({
      path: issue.path.join('.') || '(racine)',
      message: issue.message,
    })),
  });
}

function addUsd(left: string, right: string): string {
  return formatUsdMicros(parseUsdMicros(left) + parseUsdMicros(right));
}

async function profileAndCap(
  sdb: Db,
  userId: string,
): Promise<{ timezone: string; capUsd: string }> {
  const [profile] = await sdb
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  const [subscription] = await sdb
    .select({ cap: subscriptions.dailyCapUsd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return {
    timezone: profile.timezone,
    capUsd: subscription?.cap ?? String(AI_RULES.dailyCapUsd),
  };
}

async function readSpend(sdb: Db, userId: string, at: Date): Promise<string> {
  return sdb.transaction((tx) => getSpendToday(tx, { userId, now: at }));
}

async function readReserved(sdb: Db, userId: string, day: string, at: Date): Promise<string> {
  return sdb.transaction((tx) => sumReservedUsd(tx, { userId, localDay: day, at }));
}

async function notifyProgrammeDeferred(
  ctx: AiContext,
  input: { userId: string; day: string; sdb: Db; at: Date; timezone: string; resetsAt: string },
): Promise<boolean> {
  try {
    const result = await notify(
      {
        requestId: ctx.requestId,
        sdb: input.sdb,
        clock: { now: () => new Date(input.at) },
        logger: ctx.logger,
      },
      {
        userId: input.userId,
        type: 'ai_task_failed',
        data: {
          taskLabel: 'Conception du programme reportée au lendemain',
          href: '/reglages/ia',
          deferredUntil: input.resetsAt,
          timezone: input.timezone,
        },
        dedupeKey: programmeDeferredKey(input.day),
      },
    );
    return result.ok && result.value.created;
  } catch {
    return false;
  }
}

async function recordCapped(
  ctx: AiContext,
  input: BudgetAttemptInput,
  attempt: { at: Date; model: string; errorCode: string },
  deps: AiDeps,
): Promise<void> {
  const result = await recordAiCall(
    ctx,
    {
      userId: input.userId,
      formationId: input.formationId ?? null,
      task: input.task,
      provider: 'anthropic',
      model: attempt.model,
      managed: true,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: 0,
      status: 'capped',
      errorCode: attempt.errorCode,
      at: attempt.at,
    },
    deps,
  );
  if (!result.ok) throw result.error;
}

function attemptsResult(
  base: {
    check: BudgetCheckResult;
    spentUsd: string;
    capUsd: string;
    resetsAt: string;
    localDay: string;
    timezone: string;
  },
  extra: {
    reservationId?: string | null;
    alertCreated?: boolean;
    deferredNotified?: boolean;
    model?: string;
  } = {},
): BudgetAttempt {
  const spentUsd = formatUsdMicros(parseUsdMicros(base.spentUsd));
  const capUsd = formatUsdMicros(parseUsdMicros(base.capUsd));
  const percentUsed =
    Math.round((parseUsdMicros(spentUsd) / Math.max(1, parseUsdMicros(capUsd))) * 10_000) / 100;
  return {
    decision: base.check.decision,
    model: extra.model ?? base.check.model,
    requestedModel: base.check.requestedModel,
    reason: base.check.reason,
    reservationId: extra.reservationId ?? null,
    spentUsd,
    capUsd,
    percentUsed,
    alert: percentUsed >= AI_RULES.alertThresholdPercent,
    alertThresholdPercent: AI_RULES.alertThresholdPercent,
    estimatedCostUsd: base.check.estimatedCostUsd,
    priced: base.check.priced,
    resetsAt: base.resetsAt,
    localDay: base.localDay,
    timezone: base.timezone,
    defer: base.check.defer,
    alertCreated: extra.alertCreated ?? false,
    deferredNotified: extra.deferredNotified ?? false,
  };
}

function deferred(check: BudgetCheckResult): BudgetCheckResult {
  return {
    ...check,
    decision: 'defer',
    reason: 'cap_deferred',
    defer: true,
  };
}

/**
 * EF-1 to EF-3 — the one entry point of the guard. It returns a decision with the effective model
 * and, for an allowed call, a reservation that the caller consumes through `recordAiCall` or
 * releases after a failure.
 */
export async function checkAndReserveAiBudget(
  ctx: AiContext,
  input: BudgetAttemptInput,
  deps: AiDeps = {},
): Promise<Result<BudgetAttempt>> {
  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) return err(validationFailure(parsed.error));
  const value = parsed.data;
  const sdb = deps.sdb ?? serviceDb();
  const at = value.at ?? ctx.clock.now();
  try {
    const { timezone, capUsd } = await profileAndCap(sdb, value.userId);
    const localDay = userLocalDay(at, timezone);
    const bounds = userDayBounds(localDay, timezone);
    const resetsAt = bounds.end.toISOString();
    const actualSpent = await readSpend(sdb, value.userId, at);

    if (!value.managed) {
      const check = checkBudget({
        userId: value.userId,
        task: value.task,
        model: value.model,
        estimatedTokens: {
          inputTokens: value.estimatedInputTokens,
          outputTokens: value.estimatedOutputTokens,
        },
        at,
        capUsd,
        spentUsd: actualSpent,
        managed: false,
      });
      return ok(
        attemptsResult({ check, spentUsd: actualSpent, capUsd, resetsAt, localDay, timezone }),
      );
    }

    const reserved = await readReserved(sdb, value.userId, localDay, at);
    let check = checkBudget({
      userId: value.userId,
      task: value.task,
      model: value.model,
      estimatedTokens: {
        inputTokens: value.estimatedInputTokens,
        outputTokens: value.estimatedOutputTokens,
      },
      at,
      capUsd,
      spentUsd: addUsd(actualSpent, reserved),
    });
    let reservedId: string | null = null;

    if (check.decision !== 'defer') {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const estimate = estimateUsageCost({
          model: check.model,
          managed: true,
          inputTokens: value.estimatedInputTokens,
          outputTokens: value.estimatedOutputTokens,
        });
        const candidate = await sdb.transaction((tx) =>
          reserveBudget(tx, {
            userId: value.userId,
            localDay,
            estimatedUsd: estimate.costUsd,
            capUsd,
            at,
            expiresAt: new Date(at.getTime() + BUDGET_RESERVATION_TTL_MS),
          }),
        );
        if (candidate.reservation !== null) {
          reservedId = candidate.reservation.id;
          break;
        }
        const previousModel = check.model;
        const retried = checkBudget({
          userId: value.userId,
          task: value.task,
          model: value.model,
          estimatedTokens: {
            inputTokens: value.estimatedInputTokens,
            outputTokens: value.estimatedOutputTokens,
          },
          at,
          capUsd,
          spentUsd: addUsd(candidate.spentUsd, candidate.reservedUsd),
        });
        check = retried;
        if (retried.decision === 'defer' || retried.model === previousModel) break;
      }
      if (reservedId === null) check = deferred(check);
    }

    if (check.decision === 'defer' || reservedId === null) {
      const finalCheck = deferred(check);
      await recordCapped(ctx, value, { at, model: value.model, errorCode: 'AI_CAP_REACHED' }, deps);
      const deferredNotified =
        value.task === 'programme'
          ? await notifyProgrammeDeferred(ctx, {
              userId: value.userId,
              day: localDay,
              sdb,
              at,
              timezone,
              resetsAt,
            })
          : false;
      return ok(
        attemptsResult(
          { check: finalCheck, spentUsd: actualSpent, capUsd, resetsAt, localDay, timezone },
          { deferredNotified, model: value.model },
        ),
      );
    }

    const alertCreated = await ensureCostAlert(ctx, { userId: value.userId, at, sdb });
    return ok(
      attemptsResult(
        { check, spentUsd: actualSpent, capUsd, resetsAt, localDay, timezone },
        { reservationId: reservedId, alertCreated, model: check.model },
      ),
    );
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

/** Releases a lease after a call that never happened; an expired lease has the same effect. */
export async function releaseBudgetReservation(
  sdb: Db,
  input: { userId: string; reservationId: string; at: Date },
): Promise<void> {
  await sdb.transaction((tx) =>
    settleBudgetReservation(tx, {
      userId: input.userId,
      reservationId: input.reservationId,
      status: 'released',
      at: input.at,
    }),
  );
}

/**
 * ET-1 — adapter for the `budgetGuard` hook of `@learny/llm`. The session calls it before each
 * step; a deferred programme returns `AI_CAP_REACHED`, a downgrade returns the Haiku model.
 */
export function createAiBudgetGuard(ctx: AiContext, deps: AiDeps = {}): BudgetGuard {
  return async (llmCtx, { resolved, estimate }) => {
    if (resolved.kind !== 'managed') return ok({ resolved });
    const decision = await checkAndReserveAiBudget(
      ctx,
      {
        userId: llmCtx.userId,
        task: estimate.task,
        model: resolved.modelId,
        estimatedInputTokens: estimate.inputTokens,
        estimatedOutputTokens: estimate.maxOutputTokens,
      },
      deps,
    );
    if (!decision.ok) return decision;
    const value = decision.value;
    if (value.decision === 'defer') {
      return err(
        new AppError(
          'AI_CAP_REACHED',
          'La conception du programme est reportée au prochain minuit local.',
          { reason: 'programme_deferred', link: '/reglages/ia' },
        ),
      );
    }
    const model = isProvidedModel(value.model) ? value.model : AI_MODEL_IDS.haiku;
    const effective = model === resolved.modelId ? resolved : { ...resolved, modelId: model };
    const reservationId = value.reservationId;
    if (reservationId === null) return ok({ resolved: effective });
    const sdb = deps.sdb ?? serviceDb();
    return ok({
      resolved: effective,
      settle: async () => {
        await releaseBudgetReservation(sdb, {
          userId: llmCtx.userId,
          reservationId,
          at: ctx.clock.now(),
        });
      },
    });
  };
}
