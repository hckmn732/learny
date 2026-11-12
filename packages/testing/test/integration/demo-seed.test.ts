// Integration tests of the demonstration seed and the P1 factories (SPEC-115 §12, CA-1 to CA-3,
// CL-6, CL-7). Every test runs inside `withRollback`: no fixture survives and the shared database is
// never truncated, even when SPEC-114 runs in parallel.
import { describe, expect, it } from 'vitest';

import { sql, type DbTx } from '@learny/db';
import {
  demoFormationId,
  demoModuleId,
  demoNotionId,
  demoUserId,
  seedDemo,
  type SeedDemoSummary,
} from '@learny/db/seed';
import { asUser, withRollback } from '@learny/db/testing';

import {
  createAttempt,
  createBrick,
  createCourse,
  createFormation,
  createGroup,
  createModule,
  createNotion,
  createNotionState,
  createNotification,
  createResource,
  createScheduleSlot,
  createUser,
} from '../../src/index';

interface CountRow extends Record<string, unknown> {
  count: number;
}

async function count(tx: DbTx, query: ReturnType<typeof sql>): Promise<number> {
  const rows = await tx.execute<CountRow>(query);
  return rows[0]?.count ?? 0;
}

async function seedTwice(tx: DbTx): Promise<{ first: SeedDemoSummary; second: SeedDemoSummary }> {
  const first = await seedDemo({ tx });
  const second = await seedDemo({ tx });
  return { first, second };
}

describe('[SPEC-115] demo seed', () => {
  it('CA-1 / CA-2 — deux exécutions gardent les mêmes comptes, identifiants et contrôles', async () => {
    const { first, second } = await withRollback(seedTwice);

    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.tableCounts).toEqual(first.tableCounts);
    expect(second.checks).toEqual(first.checks);
    expect(Object.values(second.checks).every((check) => check.ok)).toBe(true);
    expect(second.checks['sap.modules']?.observed).toBe(7);
    expect(second.checks['sap.notions']?.observed).toBe(48);
    expect(second.checks['group.members']?.observed).toBe(3);
    expect(second.checks['agenda.days']?.observed).toBe(5);
    expect(second.tableCounts['public.notifications']).toBe(10);
    expect(second.tableCounts['public.schedule_slots']).toBe(24);
  });

  it('CA-1 — les identifiants fixes désignent les mêmes lignes après deux passages', async () => {
    const rows = await withRollback(async (tx) => {
      await seedDemo({ tx });
      await seedDemo({ tx });
      return {
        sap: await tx.execute(
          sql`select title, status, volume_hours from public.formations where id = ${demoFormationId('sap')}::uuid`,
        ),
        modules: await count(
          tx,
          sql`select count(*)::int as count from public.modules where formation_id = ${demoFormationId('sap')}::uuid`,
        ),
        notions: await count(
          tx,
          sql`select count(*)::int as count from public.notions where formation_id = ${demoFormationId('sap')}::uuid`,
        ),
        cle: await tx.execute(
          sql`select label from public.notions where id = ${demoNotionId('sap:m3:c2:n4')}::uuid`,
        ),
        alex: await tx.execute(
          sql`select first_name, last_name, streak_days from public.profiles where id = ${demoUserId('alex')}::uuid`,
        ),
        group: await tx.execute(
          sql`select invite_code from public.groups where formation_id = ${demoFormationId('agile')}::uuid`,
        ),
        module: await tx.execute(
          sql`select title from public.modules where id = ${demoModuleId('sap', 3)}::uuid`,
        ),
      };
    });

    expect(rows.sap[0]).toMatchObject({
      title: 'SAP S/4HANA Finance',
      status: 'active',
      volume_hours: 150,
    });
    expect(rows.modules).toBe(7);
    expect(rows.notions).toBe(48);
    expect(rows.cle[0]).toMatchObject({ label: 'Clé de comptabilisation' });
    expect(rows.alex[0]).toMatchObject({
      first_name: 'Alex',
      last_name: 'Perrin',
      streak_days: 12,
    });
    expect(rows.group[0]).toMatchObject({ invite_code: 'LRN-AG24' });
    expect(rows.module[0]).toMatchObject({ title: 'Comptabilité générale' });
  });

  it('CA-3 / CL-6 — Camille et Hugo partagent le programme mais ne lisent pas les données d’Alex', async () => {
    const observations = await withRollback(async (tx) => {
      await seedDemo({ tx });
      const alex = demoUserId('alex');
      const camille = demoUserId('camille');
      const hugo = demoUserId('hugo');
      const sap = demoFormationId('sap');
      const agile = demoFormationId('agile');

      const read = async (userId: string) =>
        asUser(tx, userId, async (inner) => ({
          sap: await count(
            inner,
            sql`select count(*)::int as count from public.formations where id = ${sap}::uuid`,
          ),
          agile: await count(
            inner,
            sql`select count(*)::int as count from public.formations where id = ${agile}::uuid`,
          ),
          alexResources: await count(
            inner,
            sql`select count(*)::int as count from public.resources where owner_id = ${alex}::uuid`,
          ),
          alexCourses: await count(
            inner,
            sql`select count(*)::int as count from public.courses where owner_id = ${alex}::uuid`,
          ),
          alexStates: await count(
            inner,
            sql`select count(*)::int as count from public.notion_states where user_id = ${alex}::uuid`,
          ),
          alexAgenda: await count(
            inner,
            sql`select count(*)::int as count from public.schedule_slots where user_id = ${alex}::uuid`,
          ),
          ownResources: await count(
            inner,
            sql`select count(*)::int as count from public.resources where owner_id = ${userId}::uuid`,
          ),
          groupProgress: await count(
            inner,
            sql`select count(*)::int as count from public.group_member_progress`,
          ),
        }));

      return {
        alex: await read(alex),
        camille: await read(camille),
        hugo: await read(hugo),
      };
    });

    // The personal demo data is invisible to the two other members, despite the shared programme.
    for (const member of [observations.camille, observations.hugo]) {
      expect(member.sap).toBe(0);
      expect(member.agile).toBe(1);
      expect(member.alexResources).toBe(0);
      expect(member.alexCourses).toBe(0);
      expect(member.alexStates).toBe(0);
      expect(member.alexAgenda).toBe(0);
      expect(member.ownResources).toBe(1);
      expect(member.groupProgress).toBe(3);
    }
    expect(observations.alex.sap).toBe(1);
    expect(observations.alex.agile).toBe(1);
    expect(observations.alex.alexResources).toBe(9);
    expect(observations.alex.alexCourses).toBe(4);
  });

  it('CA-3 — les fabriques créent des lignes valides, isolées et retournent leurs identifiants', async () => {
    const created = await withRollback(async (tx) => {
      const alex = await createUser(tx, { firstName: 'Alex', lastName: 'Fabrique' });
      const camille = await createUser(tx, { firstName: 'Camille', lastName: 'Fabrique' });
      const formation = await createFormation(tx, {
        ownerId: alex.id,
        title: 'Formation de fabrique',
        objectives: ['operational', 'exam'],
      });
      const module = await createModule(tx, {
        ownerId: alex.id,
        formationId: formation.id,
        title: 'Module de fabrique',
        chapters: ['Chapitre A', 'Chapitre B'],
      });
      const [chapterA, chapterB] = module.chapterIds;
      if (chapterA === undefined || chapterB === undefined) {
        throw new Error('chapitres de fabrique absents');
      }
      const notion = await createNotion(tx, {
        ownerId: alex.id,
        formationId: formation.id,
        moduleId: module.id,
        chapterId: chapterA,
        label: 'Notion de fabrique',
      });
      const resource = await createResource(tx, {
        ownerId: alex.id,
        formationId: formation.id,
        chapterId: chapterA,
        kind: 'note',
        content: 'Apport privé d’Alex.',
      });
      const course = await createCourse(tx, {
        ownerId: alex.id,
        formationId: formation.id,
        moduleId: module.id,
      });
      const brick = await createBrick(tx, {
        ownerId: alex.id,
        formationId: formation.id,
        notionIds: [notion.id],
        type: 'choice_question',
        purpose: 'warmup',
      });
      const activityRows = await tx.execute<{ id: string }>(sql`
        insert into public.activities (owner_id, formation_id, module_id, kind, items, status)
        values (
          ${alex.id}::uuid,
          ${formation.id}::uuid,
          ${module.id}::uuid,
          'warmup',
          ${JSON.stringify([{ brickId: brick.id, brickVersionId: brick.versionId }])}::jsonb,
          'ready'
        )
        returning id::text as id
      `);
      const activityId = activityRows[0]?.id;
      if (activityId === undefined) throw new Error('activité non créée');
      const attempt = await createAttempt(tx, {
        userId: alex.id,
        activityId,
        score: 82,
        passed: true,
      });
      await createNotionState(tx, { userId: alex.id, notionId: notion.id, mastery: 82 });
      const slot = await createScheduleSlot(tx, {
        userId: alex.id,
        formationId: formation.id,
        moduleId: module.id,
        kind: 'warmup',
        title: 'Échauffement de fabrique',
      });
      const notification = await createNotification(tx, {
        userId: alex.id,
        formationId: formation.id,
        title: 'Notification de fabrique',
      });
      const group = await createGroup(tx, {
        formationId: formation.id,
        ownerId: alex.id,
        memberIds: [camille.id],
      });
      const memberResource = await createResource(tx, {
        ownerId: camille.id,
        formationId: formation.id,
        chapterId: chapterB,
        kind: 'note',
        content: 'Apport privé de Camille.',
      });

      const visible = await asUser(tx, camille.id, async (inner) => ({
        alexResources: await count(
          inner,
          sql`select count(*)::int as count from public.resources where owner_id = ${alex.id}::uuid`,
        ),
        ownResources: await count(
          inner,
          sql`select count(*)::int as count from public.resources where owner_id = ${camille.id}::uuid`,
        ),
        alexStates: await count(
          inner,
          sql`select count(*)::int as count from public.notion_states where user_id = ${alex.id}::uuid`,
        ),
        sharedProgramme: await count(
          inner,
          sql`select count(*)::int as count from public.modules where formation_id = ${formation.id}::uuid`,
        ),
      }));

      return {
        ids: [
          formation.id,
          module.id,
          notion.id,
          resource.id,
          course.id,
          brick.id,
          attempt.id,
          slot.id,
          notification.id,
          group.id,
          memberResource.id,
          ...module.chapterIds,
          ...course.sectionIds,
        ],
        group,
        visible,
      };
    });

    expect(new Set(created.ids).size).toBe(created.ids.length);
    expect(created.group.inviteCode).toMatch(/^LRN-[A-Z2-9]{4}$/);
    expect(created.visible).toEqual({
      alexResources: 0,
      ownResources: 1,
      alexStates: 0,
      sharedProgramme: 1,
    });
  });

  it('CL-7 — un identifiant déjà utilisé échoue explicitement sans écraser la ligne', async () => {
    await withRollback(async (tx) => {
      const alex = await createUser(tx);
      const id = '11111111-1111-4111-8111-111111111111';
      await createFormation(tx, { id, ownerId: alex.id, title: 'Première' });
      await tx.execute(sql`savepoint duplicate_id`);
      try {
        await expect(
          createFormation(tx, { id, ownerId: alex.id, title: 'Seconde' }),
        ).rejects.toThrow(/déjà utilisé|duplicate|unique/i);
      } finally {
        await tx.execute(sql`rollback to savepoint duplicate_id`);
      }
      const rows = await tx.execute<{ title: string }>(
        sql`select title from public.formations where id = ${id}::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe('Première');
    });
  });

  it('ET-5 — une fabrique refuse un owner_id incohérent avec la formation', async () => {
    await withRollback(async (tx) => {
      const alex = await createUser(tx);
      const camille = await createUser(tx);
      const formation = await createFormation(tx, { ownerId: alex.id });
      await expect(
        createModule(tx, { ownerId: camille.id, formationId: formation.id }),
      ).rejects.toThrow(/owner_id incohérent/);
      await expect(
        createResource(tx, {
          ownerId: camille.id,
          formationId: formation.id,
          kind: 'note',
          content: 'Privé.',
        }),
      ).rejects.toThrow(/owner_id incohérent/);
    });
  });
});
