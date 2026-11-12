// Self-service export service (SPEC-211 EF-1, EF-2, ET-1, ET-3, CL-1, CL-2, CL-5; ADR-0044).
//
// The creation runs in one transaction with the outbox: a learner never ends up with a queued row
// and no event. The three-exports-a-day limit uses the learner's local civil day, and a job already
// queued or running is returned as is (double click: one job, one e-mail). Reads and the signed URL
// go through the owner's Row Level Security; another learner's identifier is a plain 404.
import { sql } from 'drizzle-orm';

import { AppError, userLocalDay, type Result } from '@learny/core';
import {
  SIGNED_URL_TTL_SECONDS,
  canDownloadDataExport,
  countDataExportsOn,
  createDataExport,
  findPendingDataExport,
  getDataExport,
  serviceDb,
  type DataExport,
  type StorageGateway,
} from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

export const EXPORT_DAILY_LIMIT = 3;
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPORT_LIMIT_MESSAGE =
  'Vous avez déjà demandé 3 exports aujourd’hui. Réessayez demain.';
export const EXPORT_EXPIRED_MESSAGE =
  'Cet export a expiré. Demandez-en un nouveau depuis Paramètres.';

export interface PersonalDataDeps {
  /** SPEC-114 Storage gateway; the export row was already checked under the owner's RLS. */
  gateway: StorageGateway;
  /** Short-lived token of the learner for the signed read URL. */
  accessToken(userId: string): string;
}

export interface ExportAccepted {
  exportId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
}

export interface ExportView {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  sizeBytes: number | null;
  createdAt: string;
  expiresAt: string | null;
  downloadUrl?: string;
}

async function profileZone(userId: string): Promise<string> {
  const rows = await serviceDb().execute<{ timezone: string }>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  const zone = rows[0]?.timezone;
  if (zone === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return zone;
}

/** EF-1, CL-1 — creates at most one queued export per learner and enqueues its job. */
export async function requestExport(ctx: ServiceContext): Promise<Result<ExportAccepted>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const timezone = await profileZone(userId);
    const today = userLocalDay(ctx.clock.now(), timezone);
    return withTransaction(serviceDb(), async (tx, outbox) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId})::bigint)`);
      const pending = await findPendingDataExport(tx, { userId });
      if (pending !== null) {
        return { exportId: pending.id, status: pending.status };
      }
      const used = await countDataExportsOn(tx, { userId, requestedOn: today });
      if (used >= EXPORT_DAILY_LIMIT) {
        throw new AppError('EXPORT_LIMIT_REACHED', EXPORT_LIMIT_MESSAGE);
      }
      const row = await createDataExport(tx, {
        userId,
        status: 'queued',
        requestedOn: today,
        createdAt: ctx.clock.now(),
      });
      outbox.add(
        'account/export-requested',
        { userId, exportId: row.id },
        { id: `account-export:${row.id}` },
      );
      return { exportId: row.id, status: 'queued' as const };
    });
  });
}

function viewOf(row: DataExport, downloadUrl?: string): ExportView {
  return {
    id: row.id,
    status: row.status,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    ...(downloadUrl === undefined ? {} : { downloadUrl }),
  };
}

async function signedUrl(
  ctx: ServiceContext,
  deps: PersonalDataDeps,
  userId: string,
  row: DataExport,
): Promise<string> {
  if (row.storagePath === null) {
    throw new AppError('NOT_FOUND', 'Export introuvable.');
  }
  // The ownership (and done/unexpired) check was made under the learner's RLS just above; the
  // gateway only signs the exact stored path for ten minutes (ADR-0058).
  return deps.gateway.signRead(
    'exports',
    row.storagePath,
    deps.accessToken(userId),
    SIGNED_URL_TTL_SECONDS,
  );
}

/**
 * EF-2, CL-4, CL-5 — owner-only state; a done and unexpired export gets a fresh ten-minute URL.
 * Reading an expired archive answers 410; another learner's identifier stays a 404.
 */
export async function getExport(
  ctx: ServiceContext,
  deps: PersonalDataDeps,
  exportId: string,
): Promise<Result<ExportView>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const row = await db.run((tx) => getDataExport(tx, { userId, exportId }));
    if (row === null) throw new AppError('NOT_FOUND', 'Export introuvable.');
    const now = ctx.clock.now();
    if (row.status === 'done' && !canDownloadDataExport(row, now)) {
      throw new AppError('EXPORT_EXPIRED', EXPORT_EXPIRED_MESSAGE);
    }
    if (!canDownloadDataExport(row, now)) return viewOf(row);
    return viewOf(row, await signedUrl(ctx, deps, userId, row));
  });
}

/** EF-2, CL-4 — `?download=1`: a fresh signed URL, or 410 once the archive expired. */
export async function downloadExport(
  ctx: ServiceContext,
  deps: PersonalDataDeps,
  exportId: string,
): Promise<Result<{ url: string }>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const row = await db.run((tx) => getDataExport(tx, { userId, exportId }));
    if (row === null) throw new AppError('NOT_FOUND', 'Export introuvable.');
    if (row.status === 'done' && !canDownloadDataExport(row, ctx.clock.now())) {
      throw new AppError('EXPORT_EXPIRED', EXPORT_EXPIRED_MESSAGE);
    }
    if (!canDownloadDataExport(row, ctx.clock.now())) {
      throw new AppError('NOT_FOUND', 'Export introuvable.');
    }
    return { url: await signedUrl(ctx, deps, userId, row) };
  });
}

/** Shared by the demonstration: the owner's e-mail, read with the service role. */
export async function exportOwnerEmail(userId: string): Promise<string | null> {
  const rows = await serviceDb().execute<{ email: string }>(sql`
    select email from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.email ?? null;
}
