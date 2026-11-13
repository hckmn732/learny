// Usage of the provided AI (SPEC-507 EF-4, EF-5, ET-3, ET-4; BR-IA-08).
//
// The read runs with the learner's RLS client: `ai_spend_today` and `listAiUsage` are scoped to the
// authenticated owner, so another account's calls never appear. The local day, its next midnight
// and the history come from the profile's IANA zone with the injected clock (ADR-0047).
import { eq } from 'drizzle-orm';

import { AI_RULES } from '@learny/config';
import { AiUsageQuery, type AiUsageOutput } from '@learny/contracts';
import {
  AppError,
  endOfUserDay,
  startOfUserDay,
  userDayBounds,
  userLocalDay,
  type Result,
} from '@learny/core';
import {
  DEFAULT_DAILY_CAP_USD,
  getSpendToday,
  getSubscription,
  listAiUsage,
  schema,
  type DbTx,
} from '@learny/db';
import { budgetPercent, formatUsdMicros, parseUsdMicros } from '@learny/llm';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

const { profiles } = schema;

const HISTORY_DAYS = 30;

async function timezoneOf(tx: DbTx, userId: string): Promise<string> {
  const [row] = await tx
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return row.timezone;
}

function defaultFrom(dayStart: Date, timeZone: string): Date {
  // 29 days before the start of today keeps today plus 29 past days. Around a DST change the UTC
  // shift can add or remove one hour; the local-day grouping below remains the source of truth.
  return startOfUserDay(
    userLocalDay(new Date(dayStart.getTime() - (HISTORY_DAYS - 1) * 86_400_000), timeZone),
    timeZone,
  );
}

/** EF-5 — spend, cap, percentage, next local midnight and the cost history of the learner. */
export function getAiUsage(
  ctx: ServiceContext,
  input: unknown = {},
): Promise<Result<AiUsageOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const query = AiUsageQuery.parse(input);
    return db.run(async (tx) => {
      const timezone = await timezoneOf(tx, userId);
      const now = ctx.clock.now();
      const day = userLocalDay(now, timezone);
      const today = userDayBounds(day, timezone);
      const subscription = await getSubscription(tx, userId);
      const capUsd = formatUsdMicros(
        parseUsdMicros(subscription?.dailyCapUsd ?? DEFAULT_DAILY_CAP_USD),
      );
      const spentUsd = formatUsdMicros(parseUsdMicros(await getSpendToday(tx, { userId, now })));
      const from =
        query.from === undefined
          ? defaultFrom(today.start, timezone)
          : startOfUserDay(query.from, timezone);
      const to = query.to === undefined ? today.end : endOfUserDay(query.to, timezone);
      if (from >= to) {
        throw new AppError('VALIDATION_FAILED', 'La fin de la plage doit suivre son début.', {
          errors: [{ path: 'to', message: 'la fin de plage doit suivre son début' }],
        });
      }
      const history = await listAiUsage(tx, { userId, from, to });
      const percentUsed = budgetPercent(spentUsd, capUsd);
      return {
        day,
        timezone,
        spentUsd,
        capUsd,
        percentUsed,
        alertThresholdPercent: AI_RULES.alertThresholdPercent,
        alert: percentUsed >= AI_RULES.alertThresholdPercent,
        resetsAt: today.end.toISOString(),
        history: history.map((row) => ({
          day: row.day,
          formationId: row.formationId,
          calls: row.calls,
          spentUsd: formatUsdMicros(parseUsdMicros(row.spentUsd)),
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          cacheReadTokens: row.cacheReadTokens,
          cacheWriteTokens: row.cacheWriteTokens,
        })),
      } satisfies AiUsageOutput;
    });
  });
}
