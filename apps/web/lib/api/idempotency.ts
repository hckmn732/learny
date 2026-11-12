// Idempotent POST (SPEC-201 ET-4, ADR-0120, ADR-0219). The reservation is committed before the
// service runs, so a concurrent request with the same key sees it (409 while in progress).
import { AppError, clock } from '@learny/core';
import {
  completeIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
  serviceDb,
} from '@learny/db';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type IdempotencyStart =
  { state: 'reserved' } | { state: 'replayed'; statusCode: number; response: unknown };

export interface IdempotencyTarget {
  userId: string;
  key: string;
  method: string;
  path: string;
  params: unknown;
  body: unknown;
}

export function readIdempotencyKey(header: string | null): string {
  if (header === null || !IDEMPOTENCY_KEY_PATTERN.test(header)) {
    throw new AppError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'L’en-tête Idempotency-Key est obligatoire (8 à 128 caractères : lettres, chiffres, - et _).',
    );
  }
  return header;
}

export async function beginIdempotency(target: IdempotencyTarget): Promise<IdempotencyStart> {
  try {
    const reservation = await serviceDb().transaction((tx) =>
      reserveIdempotencyKey(tx, {
        userId: target.userId,
        key: target.key,
        method: target.method,
        route: target.path,
        params: target.params,
        body: target.body,
        now: clock.now(),
      }),
    );
    if (reservation.state === 'reserved') return { state: 'reserved' };
    return {
      state: 'replayed',
      statusCode: reservation.statusCode,
      response: reservation.response,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'IDEMPOTENCY_IN_PROGRESS') {
      throw new AppError(error.code, error.detail, { status: 409, retryAfterSec: 1 });
    }
    throw error;
  }
}

/** Success or 4xx: the answer is kept for replays during 24 h. */
export async function finishIdempotency(
  target: Pick<IdempotencyTarget, 'userId' | 'key'>,
  statusCode: number,
  response: unknown,
): Promise<void> {
  await serviceDb().transaction((tx) =>
    completeIdempotencyKey(tx, {
      userId: target.userId,
      key: target.key,
      statusCode,
      response,
      completedAt: clock.now(),
    }),
  );
}

/** 5xx or exception: the reservation is removed so the client can retry (CL-3). */
export async function releaseIdempotency(
  target: Pick<IdempotencyTarget, 'userId' | 'key'>,
): Promise<void> {
  await serviceDb().transaction((tx) =>
    releaseIdempotencyKey(tx, { userId: target.userId, key: target.key }),
  );
}
