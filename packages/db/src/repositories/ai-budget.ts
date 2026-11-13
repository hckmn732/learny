// Budget reservations of the provided AI (SPEC-507 ET-1 to ET-3, CL-1 to CL-5).
//
// A reservation is a short-lived lease counted with the actual spend of the learner's local day.
// The read of the spend, the sum of active leases and the insert run in one transaction under the
// per-learner advisory lock, so two simultaneous calls cannot both consume the same remaining
// budget (CL-5). Expired leases are ignored instead of deleted: a crashed caller never blocks the
// learner, and the journal remains the only source of the real spend (BR-IA-08).
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  aiBudgetReservations,
  costUsdSchema,
  dailyCapUsdSchema,
  normalizeUsd,
  type AiBudgetReservation,
  type AiReservationStatusValue,
} from '../schema/ai-billing';

import { getSpendToday } from './ai-usage';

const uuidSchema = z.uuid();
const civilDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

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

/** Money in integer micro-USD: six decimals, the precision of `numeric(12,6)`. */
function micros(value: string | number): number {
  const text = normalizeUsd(value);
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

function fromMicros(value: number): string {
  return normalizeUsd((Math.max(0, Math.round(value)) / 1_000_000).toFixed(6));
}

export interface ReserveBudgetInput {
  userId: string;
  /** Civil day of the learner's time zone. */
  localDay: string;
  estimatedUsd: string | number;
  capUsd: string | number;
  /** Instant of the decision; the daily spend is evaluated in the learner's zone. */
  at: Date;
  expiresAt: Date;
}

export interface ReserveBudgetResult {
  /** Null when the projected spend would exceed the cap: no lease was written. */
  reservation: AiBudgetReservation | null;
  /** Actual spend of the local day, from `ai_calls` only. */
  spentUsd: string;
  /** Sum of the active leases of the local day, before this attempt. */
  reservedUsd: string;
}

const reserveSchema = z.object({
  userId: uuidSchema,
  localDay: civilDaySchema,
  estimatedUsd: costUsdSchema.refine((value) => Number(value) > 0, {
    message: 'une réservation strictement positive est attendue',
  }),
  capUsd: dailyCapUsdSchema,
  at: z.date(),
  expiresAt: z.date(),
});

/**
 * ET-1, CL-1, CL-5 — checks and reserves the estimated cost atomically. The advisory lock is
 * transaction-scoped: the next candidate sees the lease written by the first one.
 */
export async function reserveBudget(
  tx: DbTx,
  input: ReserveBudgetInput,
): Promise<ReserveBudgetResult> {
  const value = parse(reserveSchema, input, 'reservation');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${value.userId})::bigint)`);
  const spentUsd = await getSpendToday(tx, { userId: value.userId, now: value.at });
  const reservedUsd = await sumReservedUsd(tx, {
    userId: value.userId,
    localDay: value.localDay,
    at: value.at,
  });
  const projected = micros(spentUsd) + micros(reservedUsd) + micros(value.estimatedUsd);
  if (projected > micros(value.capUsd)) {
    return { reservation: null, spentUsd, reservedUsd };
  }
  const [row] = await tx
    .insert(aiBudgetReservations)
    .values({
      userId: value.userId,
      localDay: value.localDay,
      estimatedUsd: value.estimatedUsd,
      status: 'reserved',
      createdAt: value.at,
      expiresAt: value.expiresAt,
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'réservation IA non créée');
  return { reservation: row, spentUsd, reservedUsd };
}

/** ET-3 — sum of the unexpired leases of one local day. */
export async function sumReservedUsd(
  tx: DbTx,
  input: { userId: string; localDay: string; at: Date },
): Promise<string> {
  const userId = parse(uuidSchema, input.userId, 'userId');
  const localDay = parse(civilDaySchema, input.localDay, 'localDay');
  const at = parse(z.date(), input.at, 'at');
  const rows = await tx
    .select({
      total: sql<string>`coalesce(sum(${aiBudgetReservations.estimatedUsd}), 0)::numeric(12, 6)::text`,
    })
    .from(aiBudgetReservations)
    .where(
      and(
        eq(aiBudgetReservations.userId, userId),
        eq(aiBudgetReservations.localDay, localDay),
        eq(aiBudgetReservations.status, 'reserved'),
        gt(aiBudgetReservations.expiresAt, at),
      ),
    );
  return normalizeUsd(rows[0]?.total ?? '0');
}

export interface SettleBudgetInput {
  userId: string;
  reservationId: string;
  status: Extract<AiReservationStatusValue, 'consumed' | 'released'>;
  callId?: string | null;
  at: Date;
}

const settleSchema = z.object({
  userId: uuidSchema,
  reservationId: uuidSchema,
  status: z.enum(['consumed', 'released']),
  callId: uuidSchema.nullish(),
  at: z.date(),
});

/** ET-2 — closes a lease once: consumed with its journal row, or released after a failed call. */
export async function settleBudgetReservation(
  tx: DbTx,
  input: SettleBudgetInput,
): Promise<AiBudgetReservation | null> {
  const value = parse(settleSchema, input, 'settlement');
  const [row] = await tx
    .update(aiBudgetReservations)
    .set({
      status: value.status,
      callId: value.callId ?? null,
      consumedAt: value.at,
    })
    .where(
      and(
        eq(aiBudgetReservations.id, value.reservationId),
        eq(aiBudgetReservations.userId, value.userId),
        eq(aiBudgetReservations.status, 'reserved'),
      ),
    )
    .returning();
  return row ?? null;
}

/** ET-2, reprise idempotente — reads a lease and the journal row that may already have consumed it. */
export async function getBudgetReservation(
  tx: DbTx,
  input: { userId: string; reservationId: string },
): Promise<AiBudgetReservation | null> {
  const userId = parse(uuidSchema, input.userId, 'userId');
  const reservationId = parse(uuidSchema, input.reservationId, 'reservationId');
  const [row] = await tx
    .select()
    .from(aiBudgetReservations)
    .where(and(eq(aiBudgetReservations.id, reservationId), eq(aiBudgetReservations.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Test and demonstration helper: the leases of one learner, newest first. */
export async function listBudgetReservations(
  tx: DbTx,
  input: { userId: string; limit?: number },
): Promise<AiBudgetReservation[]> {
  const userId = parse(uuidSchema, input.userId, 'userId');
  const limit = parse(z.int().min(1).max(100).default(20), input.limit ?? 20, 'limit');
  return tx
    .select()
    .from(aiBudgetReservations)
    .where(eq(aiBudgetReservations.userId, userId))
    .orderBy(sql`${aiBudgetReservations.createdAt} desc`)
    .limit(limit);
}

export { fromMicros, micros };
