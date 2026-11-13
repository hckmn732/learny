// Journal of the AI calls and 80 % cost alert (SPEC-507 EF-2, EF-4, ET-2 to ET-4; BR-IA-08).
//
// Every attempted call is written by the service role, including a refusal, an error and a cap
// decision that never reached a provider. The cost comes from `@learny/llm` and no secret, input
// content or provider header is stored. A retry that carries the same reservation returns the
// existing row instead of writing a second one (idempotent replay).
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { AI_RULES, type AiTask } from '@learny/config';
import {
  AppError,
  err,
  ok,
  userLocalDay,
  type Clock,
  type LearnyLogger,
  type Result,
} from '@learny/core';
import {
  aiCallStatusSchema,
  aiCalls,
  aiProviderSchema,
  aiTaskSchema,
  costUsdSchema,
  getBudgetReservation,
  getSpendToday,
  latencyMsSchema,
  modelIdSchema,
  recordAiCall as recordAiCallRow,
  schema,
  serviceDb,
  settleBudgetReservation,
  tokenCountSchema,
  type AiCallStatusValue,
  type AiProviderValue,
  type Db,
  type DbTx,
} from '@learny/db';
import { budgetPercent, calculateUsageCost } from '@learny/llm';
import { notify } from '@learny/notifications';

import { costAlertKey } from './usage-key';

const { profiles, subscriptions } = schema;

export interface AiContext {
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}

export interface AiDeps {
  /** Test seam; production uses the owner-role client of the service. */
  sdb?: Db;
}

export const recordAiCallSchema = z.object({
  userId: z.uuid(),
  formationId: z.uuid().nullish(),
  task: aiTaskSchema,
  provider: aiProviderSchema,
  model: modelIdSchema,
  managed: z.boolean(),
  usage: z.object({
    inputTokens: tokenCountSchema.default(0),
    outputTokens: tokenCountSchema.default(0),
    cacheReadTokens: tokenCountSchema.default(0),
    cacheWriteTokens: tokenCountSchema.default(0),
  }),
  latencyMs: latencyMsSchema.default(0),
  status: aiCallStatusSchema,
  errorCode: z.string().trim().min(1).max(80).nullish(),
  batch: z.boolean().default(false),
  reservationId: z.uuid().nullish(),
  at: z.date().optional(),
});

export type RecordAiCallInput = z.input<typeof recordAiCallSchema>;

export interface AiCallDto {
  id: string;
  userId: string | null;
  formationId: string | null;
  task: AiTask;
  provider: AiProviderValue;
  model: string;
  managed: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: string;
  latencyMs: number;
  status: AiCallStatusValue;
  errorCode: string | null;
  batch: boolean;
  createdAt: string;
}

export interface RecordAiCallResult {
  call: AiCallDto;
  /** False when the 80 % notification already existed for this local day. */
  alertCreated: boolean;
  /** True when a retry returned the row already written for the same reservation. */
  replayed: boolean;
}

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

export function toCallDto(row: typeof aiCalls.$inferSelect): AiCallDto {
  return {
    id: row.id,
    userId: row.userId,
    formationId: row.formationId,
    task: row.task,
    provider: row.provider,
    model: row.model,
    managed: row.managed,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    costUsd: costUsdSchema.parse(row.costUsd),
    latencyMs: row.latencyMs,
    status: row.status,
    errorCode: row.errorCode,
    batch: row.batch,
    createdAt: row.createdAt.toISOString(),
  };
}

async function readCall(tx: DbTx, id: string): Promise<typeof aiCalls.$inferSelect | null> {
  const [row] = await tx.select().from(aiCalls).where(eq(aiCalls.id, id)).limit(1);
  return row ?? null;
}

/**
 * ET-2 — writes exactly one journal row. A refusal, an error and a capped decision cost zero when
 * no provider call happened; the actual usage is preserved as given by the caller.
 */
export async function recordAiCall(
  ctx: AiContext,
  input: RecordAiCallInput,
  deps: AiDeps = {},
): Promise<Result<RecordAiCallResult>> {
  const parsed = recordAiCallSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      validationError(
        'call',
        parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`,
        ),
      ),
    );
  }
  const value = parsed.data;
  const at = value.at ?? ctx.clock.now();
  const cost = calculateUsageCost({
    model: value.model,
    managed: value.managed,
    usage: value.usage,
    batch: value.batch,
  });
  const sdb = deps.sdb ?? serviceDb();
  try {
    const result = await sdb.transaction(async (tx) => {
      if (value.reservationId !== null && value.reservationId !== undefined) {
        const reservation = await getBudgetReservation(tx, {
          userId: value.userId,
          reservationId: value.reservationId,
        });
        if (reservation === null) {
          throw new AppError('NOT_FOUND', 'Réservation de budget introuvable.');
        }
        if (reservation.status === 'consumed' && reservation.callId !== null) {
          const existing = await readCall(tx, reservation.callId);
          if (existing === null) {
            throw new AppError('INTERNAL_ERROR', 'Appel journalisé introuvable.');
          }
          return { row: existing, replayed: true };
        }
        if (reservation.status !== 'reserved') {
          throw new AppError('CONFLICT', 'Réservation de budget déjà clôturée.');
        }
      }
      const row = await recordAiCallRow(tx, {
        userId: value.userId,
        formationId: value.formationId ?? null,
        task: value.task,
        provider: value.provider,
        model: value.model,
        managed: value.managed,
        inputTokens: value.usage.inputTokens,
        outputTokens: value.usage.outputTokens,
        cacheReadTokens: value.usage.cacheReadTokens,
        cacheWriteTokens: value.usage.cacheWriteTokens,
        costUsd: cost.costUsd,
        latencyMs: value.latencyMs,
        status: value.status,
        errorCode: value.errorCode ?? null,
        batch: value.batch,
        createdAt: at,
      });
      if (value.reservationId !== null && value.reservationId !== undefined) {
        const settled = await settleBudgetReservation(tx, {
          userId: value.userId,
          reservationId: value.reservationId,
          status: 'consumed',
          callId: row.id,
          at,
        });
        if (settled === null) {
          throw new AppError('CONFLICT', 'Réservation de budget déjà clôturée.');
        }
      }
      return { row, replayed: false };
    });
    const alertCreated =
      result.replayed || !value.managed
        ? false
        : await ensureCostAlert(ctx, { userId: value.userId, at, sdb });
    return ok({ call: toCallDto(result.row), alertCreated, replayed: result.replayed });
  } catch (error) {
    if (error instanceof AppError) return err(error);
    throw error;
  }
}

/**
 * EF-2 — creates at most one `ai_cost_alert` per learner and local day. The unique dedupe key of
 * `notifications` makes the operation idempotent even under two concurrent calls.
 */
export async function ensureCostAlert(
  ctx: AiContext,
  input: { userId: string; at: Date; sdb?: Db },
): Promise<boolean> {
  const sdb = input.sdb ?? serviceDb();
  const [profile] = await sdb
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, input.userId))
    .limit(1);
  if (profile === undefined) return false;
  const subscription = await sdb
    .select({ cap: subscriptions.dailyCapUsd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, input.userId))
    .limit(1)
    .then((rows) => rows[0]);
  const capUsd = subscription?.cap ?? String(AI_RULES.dailyCapUsd);
  const spentUsd = await sdb.transaction((tx) =>
    getSpendToday(tx, { userId: input.userId, now: input.at }),
  );
  const percent = budgetPercent(spentUsd, capUsd);
  if (percent < AI_RULES.alertThresholdPercent) return false;
  const day = userLocalDay(input.at, profile.timezone);
  try {
    const result = await notify(
      { requestId: ctx.requestId, sdb, clock: ctx.clock, logger: ctx.logger },
      {
        userId: input.userId,
        type: 'ai_cost_alert',
        data: { percent: Math.round(percent), href: '/reglages/ia' },
        dedupeKey: costAlertKey(day),
      },
    );
    return result.ok && result.value.created;
  } catch {
    // The alert is best effort: a failed notification never loses the journal row.
    return false;
  }
}
