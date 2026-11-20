// SPEC-805 CA-3, CL-4 — isolation of every private table and private file.
//
// Two real `authenticated` clients (A and B) are created inside one rolled-back transaction. B is
// a member of A's group: the shared programme is visible, but resources, courses, bricks, gaps,
// answers, keys and tutor conversations remain private. Signed storage URLs are refused before
// any signature for a foreign path.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  RLS_MATRIX,
  closeDb,
  createGroup,
  createReadUrl,
  joinGroup,
  listOwnedObjects,
  parseOwnedPath,
  resourcePath,
  serviceDb,
  sql,
  type StorageGateway,
  type StorageRuntime,
} from '@learny/db';
import {
  asUser,
  createTestCourse,
  createTestProgramme,
  createTestUser,
  withRollback,
  type TestProgramme,
  type TestUser,
} from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const FIXED_CLOCK = { now: () => FIXED };

function idOf(row: unknown): string {
  if (typeof row !== 'object' || row === null) throw new Error('identifiant absent');
  const id = (row as { id?: unknown }).id;
  if (typeof id !== 'string') throw new Error('identifiant absent');
  return id;
}

async function insertId(
  tx: Parameters<typeof createTestUser>[0],
  query: ReturnType<typeof sql>,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(query);
  return idOf(rows[0]);
}

interface Fixture {
  a: TestUser;
  b: TestUser;
  programme: TestProgramme;
  groupId: string;
  ids: Record<string, string>;
}

async function createFixture(tx: Parameters<typeof createTestUser>[0]): Promise<Fixture> {
  const a = await createTestUser(tx, { firstName: 'Alice' });
  const b = await createTestUser(tx, { firstName: 'Bob' });
  const programme = await createTestProgramme(tx, a.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
    title: 'Programme privé SPEC-805',
  });
  const group = await createGroup(tx, {
    formationId: programme.formationId,
    ownerId: a.id,
    now: FIXED,
    random: () => 5,
  });
  await joinGroup(tx, { inviteCode: group.inviteCode, userId: b.id, now: FIXED });
  const chapterId = programme.chapterIds[0];
  const notionId = programme.notionIds[0];
  if (chapterId === undefined || notionId === undefined) throw new Error('programme incomplet');
  const course = await createTestCourse(tx, {
    ownerId: a.id,
    moduleId: programme.moduleIds[0] as string,
    sectionsPerChapter: 1,
  });
  const sectionId = course.sectionIds[0];
  if (sectionId === undefined) throw new Error('section absente');

  const ids: Record<string, string> = {};
  const resourceId = randomUUID();
  const path = resourcePath(a.id, resourceId, 'apport-prive.pdf');
  ids.resources = await insertId(
    tx,
    sql`
      insert into public.resources (
        id, owner_id, formation_id, chapter_id, kind, title, storage_path, mime
      ) values (
        ${resourceId}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid,
        ${chapterId}::uuid, 'pdf', 'Apport privé', ${path}, 'application/pdf'
      ) returning id::text as id
    `,
  );
  ids.resource_chunks = await insertId(
    tx,
    sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location
      ) values (
        ${ids.resources}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid,
        ${chapterId}::uuid, 1, 'Passage privé', '{"charStart":0,"charEnd":13}'::jsonb
      ) returning id::text as id
    `,
  );
  ids.courses = course.courseId;
  ids.course_sections = sectionId;
  await tx.execute(
    sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
        success_count, in_review
      ) values (
        ${a.id}::uuid, ${notionId}::uuid,
        '{"due":"2026-11-12T12:20:00.000Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":1,"reps":1,"lapses":0,"state":2,"last_review":"2026-11-11T12:20:00.000Z"}'::jsonb,
        '2026-11-12T12:20:00Z'::timestamptz, 40,
        '2026-11-11T12:20:00Z'::timestamptz, '2026-11-11T12:20:00Z'::timestamptz,
        1, false
      )
    `,
  );
  ids.ai_credentials = await insertId(
    tx,
    sql`
      insert into public.ai_credentials (user_id, provider, label, encrypted_key, key_last4)
      values (${a.id}::uuid, 'anthropic', 'Clé privée', ${Buffer.from('0123456789abcdef0123456789abcdef')}, 'abcd')
      returning id::text as id
    `,
  );
  await tx.execute(
    sql`insert into public.ai_task_models (user_id, task, model_id) values (${a.id}::uuid, 'light', 'model-haiku')`,
  );
  ids.tutor_conversations = await insertId(
    tx,
    sql`
      insert into public.tutor_conversations (user_id, course_id, title)
      values (${a.id}::uuid, ${course.courseId}::uuid, 'Discussion privée')
      returning id::text as id
    `,
  );
  return { a, b, programme, groupId: group.id, ids };
}

const PRIVATE_PROBES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'resources', column: 'id' },
  { table: 'resource_chunks', column: 'id' },
  { table: 'courses', column: 'id' },
  { table: 'course_sections', column: 'id' },
  { table: 'notion_states', column: 'user_id' },
  { table: 'ai_credentials', column: 'id' },
  { table: 'tutor_conversations', column: 'id' },
];

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-805] RLS security', () => {
  it('CA-3 — toutes les tables publiques sont inventoriées avec leurs politiques', async () => {
    const tables = await serviceDb().execute<{ tablename: string }>(sql`
      select tablename from pg_catalog.pg_tables
      where schemaname = 'public' order by tablename
    `);
    const inventoried = new Set(RLS_MATRIX.map((entry) => entry.table));
    for (const table of tables) {
      expect(inventoried.has(table.tablename), `table non inventoriée : ${table.tablename}`).toBe(
        true,
      );
    }
    const policies = await serviceDb().execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_catalog.pg_policies
      where schemaname = 'public'
    `);
    const present = new Set(policies.map((row) => `${row.tablename}:${row.policyname}`));
    for (const entry of RLS_MATRIX) {
      expect(entry.nonMember, `${entry.table} doit refuser un non-membre`).toEqual({
        select: false,
        insert: false,
        update: false,
        delete: false,
      });
      for (const policy of entry.policies) {
        expect(present.has(`${entry.table}:${policy}`), `${entry.table}:${policy}`).toBe(true);
      }
    }
  });

  it('CA-3, CL-4 — B voit le programme partagé mais aucune donnée privée de A', async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const visible = await asUser(tx, fixture.b.id, async (inner) => {
        const rows = await inner.execute<{ formation: number; resources: number }>(sql`
          select
            (select count(*)::int from public.formations where id = ${fixture.programme.formationId}::uuid) as formation,
            (select count(*)::int from public.resources where owner_id = ${fixture.a.id}::uuid) as resources
        `);
        return rows[0];
      });
      expect(visible).toEqual({ formation: 1, resources: 0 });

      for (const probe of PRIVATE_PROBES) {
        const select = await asUser(tx, fixture.b.id, async (inner) => {
          const rows = await inner.execute<{ count: number }>(sql`
            select count(*)::int as count
            from ${sql.raw(`public.${probe.table}`)}
            where ${sql.raw(`${probe.column} = '${fixture.a.id}'`)}
          `);
          return rows[0]?.count ?? -1;
        });
        expect(select, `${probe.table} lisible par B`).toBe(0);
      }

      for (const table of ['resources', 'courses', 'notion_states', 'ai_credentials']) {
        const updated = await asUser(tx, fixture.b.id, async (inner) => {
          const rows = await inner.execute<{ one: number }>(sql`
            update ${sql.raw(`public.${table}`)}
            set ${sql.raw(table === 'resources' ? 'title = title' : table === 'courses' ? 'status = status' : table === 'notion_states' ? 'mastery = mastery' : 'label = label')}
            where ${sql.raw(table === 'notion_states' ? 'user_id' : table === 'ai_credentials' ? 'user_id' : 'owner_id')} = ${fixture.a.id}::uuid
            returning 1 as one
          `);
          return rows.length;
        });
        expect(updated, `${table} modifiable par B`).toBe(0);
        const deleted = await asUser(tx, fixture.b.id, async (inner) => {
          const rows = await inner.execute<{ one: number }>(sql`
            delete from ${sql.raw(`public.${table}`)}
            where ${sql.raw(table === 'notion_states' || table === 'ai_credentials' ? 'user_id' : 'owner_id')} = ${fixture.a.id}::uuid
            returning 1 as one
          `);
          return rows.length;
        });
        expect(deleted, `${table} supprimable par B`).toBe(0);
      }
    });
  });

  it('CA-3 — un chemin ou une URL signée d’un autre utilisateur est refusé', async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const path = resourcePath(fixture.a.id, fixture.ids.resources ?? randomUUID(), 'apport.pdf');
      expect(parseOwnedPath(path, fixture.b.id)).toBeNull();

      const signed: string[] = [];
      const gateway: StorageGateway = {
        signUpload: (_bucket, target) => {
          signed.push(target);
          return Promise.resolve(`https://storage.test/upload/${target}`);
        },
        signRead: (_bucket, target) => {
          signed.push(target);
          return Promise.resolve(`https://storage.test/read/${target}`);
        },
        remove: () => Promise.resolve(),
        list: () => Promise.resolve([{ name: path, id: null, updatedAt: null }]),
      };
      const runtime: StorageRuntime = { db: tx, gateway, clock: FIXED_CLOCK };
      await expect(
        createReadUrl(
          runtime,
          { userId: fixture.b.id, accessToken: 'b-token' },
          { bucket: 'resources', path },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(signed).toHaveLength(0);
      const list = await listOwnedObjects(
        runtime,
        { userId: fixture.b.id, accessToken: 'b-token' },
        'resources',
      );
      expect(list).toEqual([]);
    });
  });
});
