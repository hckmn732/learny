// Repositories of the personal-data tables (SPEC-112 EF-1, EF-2, CL-1, CL-2).
//
// `data_exports` and `legal_acceptances` are written by the export service (SPEC-211) and read by
// the account page. They take the caller's transaction, so a job commits the row and its state in
// one statement. The downloadability rule is the pure `isDataExportDownloadable` helper: an expired
// export stays visible for audit but no signed URL is ever issued (CL-2). Legal acceptances are
// append-only: accepting the same document version twice returns the first row untouched (CL-1).
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  LEGAL_DOCUMENTS,
  dataExports,
  isDataExportDownloadable,
  legalAcceptances,
  type DataExport,
  type LegalAcceptance,
  type LegalDocument,
} from '../schema/privacy-search';

const uuidSchema = z.uuid();
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});
const exportStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);
const storagePathSchema = z.string().min(1).max(1024);
const sizeBytesSchema = z.int().min(0);
const versionSchema = z.string().min(1).max(40);
const documentSchema = z.enum(LEGAL_DOCUMENTS);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const exportErrorSchema = z.string().min(1).max(2000);

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

export interface CreateDataExportInput {
  userId: string;
  status?: z.infer<typeof exportStatusSchema>;
  storagePath?: string | null;
  expiresAt?: Date | null;
  sizeBytes?: number | null;
  requestedOn?: string | null;
  createdAt?: Date;
}

/** EF-1 — creates the private export job of one learner. */
export async function createDataExport(
  tx: DbTx,
  input: CreateDataExportInput,
): Promise<DataExport> {
  const userId = identifier(input.userId, 'userId');
  const status = parse(exportStatusSchema, input.status ?? 'queued', 'status');
  const storagePath =
    input.storagePath === undefined || input.storagePath === null
      ? null
      : parse(storagePathSchema, input.storagePath, 'storagePath');
  const expiresAt =
    input.expiresAt === undefined || input.expiresAt === null
      ? null
      : parse(instantSchema, input.expiresAt, 'expiresAt');
  const sizeBytes =
    input.sizeBytes === undefined || input.sizeBytes === null
      ? null
      : parse(sizeBytesSchema, input.sizeBytes, 'sizeBytes');
  const createdAt =
    input.createdAt === undefined ? undefined : parse(instantSchema, input.createdAt, 'createdAt');
  const requestedOn =
    input.requestedOn === undefined || input.requestedOn === null
      ? null
      : parse(daySchema, input.requestedOn, 'requestedOn');

  const [row] = await tx
    .insert(dataExports)
    .values({
      userId,
      status,
      storagePath,
      expiresAt,
      sizeBytes,
      requestedOn,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .returning();
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Export non créé.');
  return row;
}

export interface CompleteDataExportInput {
  userId: string;
  exportId: string;
  storagePath: string;
  sizeBytes: number;
  expiresAt: Date;
}

/** EF-1 — marks a job done with its private path, size and seven-day expiration. */
export async function completeDataExport(
  tx: DbTx,
  input: CompleteDataExportInput,
): Promise<DataExport> {
  const userId = identifier(input.userId, 'userId');
  const exportId = identifier(input.exportId, 'exportId');
  const storagePath = parse(storagePathSchema, input.storagePath, 'storagePath');
  const sizeBytes = parse(sizeBytesSchema, input.sizeBytes, 'sizeBytes');
  const expiresAt = parse(instantSchema, input.expiresAt, 'expiresAt');

  const [row] = await tx
    .update(dataExports)
    .set({ status: 'done', storagePath, sizeBytes, expiresAt })
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
    .returning();
  if (row === undefined) {
    throw new AppError('NOT_FOUND', 'Export introuvable.');
  }
  return row;
}

/** EF-1, EF-4 — marks a job running once its first step starts (idempotent replay). */
export async function startDataExport(
  tx: DbTx,
  input: { userId: string; exportId: string },
): Promise<DataExport> {
  const userId = identifier(input.userId, 'userId');
  const exportId = identifier(input.exportId, 'exportId');
  const [row] = await tx
    .update(dataExports)
    .set({ status: 'running', error: null })
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
    .returning();
  if (row === undefined) throw new AppError('NOT_FOUND', 'Export introuvable.');
  return row;
}

/** EF-1, EF-4 — a failed job keeps its row for audit, without a download path. */
export async function failDataExport(
  tx: DbTx,
  input: { userId: string; exportId: string; error?: string },
): Promise<DataExport> {
  const userId = identifier(input.userId, 'userId');
  const exportId = identifier(input.exportId, 'exportId');
  const error = input.error === undefined ? null : parse(exportErrorSchema, input.error, 'error');
  const [row] = await tx
    .update(dataExports)
    .set({ status: 'failed', storagePath: null, expiresAt: null, error })
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
    .returning();
  if (row === undefined) throw new AppError('NOT_FOUND', 'Export introuvable.');
  return row;
}

/** EF-1 — exports of the owner created on one local civil day (daily limit). */
export async function countDataExportsOn(
  tx: DbTx,
  input: { userId: string; requestedOn: string },
): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const requestedOn = parse(daySchema, input.requestedOn, 'requestedOn');
  const rows = await tx
    .select({ id: dataExports.id })
    .from(dataExports)
    .where(and(eq(dataExports.userId, userId), eq(dataExports.requestedOn, requestedOn)));
  return rows.length;
}

/** EF-1, CL-1 — the export still being produced, if any (one job at a time). */
export async function findPendingDataExport(
  tx: DbTx,
  input: { userId: string },
): Promise<DataExport | null> {
  const userId = identifier(input.userId, 'userId');
  const [row] = await tx
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.userId, userId), sql`${dataExports.status} in ('queued', 'running')`))
    .orderBy(desc(dataExports.createdAt))
    .limit(1);
  return row ?? null;
}

/** EF-8 — removes one expired export row after its object was removed. */
export async function deleteDataExport(
  tx: DbTx,
  input: { userId: string; exportId: string },
): Promise<boolean> {
  const userId = identifier(input.userId, 'userId');
  const exportId = identifier(input.exportId, 'exportId');
  const removed = await tx
    .delete(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
    .returning({ id: dataExports.id });
  return removed.length > 0;
}

/** EF-8 — exports expired for more than the grace period, oldest first. */
export async function listExpiredDataExports(
  tx: DbTx,
  input: { before: Date; limit?: number },
): Promise<DataExport[]> {
  const before = parse(instantSchema, input.before, 'before');
  const limit = parse(z.int().min(1).max(1000), input.limit ?? 200, 'limit');
  return tx
    .select()
    .from(dataExports)
    .where(
      and(
        sql`${dataExports.expiresAt} is not null`,
        sql`${dataExports.expiresAt} < ${before.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(dataExports.expiresAt)
    .limit(limit);
}

/** EF-1 — reads one export; another learner's identifier yields `null` under `userDb`. */
export async function getDataExport(
  tx: DbTx,
  input: { userId: string; exportId: string },
): Promise<DataExport | null> {
  const userId = identifier(input.userId, 'userId');
  const exportId = identifier(input.exportId, 'exportId');
  const rows = await tx
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)));
  return rows[0] ?? null;
}

/** EF-1 — the account page lists exports newest first. */
export async function listDataExports(
  tx: DbTx,
  input: { userId: string; limit?: number },
): Promise<DataExport[]> {
  const userId = identifier(input.userId, 'userId');
  const limit = parse(z.int().min(1).max(100), input.limit ?? 20, 'limit');
  return tx
    .select()
    .from(dataExports)
    .where(eq(dataExports.userId, userId))
    .orderBy(desc(dataExports.createdAt), desc(dataExports.id))
    .limit(limit);
}

/** EF-1, CL-2 — only a done, stored and unexpired export can issue a signed URL. */
export function canDownloadDataExport(record: DataExport, now: Date): boolean {
  return isDataExportDownloadable(
    { status: record.status, storagePath: record.storagePath, expiresAt: record.expiresAt },
    now,
  );
}

export interface RecordLegalAcceptanceInput {
  userId: string;
  document: LegalDocument;
  version: string;
  acceptedAt?: Date;
}

export interface RecordedLegalAcceptance {
  acceptance: LegalAcceptance;
  created: boolean;
}

/**
 * EF-2, CL-1 — records the acceptance of one document version once. A replay returns the original
 * row (and its original `accepted_at`); a new version inserts a new row without touching the past.
 */
export async function recordLegalAcceptance(
  tx: DbTx,
  input: RecordLegalAcceptanceInput,
): Promise<RecordedLegalAcceptance> {
  const userId = identifier(input.userId, 'userId');
  const document = parse(documentSchema, input.document, 'document');
  const version = parse(versionSchema, input.version, 'version');
  const acceptedAt =
    input.acceptedAt === undefined
      ? undefined
      : parse(instantSchema, input.acceptedAt, 'acceptedAt');

  const inserted = await tx
    .insert(legalAcceptances)
    .values({
      userId,
      document,
      version,
      ...(acceptedAt === undefined ? {} : { acceptedAt }),
    })
    .onConflictDoNothing({
      target: [legalAcceptances.userId, legalAcceptances.document, legalAcceptances.version],
    })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return { acceptance: created, created: true };

  const existing = await tx
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, userId),
        eq(legalAcceptances.document, document),
        eq(legalAcceptances.version, version),
      ),
    );
  const acceptance = existing[0];
  if (acceptance === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Acceptation introuvable après insertion.');
  }
  return { acceptance, created: false };
}

/** EF-2 — acceptance history, newest first. */
export async function listLegalAcceptances(
  tx: DbTx,
  input: { userId: string; document?: LegalDocument },
): Promise<LegalAcceptance[]> {
  const userId = identifier(input.userId, 'userId');
  const document =
    input.document === undefined ? undefined : parse(documentSchema, input.document, 'document');
  const where =
    document === undefined
      ? eq(legalAcceptances.userId, userId)
      : and(eq(legalAcceptances.userId, userId), eq(legalAcceptances.document, document));
  return tx
    .select()
    .from(legalAcceptances)
    .where(where)
    .orderBy(desc(legalAcceptances.acceptedAt), desc(legalAcceptances.id));
}

/** EF-2 — the latest accepted version of one document, or `null`. */
export async function latestLegalAcceptance(
  tx: DbTx,
  input: { userId: string; document: LegalDocument },
): Promise<LegalAcceptance | null> {
  const rows = await listLegalAcceptances(tx, input);
  return rows[0] ?? null;
}
