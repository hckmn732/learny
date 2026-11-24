// Integration tests of the demonstration seed and the P1 factories (SPEC-115 §12, CA-1 to CA-3,
// CL-6, CL-7). Every test runs inside `withRollback`: no fixture survives and the shared database is
// never truncated, even when SPEC-114 runs in parallel.
import { describe, expect, it } from 'vitest';

import { sql, type DbTx } from '@learny/testing/db';
import { asUser, withRollback } from '@learny/testing/db';
import {
  DEMO_NOW_ISO,
  DEMO_USERS,
  demoFormationId,
  demoId,
  demoModuleId,
  demoNotionId,
  demoUserId,
  seedDemo,
  type SeedDemoSummary,
} from '@learny/testing/db-seed';

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
    // Extension QA (hors SPEC-115) : +3 notifications (Camille, Hugo, Alex sur agile) et +2
    // créneaux d'agenda privés (Camille en cadrage, Hugo sur sa formation en pause), +1 créneau
    // manqué hors de la semaine visible (ADR-0336).
    expect(second.tableCounts['public.notifications']).toBe(13);
    expect(second.tableCounts['public.schedule_slots']).toBe(28);
  });

  it('ADR-0336 — la purge rend l’état de référence exact après une dérive', async () => {
    const observed = await withRollback(async (tx) => {
      await seedDemo({ tx });
      // Dérive simulée : le payload d'une version antérieure de la seed, la session du jour jouée
      // et un créneau parasite — autant d'états que la recette laisse derrière elle.
      await tx.execute(sql`
        update public.automation_actions
        set payload = '{"source":"fixture","key":"schedule-remains"}'::jsonb
        where id = ${demoId('automation-action', 'schedule-remains')}::uuid
      `);
      await tx.execute(sql`
        insert into public.activities (owner_id, formation_id, kind, config, items, status, for_date)
        select ${demoUserId('alex')}::uuid,
               ${demoFormationId('sap')}::uuid,
               'global_quiz_session',
               '{"mode":"full","dueCount":14}'::jsonb,
               jsonb_build_array(
                 jsonb_build_object('brickId', b.id, 'brickVersionId', v.id)
               ),
               'ready',
               '2026-11-11'
        from public.bricks b
        join public.brick_versions v on v.brick_id = b.id and v.version = b.current_version
        where b.owner_id = ${demoUserId('alex')}::uuid
          and b.formation_id = ${demoFormationId('sap')}::uuid
          and b.status = 'active'
        limit 1
      `);
      await tx.execute(sql`
        insert into public.schedule_slots (
          user_id, formation_id, kind, title, meta, starts_at, ends_at, status, created_by
        ) values (
          ${demoUserId('alex')}::uuid,
          ${demoFormationId('sap')}::uuid,
          'buffer',
          'Marge parasite',
          'dérive de recette',
          '2026-11-11T10:00:00Z',
          '2026-11-11T11:00:00Z',
          'planned',
          'learner'
        )
      `);
      await seedDemo({ tx });
      return {
        retryAt: await tx.execute<{ retry_at: string | null }>(sql`
          select (payload ->> 'retryAvailableAt') as retry_at
          from public.automation_actions
          where id = ${demoId('automation-action', 'schedule-remains')}::uuid
        `),
        sessions: await count(
          tx,
          sql`select count(*)::int as count from public.activities
              where owner_id = ${demoUserId('alex')}::uuid
                and kind in ('global_quiz_session', 'micro_session')`,
        ),
        straySlots: await count(
          tx,
          sql`select count(*)::int as count from public.schedule_slots
              where user_id = ${demoUserId('alex')}::uuid and title = 'Marge parasite'`,
        ),
        alexSlots: await count(
          tx,
          sql`select count(*)::int as count from public.schedule_slots
              where user_id = ${demoUserId('alex')}::uuid`,
        ),
      };
    });

    expect(observed.retryAt[0]?.retry_at).toBe('2026-11-11T03:30:00.000Z');
    expect(observed.sessions).toBe(0);
    expect(observed.straySlots).toBe(0);
    expect(observed.alexSlots).toBe(24);
  });

  it('ADR-0336 — la proposition de reprise, le délai et l’IA du jeu sont jouables', async () => {
    const observed = await withRollback(async (tx) => {
      await seedDemo({ tx });
      const alex = demoUserId('alex');
      const sap = demoFormationId('sap');

      const actionRows = await tx.execute<{ payload: Record<string, unknown> }>(sql`
        select payload from public.automation_actions
        where id = ${demoId('automation-action', 'reschedule')}::uuid
      `);
      const action = actionRows[0]?.payload as {
        missedSlotId: string;
        proposed: { startsAt: string; endsAt: string; bufferSlotId: string };
        alternatives: { startsAt: string; endsAt: string }[];
        expiresAt?: string;
      };

      const slotOf = async (id: string) =>
        (
          await tx.execute<{ kind: string; status: string }>(
            sql`select kind, status from public.schedule_slots where id = ${id}::uuid`,
          )
        )[0];
      const missed = await slotOf(action.missedSlotId);
      const buffer = await slotOf(action.proposed.bufferSlotId);

      const freeAt = async (start: string, end: string): Promise<number> =>
        count(
          tx,
          sql`select count(*)::int as count from public.schedule_slots
              where user_id = ${alex}::uuid and formation_id = ${sap}::uuid
                and status in ('planned', 'done', 'missed')
                and id not in (${sql.join(
                  [action.missedSlotId, action.proposed.bufferSlotId].map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})
                and starts_at < ${end}::timestamptz
                and ends_at > ${start}::timestamptz`,
        );

      const remediationRows = await tx.execute<{ retry_at: string; delay_hours: number }>(sql`
        select (payload ->> 'retryAvailableAt') as retry_at,
               (payload ->> 'delayHours')::int as delay_hours
        from public.automation_actions
        where id = ${demoId('automation-action', 'schedule-remains')}::uuid
      `);

      const subscriptions = await tx.execute<{ n: number; active: number }>(sql`
        select count(*)::int as n,
               count(*) filter (
                 where status = 'active' and current_period_end > ${DEMO_NOW_ISO}::timestamptz
               )::int as active
        from public.subscriptions
        where user_id in (${sql.join(
          DEMO_USERS.map((user) => sql`${demoUserId(user.key)}::uuid`),
          sql`, `,
        )})
      `);

      const seenReviewAnswers = await count(
        tx,
        sql`select count(*)::int as count from public.answers a
            join public.attempts t on t.id = a.attempt_id
            join public.brick_versions v on v.id = a.brick_version_id
            join public.bricks b on b.id = v.brick_id
            where t.user_id = ${alex}::uuid and b.purpose = 'review'`,
      );

      return {
        missed,
        buffer,
        proposedFree: await freeAt(action.proposed.startsAt, action.proposed.endsAt),
        alternatives: await Promise.all(
          action.alternatives.map((slot) => freeAt(slot.startsAt, slot.endsAt)),
        ),
        expiresAt: action.expiresAt ?? null,
        remediation: remediationRows[0],
        subscriptions: subscriptions[0],
        seenReviewAnswers,
      };
    });

    expect(observed.missed).toMatchObject({ kind: 'course', status: 'missed' });
    expect(observed.buffer).toMatchObject({ kind: 'buffer', status: 'planned' });
    expect(observed.proposedFree).toBe(0);
    expect(observed.alternatives).toEqual([0, 0, 0]);
    expect(observed.expiresAt).toBe('2026-11-12T09:30:00.000Z');
    expect(observed.remediation?.delay_hours).toBe(12);
    expect(Date.parse(observed.remediation?.retry_at ?? '')).toBeLessThanOrEqual(
      Date.parse(DEMO_NOW_ISO),
    );
    expect(observed.subscriptions).toMatchObject({ n: 3, active: 3 });
    expect(observed.seenReviewAnswers).toBe(0);
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
      // Extension QA (hors SPEC-115) : +1 apport personnel par membre (leadership/scrum).
      expect(member.ownResources).toBe(2);
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
