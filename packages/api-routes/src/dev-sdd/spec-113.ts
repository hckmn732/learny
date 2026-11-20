// Owner-role reads of the SPEC-113 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The catalogue is measured on the real local database; the three-user matrix is measured with
// real `authenticated` JWTs (`asUser`), never with the service role. Everything runs inside
// `withRollback`: no fixture survives the request and no private data is displayed (EF-7, §10).
import {
  categoryCounts,
  createGroup,
  joinGroup,
  RLS_MATRIX,
  sql,
  type DbTx,
  type RlsCategory,
} from '@learny/db';
import { asUser, createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';

function codeSource(code: string) {
  const suffix = code.slice(4);
  let cursor = 0;
  return () => ALPHABET.indexOf(suffix[cursor++] ?? 'A');
}

export type Spec113ProbeKey =
  | 'programme-read'
  | 'programme-write'
  | 'resources-read'
  | 'progress-read'
  | 'projection-read'
  | 'service-read'
  | 'settings-read';

export interface Spec113MatrixRow {
  key: Spec113ProbeKey;
  category: RlsCategory;
  cells: { a: boolean; b: boolean; c: boolean };
}

export interface Spec113Data {
  tableCount: number;
  rlsCount: number;
  forcedCount: number;
  policyCount: number;
  categories: Array<{ category: RlsCategory; count: number }>;
  matrix: Spec113MatrixRow[];
}

async function readAs(
  tx: DbTx,
  userId: string,
  table: string,
  column: string,
  value: string,
): Promise<boolean> {
  try {
    return await asUser(tx, userId, async (inner) => {
      const rows = await inner.execute<{ count: number }>(sql`
        select count(*)::int as count
        from ${sql.raw(`public.${table}`)}
        where ${sql.raw(column)} = ${value}::uuid
      `);
      return (rows[0]?.count ?? 0) > 0;
    });
  } catch {
    return false;
  }
}

async function writeChapterAs(tx: DbTx, userId: string, chapterId: string): Promise<boolean> {
  try {
    return await asUser(tx, userId, async (inner) => {
      const rows = await inner.execute<{ id: string }>(sql`
        update public.chapters set title = title
        where id = ${chapterId}::uuid
        returning id::text as id
      `);
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/** Full demonstration payload; every fixture is rolled back at the end of the request. */
export async function loadSpec113Demo(): Promise<Spec113Data> {
  return withRollback(async (tx) => {
    const a = await createTestUser(tx, { firstName: 'Alice' });
    const b = await createTestUser(tx, { firstName: 'Bob' });
    const c = await createTestUser(tx, { firstName: 'Carol' });
    const programme = await createTestProgramme(tx, a.id, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Programme de démonstration RLS',
    });
    const [moduleId, chapterId] = [programme.moduleIds[0], programme.chapterIds[0]];
    if (moduleId === undefined || chapterId === undefined) {
      throw new Error('programme de démonstration incomplet');
    }
    const group = await createGroup(tx, {
      formationId: programme.formationId,
      ownerId: a.id,
      now: FIXED,
      random: codeSource('LRN-RL34'),
    });
    await joinGroup(tx, { inviteCode: group.inviteCode, userId: b.id, now: FIXED });

    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${a.id}::uuid, ${moduleId}::uuid, 'open')
    `);
    await tx.execute(sql`
      insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'note', 'Note privée de A', 'Contenu privé de A'
      )
    `);
    await tx.execute(sql`
      insert into public.idempotency_keys (user_id, key, route, request_hash)
      values (${a.id}::uuid, 'demo-rls-0001', '/api/v1/rls', ${'a'.repeat(64)})
    `);

    const tables = await tx.execute<{ rls: boolean; forced: boolean }>(sql`
      select c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    const policies = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count from pg_catalog.pg_policies where schemaname = 'public'
    `);

    const matrix: Spec113MatrixRow[] = [
      {
        key: 'programme-read',
        category: 'shared-programme',
        cells: {
          a: await readAs(tx, a.id, 'formations', 'id', programme.formationId),
          b: await readAs(tx, b.id, 'formations', 'id', programme.formationId),
          c: await readAs(tx, c.id, 'formations', 'id', programme.formationId),
        },
      },
      {
        key: 'programme-write',
        category: 'shared-programme',
        cells: {
          a: await writeChapterAs(tx, a.id, chapterId),
          b: await writeChapterAs(tx, b.id, chapterId),
          c: await writeChapterAs(tx, c.id, chapterId),
        },
      },
      {
        key: 'resources-read',
        category: 'personal',
        cells: {
          a: await readAs(tx, a.id, 'resources', 'owner_id', a.id),
          b: await readAs(tx, b.id, 'resources', 'owner_id', a.id),
          c: await readAs(tx, c.id, 'resources', 'owner_id', a.id),
        },
      },
      {
        key: 'progress-read',
        category: 'personal',
        cells: {
          a: await readAs(tx, a.id, 'module_progress', 'user_id', a.id),
          b: await readAs(tx, b.id, 'module_progress', 'user_id', a.id),
          c: await readAs(tx, c.id, 'module_progress', 'user_id', a.id),
        },
      },
      {
        key: 'projection-read',
        category: 'shared-programme',
        cells: {
          a: await readAs(tx, a.id, 'group_member_progress', 'group_id', group.id),
          b: await readAs(tx, b.id, 'group_member_progress', 'group_id', group.id),
          c: await readAs(tx, c.id, 'group_member_progress', 'group_id', group.id),
        },
      },
      {
        key: 'service-read',
        category: 'service',
        cells: {
          a: await readAs(tx, a.id, 'idempotency_keys', 'user_id', a.id),
          b: await readAs(tx, b.id, 'idempotency_keys', 'user_id', a.id),
          c: await readAs(tx, c.id, 'idempotency_keys', 'user_id', a.id),
        },
      },
      {
        key: 'settings-read',
        category: 'personal',
        cells: {
          a: await readAs(tx, a.id, 'study_preferences', 'user_id', a.id),
          b: await readAs(tx, b.id, 'study_preferences', 'user_id', a.id),
          c: await readAs(tx, c.id, 'study_preferences', 'user_id', a.id),
        },
      },
    ];

    return {
      tableCount: tables.length,
      rlsCount: tables.filter((row) => row.rls).length,
      forcedCount: tables.filter((row) => row.forced).length,
      policyCount: policies[0]?.count ?? 0,
      categories: categoryCounts(RLS_MATRIX),
      matrix,
    };
  });
}
