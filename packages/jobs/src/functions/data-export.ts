// Personal-data export job (SPEC-211 EF-1 to EF-4, ET-2, ET-6, CL-1, CL-6, ADR-0216).
//
// Triggered by `account/export-requested`, emitted in the creation transaction. Five durable steps:
// `load`, `collect` (under RLS), `zip` (streamed to a temporary file), `upload` (upsert, so a crash
// at this step leaves exactly one final object) and `finalize` (fifteen-minute bound, expiration,
// e-mail, in-app notification). The job is idempotent on `exportId`.
import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import { AppError, type Clock, type LearnyLogger } from '@learny/core';
import { exportPath, schema, serviceDb } from '@learny/db';
import { notify } from '@learny/notifications';
import { sendEmail } from '@learny/notifications/email';

import type { JobContext } from '../context';
import { defineFunction } from '../define';
import { removeArchiveFile, writeArchiveFile } from '../personal-data/archive';
import { collectExportData } from '../personal-data/collect';
import { defaultExportDeps, type ExportDeps } from '../personal-data/deps';
import { formatLongDate, formatSizeLabel } from '../personal-data/zip-layout';

const { dataExports, profiles } = schema;

export const DATA_EXPORT_ID = 'data-export';
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPORT_TIMEOUT_MS = 15 * 60 * 1000;

export interface StepRunner {
  run<T>(id: string, body: () => Promise<T>): Promise<T>;
}

export interface DataExportRunArgs {
  ctx: JobContext & { clock: Clock };
  step: StepRunner;
  logger: LearnyLogger;
  userId: string;
  exportId: string;
}

export interface DataExportOutcome {
  status: 'done' | 'failed' | 'skipped';
  exportId: string;
  entries: string[];
  sizeBytes: number | null;
  expiresAt: string | null;
  error: string | null;
}

function boundedError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return `${name}: ${message}`.replace(/\s+/g, ' ').slice(0, 2000);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

async function markFailed(userId: string, exportId: string, error: unknown): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ status: dataExports.status })
      .from(dataExports)
      .where(eq(dataExports.id, exportId))
      .limit(1);
    if (row?.status === 'done') return;
    await tx
      .update(dataExports)
      .set({ status: 'failed', storagePath: null, expiresAt: null, error: boundedError(error) })
      .where(eq(dataExports.id, exportId));
  });
}

async function fileExists(path: string): Promise<boolean> {
  const { access } = await import('node:fs/promises');
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Runs the five steps on one export; exported for the integration suite and the demo page. */
export async function runDataExport(
  args: DataExportRunArgs,
  deps: ExportDeps = defaultExportDeps(),
): Promise<DataExportOutcome> {
  const { ctx, step, logger, userId, exportId } = args;
  try {
    const loaded = await step.run('load', async () => {
      const [row] = await ctx.sdb
        .select()
        .from(dataExports)
        .where(eq(dataExports.id, exportId))
        .limit(1);
      if (row === undefined || row.userId !== userId) {
        return { missing: true as const };
      }
      if (row.status === 'done' && row.storagePath !== null && row.sizeBytes !== null) {
        return {
          missing: false as const,
          done: true as const,
          createdAt: row.createdAt.toISOString(),
          sizeBytes: row.sizeBytes,
          expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
        };
      }
      await ctx.sdb
        .update(dataExports)
        .set({ status: 'running', error: null })
        .where(eq(dataExports.id, exportId));
      return {
        missing: false as const,
        done: false as const,
        createdAt: row.createdAt.toISOString(),
      };
    });
    if (loaded.missing) {
      return {
        status: 'skipped',
        exportId,
        entries: [],
        sizeBytes: null,
        expiresAt: null,
        error: 'export introuvable',
      };
    }
    if (loaded.done) {
      return {
        status: 'done',
        exportId,
        entries: [],
        sizeBytes: loaded.sizeBytes,
        expiresAt: loaded.expiresAt,
        error: null,
      };
    }

    const [profile] = await ctx.sdb
      .select({
        timezone: profiles.timezone,
        tutorTone: profiles.tutorTone,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    if (profile === undefined) {
      throw new AppError('NOT_FOUND', 'Profil introuvable.');
    }

    const collected = await step.run('collect', () => collectExportData(userId, ctx.clock.now()));

    const zipped = await step.run('zip', async () => {
      const written = await writeArchiveFile(collected.entries, deps.readObject);
      return {
        filePath: written.filePath,
        sizeBytes: written.sizeBytes,
        entries: written.entries,
      };
    });

    // A replay after a crash may run on another worker: the temporary file is gone, so the archive
    // is rebuilt from the collected model before the single upsert (CL-6).
    const uploaded = await step.run('upload', async () => {
      let filePath = zipped.filePath;
      let sizeBytes = zipped.sizeBytes;
      if (!(await fileExists(filePath))) {
        const rebuilt = await writeArchiveFile(collected.entries, deps.readObject);
        filePath = rebuilt.filePath;
        sizeBytes = rebuilt.sizeBytes;
      }
      const storagePath = exportPath(userId, exportId);
      await deps.uploader.upload({ bucket: 'exports', path: storagePath, filePath, sizeBytes });
      await removeArchiveFile(filePath);
      logger.info('export archive uploaded', {
        exportId,
        outcome: `size=${String(sizeBytes)}`,
      });
      return { storagePath, sizeBytes };
    });

    const now = ctx.clock.now();
    const createdAt = new Date(loaded.createdAt);
    if (now.getTime() - createdAt.getTime() > EXPORT_TIMEOUT_MS) {
      const error = new AppError('INTERNAL_ERROR', 'Export interrompu après quinze minutes.');
      await markFailed(userId, exportId, error);
      throw new NonRetriableError('export_timeout', { cause: error });
    }

    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS);
    await step.run('finalize', async () => {
      const [row] = await ctx.sdb
        .update(dataExports)
        .set({
          status: 'done',
          storagePath: uploaded.storagePath,
          sizeBytes: uploaded.sizeBytes,
          expiresAt,
          error: null,
        })
        .where(eq(dataExports.id, exportId))
        .returning();
      if (row === undefined) throw new AppError('NOT_FOUND', 'Export introuvable.');
      return { expiresAt: expiresAt.toISOString() };
    });

    await step.run('notify', async () => {
      const sizeLabel = formatSizeLabel(uploaded.sizeBytes);
      const expiresLabel = formatLongDate(expiresAt, profile.timezone);
      const result = await sendEmail(
        { sdb: ctx.sdb, clock: ctx.clock, logger },
        {
          userId,
          template: 'export_ready',
          props: {
            downloadUrl: `${appUrl()}/api/v1/me/exports/${exportId}?download=1`,
            sizeLabel,
            expiresLabel,
          },
          idempotencyKey: `export:${exportId}`,
          ...(profile.tutorTone === 'tu' ? { toneOverride: 'tu' as const } : {}),
        },
      );
      if (!result.ok) throw result.error;
      const notified = await notify(
        { requestId: ctx.requestId, sdb: ctx.sdb, clock: ctx.clock, logger },
        {
          userId,
          type: 'export_ready',
          data: { days: 7, href: `/parametres#profil` },
          dedupeKey: `export:${exportId}`,
        },
      );
      if (!notified.ok) throw notified.error;
      return { messageId: result.value.messageId };
    });

    return {
      status: 'done',
      exportId,
      entries: zipped.entries,
      sizeBytes: uploaded.sizeBytes,
      expiresAt: expiresAt.toISOString(),
      error: null,
    };
  } catch (error) {
    if (!(error instanceof NonRetriableError)) {
      await markFailed(userId, exportId, error);
    }
    throw error;
  }
}

export const dataExport = defineFunction(
  {
    id: DATA_EXPORT_ID,
    trigger: { event: 'account/export-requested' },
    idempotency: 'event.data.exportId',
    timeouts: { finish: '15m' },
  },
  async ({ event, step, ctx, logger }) =>
    runDataExport({
      ctx,
      step: step as unknown as StepRunner,
      logger,
      userId: event.data.userId,
      exportId: event.data.exportId,
    }),
);
