// Repository of the daily study activity (SPEC-108 EF-4, EF-6, CL-5, CL-8; ADR-0033).
//
// One row per `(user_id, day)`; `day` is a civil local date computed by SPEC-207, never by SQL
// (ET-4). The upsert is a single statement: two concurrent writes add their minutes atomically, the
// event sources are de-duplicated, and replaying an event whose sources are already known adds
// nothing, so reprocessing the same event never doubles the activity (CA-3, CL-5).
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  activityMinutesSchema,
  activitySourcesSchema,
  dailyActivity,
  planningDaySchema,
  type DailyActivity,
} from '../schema/planning';

const uuidSchema = z.uuid();
const booleanSchema = z.boolean();

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

function day(value: string): string {
  return parse(planningDaySchema, value, 'day');
}

export interface DailyActivityRef {
  userId: string;
  /** Civil local day, `YYYY-MM-DD`. */
  day: string;
}

/** EF-4 — reads one local day; another learner's row yields `null` under `userDb`. */
export async function getDailyActivity(
  tx: DbTx,
  input: DailyActivityRef,
): Promise<DailyActivity | null> {
  const userId = identifier(input.userId, 'userId');
  const civilDay = day(input.day);
  const rows = await tx
    .select()
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, userId), eq(dailyActivity.day, civilDay)));
  return rows[0] ?? null;
}

export interface DailyActivityRangeInput {
  userId: string;
  /** Inclusive first day. */
  from: string;
  /** Inclusive last day. */
  to: string;
}

/**
 * EF-4, CL-8 — reads a closed range of local days, oldest first. The streak service (SPEC-409)
 * reads at most fourteen days and fills neutral days itself; this function performs no time-zone
 * conversion.
 */
export async function listDailyActivity(
  tx: DbTx,
  input: DailyActivityRangeInput,
): Promise<DailyActivity[]> {
  const userId = identifier(input.userId, 'userId');
  const from = day(input.from);
  const to = day(input.to);
  if (to < from) {
    throw validationError('to', ['la borne de fin précède la borne de début']);
  }
  return tx
    .select()
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.day, from),
        lte(dailyActivity.day, to),
      ),
    )
    .orderBy(asc(dailyActivity.day));
}

export interface UpsertDailyActivityInput extends DailyActivityRef {
  minutes: number;
  qualifying?: boolean;
  /** Event identifiers; duplicates are removed and a replay is idempotent. */
  sources?: string[];
}

/**
 * EF-4, CL-5, CA-3 — upserts one local day atomically. The `on conflict` branch:
 *   * adds the minutes only when at least one event source is new (a replay adds nothing) ;
 *   * ORs `qualifying` with the same condition ;
 *   * unions and sorts the sources, without duplicates.
 * A single statement makes two concurrent writes safe without a read-then-write race.
 */
export async function upsertDailyActivity(
  tx: DbTx,
  input: UpsertDailyActivityInput,
): Promise<DailyActivity> {
  const userId = identifier(input.userId, 'userId');
  const civilDay = day(input.day);
  const minutes = parse(activityMinutesSchema, input.minutes, 'minutes');
  const qualifying = parse(booleanSchema, input.qualifying ?? false, 'qualifying');
  const parsedSources = parse(activitySourcesSchema, input.sources ?? [], 'sources');
  const sources = [...new Set(parsedSources)];
  // A JSON array converted to `text[]`: binding a JS array directly in a `sql` fragment would send
  // its elements one by one, not an array value.
  const sourcesParam = sql`array(select jsonb_array_elements_text(${JSON.stringify(sources)}::jsonb))`;

  // True when every proposed source already belongs to the row: the write is a replay of known
  // events and must not add minutes again (CA-3).
  const replay = sql`cardinality(${sourcesParam}) > 0 and not exists (
    select 1
    from unnest(${sourcesParam}) as candidate
    where candidate <> all(${dailyActivity.sources})
  )`;

  const inserted = await tx
    .insert(dailyActivity)
    .values({ userId, day: civilDay, minutes, qualifying, sources })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.day],
      set: {
        minutes: sql`${dailyActivity.minutes} + case when ${replay} then 0 else ${minutes} end`,
        qualifying: sql`${dailyActivity.qualifying} or (not (${replay}) and ${qualifying})`,
        sources: sql`(
          select coalesce(array_agg(distinct element order by element), '{}'::text[])
          from unnest(${dailyActivity.sources} || ${sourcesParam}) as element
        )`,
      },
    })
    .returning();
  const activity = inserted[0];
  if (activity === undefined) throw new AppError('INTERNAL_ERROR', 'Activité du jour non écrite.');
  return activity;
}
