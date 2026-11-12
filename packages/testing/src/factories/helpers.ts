// Shared guards of the SPEC-115 factories (docs/engineering/testing.md §3, ADR-0250).
//
// A factory never inserts a row whose `owner_id` contradicts the formation: the owner is the
// formation owner or an active member of its group. Duplicate identifiers fail explicitly and
// never overwrite an existing row (CL-7). Callers run the factories inside `withRollback` or with
// unique suffixes.
import { randomBytes } from 'node:crypto';

import { clock } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

export interface IdRow extends Record<string, unknown> {
  id: string;
}

export interface OwnedFormationRow {
  id: string;
  owner_id: string;
}

/** The fixed test clock, never the real time (ADR-0047). */
export function now(): Date {
  return clock.now();
}

export function suffix(): string {
  return randomBytes(4).toString('hex');
}

export function uniqueEmail(prefix = 'factory'): string {
  return `${prefix}-${suffix()}@test.learny.test`;
}

export function uniqueInviteCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  const bytes = randomBytes(4);
  let code = 'LRN-';
  for (const byte of bytes) code += alphabet.charAt(byte % alphabet.length);
  return code;
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  if ('cause' in error) return errorCode(error.cause);
  return '';
}

export function factoryError(entity: string, error: unknown): Error {
  const code = errorCode(error);
  if (code === '23505') {
    return new Error(
      `Fabrique ${entity} : identifiant déjà utilisé, aucune écriture écrasée (CL-7).`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Executes an insert and translates duplicate identifiers into an explicit factory error. */
export async function insert<R extends Record<string, unknown>>(
  tx: DbTx,
  entity: string,
  query: ReturnType<typeof sql>,
): Promise<R[]> {
  try {
    return (await tx.execute(query)) as unknown as R[];
  } catch (error) {
    throw factoryError(entity, error);
  }
}

export async function formationOwner(tx: DbTx, formationId: string): Promise<string> {
  const rows = await tx.execute<{ owner_id: string }>(
    sql`select owner_id::text as owner_id from public.formations where id = ${formationId}::uuid`,
  );
  const owner = rows[0]?.owner_id;
  if (owner === undefined) throw new Error(`Fabrique : formation inconnue (${formationId}).`);
  return owner;
}

/**
 * The user may write personal rows of a formation when they own it or belong to its active group;
 * `formations.group_id` is the shared-programme link (SPEC-111, BR-GRP-03).
 */
export async function assertFormationAccess(
  tx: DbTx,
  formationId: string,
  userId: string,
): Promise<void> {
  const owner = await formationOwner(tx, formationId);
  if (owner === userId) return;
  const rows = await tx.execute<{ allowed: boolean }>(sql`
    select exists (
      select 1
      from public.formations f
      join public.group_members m on m.group_id = f.group_id
      where f.id = ${formationId}::uuid
        and m.user_id = ${userId}::uuid
        and m.left_at is null
    ) as allowed
  `);
  if (rows[0]?.allowed !== true) {
    throw new Error(
      `Fabrique : owner_id incohérent avec la formation (${userId} n’est ni propriétaire ni membre).`,
    );
  }
}

export async function assertModuleBelongsTo(
  tx: DbTx,
  moduleId: string,
  formationId: string,
): Promise<void> {
  const rows = await tx.execute<{ ok: boolean }>(
    sql`select exists (
      select 1 from public.modules
      where id = ${moduleId}::uuid and formation_id = ${formationId}::uuid
    ) as ok`,
  );
  if (rows[0]?.ok !== true) {
    throw new Error(`Fabrique : le module ${moduleId} n’appartient pas à la formation.`);
  }
}

export async function assertChapterBelongsTo(
  tx: DbTx,
  chapterId: string,
  moduleId: string,
  formationId: string,
): Promise<void> {
  const rows = await tx.execute<{ ok: boolean }>(
    sql`select exists (
      select 1 from public.chapters
      where id = ${chapterId}::uuid
        and module_id = ${moduleId}::uuid
        and formation_id = ${formationId}::uuid
    ) as ok`,
  );
  if (rows[0]?.ok !== true) {
    throw new Error(`Fabrique : le chapitre ${chapterId} n’appartient pas au module.`);
  }
}

export async function assertNotionsBelongTo(
  tx: DbTx,
  notionIds: readonly string[],
  formationId: string,
): Promise<void> {
  if (notionIds.length === 0) return;
  const values = `{${notionIds.join(',')}}`;
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notions
        where formation_id = ${formationId}::uuid
          and id = any(${values}::uuid[])`,
  );
  if ((rows[0]?.count ?? 0) !== notionIds.length) {
    throw new Error('Fabrique : une notion n’appartient pas à la formation.');
  }
}
