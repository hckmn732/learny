// Repositories of idempotency keys and rate-limit buckets (SPEC-112 EF-3, EF-4, CL-3, CL-4;
// ADR-0120, ADR-0219).
//
// The API wrapper of SPEC-201 reserves a key with `insert … on conflict do nothing` and completes
// it with the original response. A replay during 24 h returns that response; another route or
// another fingerprint is refused with 422 `IDEMPOTENCY_KEY_REUSED`; a still-running reservation
// raises 409 `IDEMPOTENCY_IN_PROGRESS` (CL-3). A 5xx or an exception releases the reservation so a
// retry is possible. The purge of SPEC-208 uses `deleteExpiredIdempotencyKeys`.
//
// `consumeRateLimit` is one SQL statement: the insert creates the bucket with `capacity - amount`
// tokens and a conflict subtracts only when enough tokens remain, so two concurrent consumptions
// are both counted and never lose a decrement (CL-4).
import { and, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  IDEMPOTENCY_VALIDITY_MS,
  canonicalJson,
  computeRequestHash,
  idempotencyKeySchema,
  idempotencyKeys,
  rateLimits,
  requestHashSchema,
  type IdempotencyKey,
} from '../schema/privacy-search';

const uuidSchema = z.uuid();
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});
const routeSchema = z.string().min(1).max(300);
const statusCodeSchema = z.int().min(200).max(499);
const methodSchema = z.string().min(1).max(20);
const bucketSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^(user|ip):[^:]+:.+$/, {
    message: 'un seau est « user:<id>:<route> » ou « ip:<hash>:<route> »',
  });
const capacitySchema = z.number().positive().max(1_000_000_000);
const amountSchema = z.number().positive().max(1_000_000_000);

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

export interface ReserveIdempotencyKeyInput {
  userId: string;
  key: string;
  method: string;
  route: string;
  params?: unknown;
  body?: unknown;
  /** Injected clock (ADR-0047); never read from the system inside this module. */
  now: Date;
  createdAt?: Date;
}

export type IdempotencyReservation =
  | { state: 'reserved'; record: IdempotencyKey }
  | { state: 'replayed'; record: IdempotencyKey; statusCode: number; response: unknown };

/**
 * EF-3, CL-3 — reserves a key for one request. The stale-row branch deletes the expired reservation
 * and retries once, so a client may reuse a key after the 24-hour validity window.
 */
export async function reserveIdempotencyKey(
  tx: DbTx,
  input: ReserveIdempotencyKeyInput,
): Promise<IdempotencyReservation> {
  const userId = identifier(input.userId, 'userId');
  const key = parse(idempotencyKeySchema, input.key, 'key');
  const route = parse(routeSchema, input.route, 'route');
  const method = parse(methodSchema, input.method, 'method');
  const now = parse(instantSchema, input.now, 'now');
  const createdAt =
    input.createdAt === undefined ? now : parse(instantSchema, input.createdAt, 'createdAt');
  const requestHash = computeRequestHash({
    method,
    route,
    params: input.params,
    body: input.body,
  });
  const threshold = new Date(now.getTime() - IDEMPOTENCY_VALIDITY_MS);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const inserted = await tx
      .insert(idempotencyKeys)
      .values({ userId, key, route, requestHash, statusCode: 0, createdAt })
      .onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.key] })
      .returning();
    const reserved = inserted[0];
    if (reserved !== undefined) return { state: 'reserved', record: reserved };

    const existing = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
    const record = existing[0];
    if (record === undefined) continue;

    if (record.createdAt.getTime() < threshold.getTime()) {
      await tx
        .delete(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(idempotencyKeys.key, key),
            lt(idempotencyKeys.createdAt, threshold),
          ),
        );
      continue;
    }

    if (record.route !== route || record.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'Cette clé d’idempotence a déjà servi pour une autre requête.',
        { status: 422 },
      );
    }

    if (record.statusCode === 0 || record.completedAt === null) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'La requête initiale est encore en cours.', {
        status: 409,
      });
    }

    return {
      state: 'replayed',
      record,
      statusCode: record.statusCode,
      response: record.response,
    };
  }

  throw new AppError('INTERNAL_ERROR', 'Réservation d’idempotence introuvable.');
}

export interface CompleteIdempotencyKeyInput {
  userId: string;
  key: string;
  statusCode: number;
  response: unknown;
  completedAt: Date;
}

/** EF-3, CL-3 — stores the original response and its HTTP status once. */
export async function completeIdempotencyKey(
  tx: DbTx,
  input: CompleteIdempotencyKeyInput,
): Promise<IdempotencyKey> {
  const userId = identifier(input.userId, 'userId');
  const key = parse(idempotencyKeySchema, input.key, 'key');
  const statusCode = parse(statusCodeSchema, input.statusCode, 'statusCode');
  const completedAt = parse(instantSchema, input.completedAt, 'completedAt');
  // Reject a response that JSON cannot represent before touching Postgres.
  canonicalJson(input.response ?? null);

  const [row] = await tx
    .update(idempotencyKeys)
    .set({ statusCode, response: input.response ?? null, completedAt })
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        eq(idempotencyKeys.statusCode, 0),
      ),
    )
    .returning();
  if (row === undefined) {
    throw new AppError('NOT_FOUND', 'Clé d’idempotence réservée introuvable.');
  }
  return row;
}

/** ADR-0120 — a 5xx or an exception removes the reservation, allowing a fresh attempt. */
export async function releaseIdempotencyKey(
  tx: DbTx,
  input: { userId: string; key: string },
): Promise<boolean> {
  const userId = identifier(input.userId, 'userId');
  const key = parse(idempotencyKeySchema, input.key, 'key');
  const deleted = await tx
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        eq(idempotencyKeys.statusCode, 0),
      ),
    )
    .returning();
  return deleted.length > 0;
}

/** ADR-0120, ADR-0219 — the hourly purge of SPEC-208 counts the removed rows. */
export async function deleteExpiredIdempotencyKeys(
  tx: DbTx,
  input: { before: Date },
): Promise<number> {
  const before = parse(instantSchema, input.before, 'before');
  const deleted = await tx
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, before))
    .returning();
  return deleted.length;
}

/** EF-3 — reads one reservation; another learner's identifier yields `null` under `userDb`. */
export async function getIdempotencyKey(
  tx: DbTx,
  input: { userId: string; key: string },
): Promise<IdempotencyKey | null> {
  const userId = identifier(input.userId, 'userId');
  const key = parse(idempotencyKeySchema, input.key, 'key');
  const rows = await tx
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  return rows[0] ?? null;
}

/** ET-1, ADR-0120 — the stored fingerprint must be a SHA-256 hexadecimal digest. */
export function assertRequestHash(value: string): string {
  return parse(requestHashSchema, value, 'requestHash');
}

export interface ConsumeRateLimitInput {
  bucket: string;
  /** Capacity used when the bucket is created. */
  capacity: number;
  amount?: number;
  now: Date;
}

export interface RateLimitConsumption {
  allowed: boolean;
  remaining: number;
}

interface TokensRow {
  tokens: string;
  [key: string]: unknown;
}

function tokensLiteral(value: number): string {
  return value.toFixed(4);
}

/**
 * EF-4, CL-4 — one atomic consumption. The `where` clause of the conflict update refuses to go
 * below zero, so a concurrent decrement either succeeds on the latest value or reports exhaustion.
 */
export async function consumeRateLimit(
  tx: DbTx,
  input: ConsumeRateLimitInput,
): Promise<RateLimitConsumption> {
  const bucket = parse(bucketSchema, input.bucket, 'bucket');
  const capacity = parse(capacitySchema, input.capacity, 'capacity');
  const amount = parse(amountSchema, input.amount ?? 1, 'amount');
  const now = parse(instantSchema, input.now, 'now');
  if (capacity < amount) return { allowed: false, remaining: capacity };

  const rows = await tx.execute<TokensRow>(sql`
    insert into public.rate_limits (bucket, tokens, updated_at)
    values (
      ${bucket},
      ${tokensLiteral(capacity - amount)}::numeric,
      ${now.toISOString()}::timestamptz
    )
    on conflict (bucket) do update
      set tokens = public.rate_limits.tokens - ${tokensLiteral(amount)}::numeric,
          updated_at = ${now.toISOString()}::timestamptz
      where public.rate_limits.tokens >= ${tokensLiteral(amount)}::numeric
    returning tokens::text as tokens
  `);
  const consumed = rows[0];
  if (consumed !== undefined) {
    return { allowed: true, remaining: Number(consumed.tokens) };
  }

  const current = await tx.execute<TokensRow>(sql`
    select tokens::text as tokens from public.rate_limits where bucket = ${bucket}
  `);
  return { allowed: false, remaining: Number(current[0]?.tokens ?? '0') };
}

/** EF-4 — sets a bucket to a known value (refill job of SPEC-208, tests). */
export async function upsertRateLimit(
  tx: DbTx,
  input: { bucket: string; tokens: number; now: Date },
): Promise<{ bucket: string; tokens: number }> {
  const bucket = parse(bucketSchema, input.bucket, 'bucket');
  const tokens = parse(capacitySchema, input.tokens, 'tokens');
  const now = parse(instantSchema, input.now, 'now');
  const [row] = await tx
    .insert(rateLimits)
    .values({ bucket, tokens: tokensLiteral(tokens), updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.bucket,
      set: { tokens: tokensLiteral(tokens), updatedAt: now },
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Seau non enregistré.');
  return { bucket: row.bucket, tokens: Number(row.tokens) };
}

/** EF-4 — removes buckets untouched since the given instant. */
export async function deleteStaleRateLimits(tx: DbTx, input: { before: Date }): Promise<number> {
  const before = parse(instantSchema, input.before, 'before');
  const deleted = await tx.delete(rateLimits).where(lt(rateLimits.updatedAt, before)).returning();
  return deleted.length;
}
