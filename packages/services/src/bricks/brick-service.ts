// Application service of the brick lifecycle (SPEC-501 ET-8, EF-1 to EF-7). The pure package owns
// schemas, checks, references and fingerprints; this module only reads locked rows, opens one user
// transaction and writes immutable versions. A reported brick never enters a new activity; a
// correction resolves every open report and makes the brick active again (BR-BRI-06).
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import {
  parseBrickPayload,
  toPublicBrick,
  validateBrick,
  type BrickDraft,
  type BrickIssue,
  type BrickPublic,
  type BrickType,
} from '@learny/bricks';
import { AppError, type Result } from '@learny/core';
import { bricks, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { DbBrickReferenceResolver } from './reference-resolver';

export const activeBricksFilter: SQL = sql`${bricks.status} = 'active'`;

const createdBySchema = z.enum(['tutor', 'learner', 'import']);
const versionAuthorSchema = z.enum(['tutor', 'learner']);
const reasonSchema = z.string().trim().min(1).max(500);
const expectedVersionSchema = z.number().int().min(1);
const brickIdSchema = z.uuid();

export interface CreatedBrick {
  brickId: string;
  versionId: string;
  version: 1;
  fingerprint: string | null;
}

export interface CreatedVersion {
  brickId: string;
  version: number;
  versionId: string;
  fingerprint: string | null;
}

export interface ReportBrickResult {
  reportId: string;
  status: 'open';
  /** False when an open report of the same learner already existed (EF-3 answers 200 then). */
  created: boolean;
}

interface BrickRow {
  [key: string]: unknown;
  id: string;
  type: BrickType;
  notionIds: string[];
  purpose: BrickDraft['purpose'];
  status: 'active' | 'reported' | 'retired';
  currentVersion: number;
  formationId: string;
  origin: BrickDraft['origin'];
}

function validationError(error: z.ZodError, field: string): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    errors: error.issues.map((issue) => ({
      path: [field, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error, field);
  return parsed.data;
}

function brickInvalid(issues: readonly BrickIssue[]): AppError {
  return new AppError('BRICK_INVALID', 'La brique est invalide.', {
    errors: issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    })),
  });
}

async function assertFormation(tx: DbTx, userId: string, formationId: string): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.formations
    where id = ${formationId}::uuid and owner_id = ${userId}::uuid
  `);
  if (rows[0] === undefined) {
    throw new AppError('NOT_FOUND', 'Formation introuvable.');
  }
}

async function lockedBrick(tx: DbTx, brickId: string): Promise<BrickRow | undefined> {
  const rows = await tx.execute<BrickRow>(sql`
    select
      b.id::text as "id",
      b.type::text as "type",
      b.notion_ids::text[] as "notionIds",
      b.purpose::text as "purpose",
      b.status::text as "status",
      b.current_version as "currentVersion",
      b.formation_id::text as "formationId",
      v.origin::text as "origin"
    from public.bricks b
    join public.brick_versions v
      on v.brick_id = b.id and v.version = b.current_version
    where b.id = ${brickId}::uuid
    for update of b
  `);
  return rows[0];
}

async function insertVersion(
  tx: DbTx,
  input: {
    brickId: string;
    version: number;
    payload: unknown;
    fingerprint: string | null;
    origin: BrickDraft['origin'];
    createdBy: 'tutor' | 'learner' | 'import';
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.brick_versions (
      brick_id, version, payload, fingerprint, origin, created_by
    ) values (
      ${input.brickId}::uuid,
      ${input.version},
      ${JSON.stringify(input.payload)}::jsonb,
      ${input.fingerprint},
      ${input.origin},
      ${input.createdBy}
    )
    returning id::text as id
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Version de brique non créée.');
  return row.id;
}

function draftOf(
  brick: BrickRow,
  payload: unknown,
  origin: BrickDraft['origin'] = brick.origin,
): BrickDraft {
  return {
    type: brick.type,
    formationId: brick.formationId,
    purpose: brick.purpose,
    notionIds: brick.notionIds,
    origin,
    payload,
  };
}

/** EF-1 — validates then inserts the brick and its version 1 in one user transaction. */
export async function createBrick(
  ctx: ServiceContext,
  input: BrickDraft & { createdBy: 'tutor' | 'learner' | 'import' },
): Promise<Result<CreatedBrick>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const createdBy = parseOrThrow(createdBySchema, input.createdBy, 'createdBy');
    const draft: BrickDraft = {
      type: input.type,
      formationId: input.formationId,
      purpose: input.purpose,
      notionIds: input.notionIds,
      origin: input.origin,
      payload: input.payload,
    };
    return db.run(async (tx) => {
      await assertFormation(tx, userId, draft.formationId);
      const resolver = new DbBrickReferenceResolver(tx, userId, draft.formationId);
      const valid = await validateBrick(draft, resolver);
      if (!valid.ok) throw brickInvalid(valid.error);

      const rows = await tx.execute<{ id: string }>(sql`
        insert into public.bricks (
          owner_id, formation_id, type, notion_ids, purpose, status, current_version
        ) values (
          ${userId}::uuid,
          ${draft.formationId}::uuid,
          ${draft.type},
          ${`{${valid.value.notionIds.join(',')}}`}::uuid[],
          ${draft.purpose},
          'active',
          1
        )
        returning id::text as id
      `);
      const brick = rows[0];
      if (brick === undefined) throw new AppError('INTERNAL_ERROR', 'Brique non créée.');

      const versionId = await insertVersion(tx, {
        brickId: brick.id,
        version: 1,
        payload: valid.value.payload,
        fingerprint: valid.value.fingerprint,
        origin: valid.value.origin,
        createdBy,
      });
      return {
        brickId: brick.id,
        versionId,
        version: 1 as const,
        fingerprint: valid.value.fingerprint,
      };
    });
  });
}

/** EF-2, EF-4, EF-5 — creates the next immutable version and resolves every open report. */
export async function createBrickVersion(
  ctx: ServiceContext,
  brickId: string,
  input: {
    payload: unknown;
    expectedVersion: number;
    createdBy: 'tutor' | 'learner';
  },
): Promise<Result<CreatedVersion>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = parseOrThrow(brickIdSchema, brickId, 'brickId');
    const expectedVersion = parseOrThrow(
      expectedVersionSchema,
      input.expectedVersion,
      'expectedVersion',
    );
    const createdBy = parseOrThrow(versionAuthorSchema, input.createdBy, 'createdBy');

    return db.run(async (tx) => {
      const brick = await lockedBrick(tx, id);
      if (brick === undefined) throw new AppError('NOT_FOUND', 'Brique introuvable.');
      if (brick.status === 'retired') {
        throw new AppError('BRICK_RETIRED', 'Cette brique a été retirée.');
      }
      if (brick.currentVersion !== expectedVersion) {
        throw new AppError(
          'CONFLICT',
          `Version obsolète : la brique est en version ${String(brick.currentVersion)}.`,
        );
      }

      const resolver = new DbBrickReferenceResolver(tx, userId, brick.formationId);
      const valid = await validateBrick(draftOf(brick, input.payload), resolver);
      if (!valid.ok) throw brickInvalid(valid.error);

      const nextVersion = brick.currentVersion + 1;
      const versionId = await insertVersion(tx, {
        brickId: brick.id,
        version: nextVersion,
        payload: valid.value.payload,
        fingerprint: valid.value.fingerprint,
        origin: valid.value.origin,
        createdBy,
      });

      const updated = await tx.execute<{ id: string }>(sql`
        update public.bricks
        set current_version = ${nextVersion}, status = 'active'
        where id = ${brick.id}::uuid and current_version = ${expectedVersion}
        returning id::text as id
      `);
      if (updated[0] === undefined) {
        throw new AppError('CONFLICT', 'La brique a été modifiée entre-temps.');
      }

      await tx.execute(sql`
        update public.brick_reports
        set
          status = 'corrected',
          resolution = ${JSON.stringify({ by: createdBy, versionId })}::jsonb,
          resolved_at = ${ctx.clock.now().toISOString()}
        where brick_id = ${brick.id}::uuid and status = 'open'
      `);

      return {
        brickId: brick.id,
        version: nextVersion,
        versionId,
        fingerprint: valid.value.fingerprint,
      };
    });
  });
}

/** EF-4 — learner correction: same validation as the tutor, `created_by = 'learner'`. */
export async function correctBrick(
  ctx: ServiceContext,
  brickId: string,
  input: { payload: unknown; expectedVersion: number },
): Promise<Result<CreatedVersion>> {
  return createBrickVersion(ctx, brickId, { ...input, createdBy: 'learner' });
}

/** EF-3 — reports the current version and excludes the brick from draws until correction. */
export async function reportBrick(
  ctx: ServiceContext,
  brickId: string,
  input: { reason: string },
): Promise<Result<ReportBrickResult>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = parseOrThrow(brickIdSchema, brickId, 'brickId');
    const reason = parseOrThrow(reasonSchema, input.reason, 'reason');

    return db.run(async (tx) => {
      const brick = await lockedBrick(tx, id);
      if (brick === undefined) throw new AppError('NOT_FOUND', 'Brique introuvable.');
      if (brick.status === 'retired') {
        throw new AppError('BRICK_RETIRED', 'Cette brique a été retirée.');
      }

      const existing = await tx.execute<{ id: string }>(sql`
        select id::text as id
        from public.brick_reports
        where user_id = ${userId}::uuid
          and brick_id = ${brick.id}::uuid
          and status = 'open'
        order by created_at asc
        limit 1
        for update
      `);
      const open = existing[0];
      if (open !== undefined) {
        return { reportId: open.id, status: 'open' as const, created: false };
      }

      const versionRows = await tx.execute<{ id: string }>(sql`
        select id::text as id
        from public.brick_versions
        where brick_id = ${brick.id}::uuid and version = ${brick.currentVersion}
      `);
      const version = versionRows[0];
      if (version === undefined) {
        throw new AppError('INTERNAL_ERROR', 'Version courante de la brique introuvable.');
      }

      const reportRows = await tx.execute<{ id: string }>(sql`
        insert into public.brick_reports (
          user_id, brick_id, brick_version_id, reason, status
        ) values (
          ${userId}::uuid,
          ${brick.id}::uuid,
          ${version.id}::uuid,
          ${reason},
          'open'
        )
        returning id::text as id
      `);
      const report = reportRows[0];
      if (report === undefined) throw new AppError('INTERNAL_ERROR', 'Signalement non créé.');

      await tx.execute(sql`
        update public.bricks set status = 'reported' where id = ${brick.id}::uuid
      `);
      return { reportId: report.id, status: 'open' as const, created: true };
    });
  });
}

/** EF-7 — a retired brick leaves every draw. */
export async function retireBrick(ctx: ServiceContext, brickId: string): Promise<Result<void>> {
  return toResult(async () => {
    const { db } = requireUser(ctx);
    const id = parseOrThrow(brickIdSchema, brickId, 'brickId');
    return db.run(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        update public.bricks set status = 'retired'
        where id = ${id}::uuid
        returning id::text as id
      `);
      if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Brique introuvable.');
    });
  });
}

/** EF-6 — public charge of one owned version, never a stored payload raw. */
export async function getPublicBrick(
  ctx: ServiceContext,
  versionId: string,
): Promise<Result<BrickPublic>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = parseOrThrow(z.uuid(), versionId, 'versionId');
    return db.run(async (tx) => {
      const rows = await tx.execute<{
        brickId: string;
        versionId: string;
        type: BrickType;
        notionIds: string[];
        payload: unknown;
      }>(sql`
        select
          b.id::text as "brickId",
          v.id::text as "versionId",
          b.type::text as "type",
          b.notion_ids::text[] as "notionIds",
          v.payload as "payload"
        from public.brick_versions v
        join public.bricks b on b.id = v.brick_id
        where v.id = ${id}::uuid and b.owner_id = ${userId}::uuid
      `);
      const row = rows[0];
      if (row === undefined) throw new AppError('NOT_FOUND', 'Version de brique introuvable.');
      const parsed = parseBrickPayload(row.type, row.payload);
      if (!parsed.ok) {
        throw new AppError('INTERNAL_ERROR', 'La charge stockée de la brique est invalide.');
      }
      return toPublicBrick({
        brickId: row.brickId,
        versionId: row.versionId,
        type: row.type,
        notionIds: row.notionIds,
        payload: parsed.value,
      });
    });
  });
}
