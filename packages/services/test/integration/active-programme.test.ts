process.env.APP_ENV = 'test';
process.env.JOBS_MODE = 'inline';

import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { isActiveProgramme } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { AppError } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import { createServiceContext } from '../../src/context';
import {
  assertModuleAccess,
  getActiveProgramme,
  getProgrammeScreenState,
  lockedModuleMessage,
} from '../../src/programme';

const PREFIX = 'sdd-606-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const START = '2026-11-02';
const END = '2026-12-11';
const MODULE_DATES = [
  ['2026-11-02', '2026-11-04'],
  ['2026-11-05', '2026-11-06'],
  ['2026-11-09', '2026-11-13'],
  ['2026-11-16', '2026-11-20'],
  ['2026-11-23', '2026-11-27'],
  ['2026-11-30', '2026-12-04'],
  ['2026-12-07', '2026-12-11'],
] as const;

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Learner {
  userId: string;
  ctx: ReturnType<typeof createServiceContext>;
}

async function learner(label: string, timezone = 'Europe/Paris'): Promise<Learner> {
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, {
      email: `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`,
      timezone,
    });
    return {
      userId: user.id,
      ctx: createServiceContext({
        userId: user.id,
        email: user.email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

interface Seeded {
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
}

async function seedActive(
  userId: string,
  options: {
    validated?: number;
    open?: number;
    modules?: number;
    chaptersPerModule?: number;
    status?: 'active' | 'paused' | 'completed';
    title?: string;
  } = {},
): Promise<Seeded> {
  const modules = options.modules ?? 7;
  const chaptersPerModule = options.chaptersPerModule ?? 3;
  const seeded = await serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules,
      chaptersPerModule,
      notionsPerChapter: 1,
      title: options.title ?? 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.formations
      set title = ${options.title ?? 'SAP S/4HANA Finance'},
          description = 'Devenir opérationnel sur les processus financiers de SAP S/4HANA.',
          status = ${options.status ?? 'active'},
          monogram = 'SA',
          accent_color = 'indigo',
          objectives = '{operational,exam}'::public.formation_objective[],
          volume_hours = 150,
          start_date = ${START}::date,
          end_date = ${END}::date,
          default_threshold = 80,
          last_opened_at = ${FIXED.toISOString()}::timestamptz
      where id = ${programme.formationId}::uuid
    `);
    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const dates = MODULE_DATES[index];
      await tx.execute(sql`
        update public.modules
        set title = ${`Module ${String(index + 1)}`},
            planned_start = ${dates?.[0] ?? START}::date,
            planned_end = ${dates?.[1] ?? END}::date,
            threshold = 80
        where id = ${moduleId}::uuid
      `);
    }
    const validated = options.validated ?? 2;
    const open = options.open ?? (validated < modules ? validated + 1 : null);
    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const position = index + 1;
      const status = position <= validated ? 'validated' : position === open ? 'open' : 'locked';
      const score = status === 'validated' ? (position === 1 ? '86' : '91') : null;
      await tx.execute(sql`
        insert into public.module_progress (
          user_id, module_id, status, opened_at, validated_at, best_score, updated_at
        )
        values (
          ${userId}::uuid,
          ${moduleId}::uuid,
          ${status}::public.module_status,
          ${status === 'locked' ? null : `${START}T09:00:00Z`}::timestamptz,
          ${status === 'validated' ? `${END}T18:00:00Z` : null}::timestamptz,
          ${score},
          ${FIXED.toISOString()}::timestamptz
        )
      `);
    }
    await tx.execute(sql`
      insert into public.chapter_progress (user_id, chapter_id, contributions_status)
      values (${userId}::uuid, ${programme.chapterIds[0] ?? ''}::uuid, 'done')
      on conflict do nothing
    `);
    return programme;
  });
  return {
    formationId: seeded.formationId,
    moduleIds: seeded.moduleIds,
    chapterIds: seeded.chapterIds,
  };
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-606] programme en cours', () => {
  it('CA-1/CA-3 — lit 2 modules validés sur 7, 29 % et les quiz du programme', async () => {
    const fx = await learner('sap');
    const seeded = await seedActive(fx.userId);

    const result = await getActiveProgramme(fx.ctx, seeded.formationId);
    if (!result.ok) throw result.error;
    const programme = result.value;

    expect(programme.indicators.progress).toEqual({ validated: 2, total: 7, percent: 29 });
    expect(programme.indicators.weeks).toBe(6);
    expect(programme.indicators.volumeHours).toBe(150);
    expect(programme.indicators.threshold).toBe(80);
    expect(programme.formation.status).toBe('active');
    expect(programme.modules.map((module) => module.status)).toEqual([
      'validated',
      'validated',
      'open',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(programme.modules.map((module) => module.score)).toEqual([
      86,
      91,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(programme.modules.map((module) => module.quizOn)).toEqual([
      '2026-11-04',
      '2026-11-06',
      '2026-11-13',
      '2026-11-20',
      '2026-11-27',
      '2026-12-04',
      '2026-12-11',
    ]);
    expect(programme.modules.at(-1)?.quizKind).toBe('exam');
    expect(programme.calendar).toHaveLength(7);
    expect(programme.calendar[2]?.quizOn).toBe('2026-11-13');
    expect(programme.today).toBe('2026-11-11');
    expect(programme.timeZone).toBe('Europe/Paris');
    expect(programme.chapters[0]?.contributionsStatus).toBe('done');
    expect(programme.chapters[0]?.courseHref).toContain('/cours?chapitre=');

    const screen = await getProgrammeScreenState(fx.ctx, seeded.formationId);
    if (!screen.ok) throw screen.error;
    expect(isActiveProgramme(screen.value)).toBe(true);
    if (isActiveProgramme(screen.value)) {
      expect(screen.value.indicators.progress.percent).toBe(29);
    }
  });

  it('CA-2 — le module 1 ouvert a un lien, le module 2 verrouillé est refusé avec sa condition', async () => {
    const fx = await learner('gate');
    const seeded = await seedActive(fx.userId, { validated: 0, open: 1 });

    const result = await getActiveProgramme(fx.ctx, seeded.formationId);
    if (!result.ok) throw result.error;
    const [first, second] = result.value.modules;
    if (first === undefined || second === undefined) throw new Error('modules absents');
    expect(first.status).toBe('open');
    expect(first.href).toBe(
      `/formations/${seeded.formationId}/modules/${seeded.moduleIds[0] ?? ''}`,
    );
    expect(second.status).toBe('locked');
    expect(second.href).toBeNull();
    expect(second.unlockAfterPosition).toBe(1);
    expect(() => {
      assertModuleAccess(second);
    }).toThrow(AppError);
    try {
      assertModuleAccess(second);
    } catch (error) {
      if (error instanceof AppError) {
        expect(error.code).toBe('MODULE_LOCKED');
        expect(error.detail).toBe('Se débloque quand le quiz du module 1 est validé.');
      }
    }
    expect(lockedModuleMessage(second)).toBe('Se débloque quand le quiz du module 1 est validé.');
    expect(() => {
      assertModuleAccess(first);
    }).not.toThrow();
  });

  it('ET-1, CA-4 — un autre utilisateur reçoit 404 et une entrée invalide ne crée rien', async () => {
    const owner = await learner('owner');
    const other = await learner('other');
    const seeded = await seedActive(owner.userId);

    const foreign = await getActiveProgramme(other.ctx, seeded.formationId);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');
    const foreignScreen = await getProgrammeScreenState(other.ctx, seeded.formationId);
    expect(foreignScreen.ok).toBe(false);
    if (!foreignScreen.ok) expect(foreignScreen.error.code).toBe('NOT_FOUND');

    const before = await serviceDb().execute<{
      modules: number;
      chapters: number;
      events: number;
    }>(sql`
      select
        (select count(*)::int from public.modules where formation_id = ${seeded.formationId}::uuid) as modules,
        (select count(*)::int from public.chapters where formation_id = ${seeded.formationId}::uuid) as chapters,
        (select count(*)::int from public.event_outbox) as events
    `);
    const invalid = await getActiveProgramme(owner.ctx, 'pas-un-uuid');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED');
    const first = await getActiveProgramme(owner.ctx, seeded.formationId);
    const second = await getActiveProgramme(owner.ctx, seeded.formationId);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value).toEqual(second.value);
    const after = await serviceDb().execute<{
      modules: number;
      chapters: number;
      events: number;
    }>(sql`
      select
        (select count(*)::int from public.modules where formation_id = ${seeded.formationId}::uuid) as modules,
        (select count(*)::int from public.chapters where formation_id = ${seeded.formationId}::uuid) as chapters,
        (select count(*)::int from public.event_outbox) as events
    `);
    expect(after[0]).toEqual(before[0]);
  });

  it('ET-5 — une formation en pause garde son avancement et ses modules', async () => {
    const fx = await learner('paused');
    const seeded = await seedActive(fx.userId, { validated: 2, open: 3, status: 'paused' });
    const result = await getActiveProgramme(fx.ctx, seeded.formationId);
    if (!result.ok) throw result.error;
    expect(result.value.formation.status).toBe('paused');
    expect(result.value.indicators.progress).toEqual({ validated: 2, total: 7, percent: 29 });
    expect(result.value.modules[2]?.status).toBe('open');
  });

  it('ET-2 — le marqueur Aujourd’hui suit le fuseau IANA du profil', async () => {
    const fx = await learner('kiritimati', 'Pacific/Kiritimati');
    const seeded = await seedActive(fx.userId);
    const result = await getActiveProgramme(fx.ctx, seeded.formationId);
    if (!result.ok) throw result.error;
    expect(result.value.today).toBe('2026-11-12');
    expect(result.value.timeZone).toBe('Pacific/Kiritimati');
  });

  it('CL-3 — une formation sans programme validé n’est pas lue comme un programme actif', async () => {
    const fx = await learner('proposal');
    const formationId = await serviceDb().transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        insert into public.formations (owner_id, title, status)
        values (${fx.userId}::uuid, 'Programme non validé', 'programme_proposed')
        returning id::text as id
      `);
      return rows[0]?.id ?? '';
    });
    const active = await getActiveProgramme(fx.ctx, formationId);
    expect(active.ok).toBe(false);
    if (!active.ok) expect(active.error.code).toBe('CONFLICT');
    const screen = await getProgrammeScreenState(fx.ctx, formationId);
    expect(screen.ok).toBe(true);
    if (screen.ok) expect(isActiveProgramme(screen.value)).toBe(false);
  });
});
