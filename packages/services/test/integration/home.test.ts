import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import { clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { demoFormationId, demoModuleId, demoUserId, seedDemo } from '@learny/db/seed';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import { createServiceContext } from '../../src/context';
import { getHome } from '../../src/home';

const ALEX = demoUserId('alex');

function alexContext() {
  return createServiceContext({ userId: ALEX, requestId: 'spec-603-home' });
}

async function countAiCalls(): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(
    sql`select count(*)::int as count from public.ai_calls`,
  );
  return rows[0]?.count ?? 0;
}

beforeAll(async () => {
  await seedDemo();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-603] getHome', () => {
  it('renvoie les valeurs du seed démo (CA-1)', async () => {
    const before = await countAiCalls();
    const result = await getHome(alexContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const home = result.value;

    expect(home.today.date).toBe('2026-11-11');
    expect(home.today.label).toBe('Mercredi 11 novembre');
    expect(home.today.slots).toHaveLength(4);
    expect(home.today.plannedMinutes).toBe(300);
    expect(home.today.doneMinutes).toBe(180);
    expect(home.today.slots.map((slot) => slot.state)).toEqual([
      'done',
      'next',
      'upcoming',
      'upcoming',
    ]);
    expect(home.today.slots[1]).toMatchObject({
      state: 'next',
      minutesUntil: 40,
    });
    expect(home.today.primaryAction).toEqual({
      label: 'Commencer le quiz de validation',
      href: `/formations/${demoFormationId('sap')}/modules/${demoModuleId('sap', 3)}/quiz`,
    });
    expect(Object.keys(home.retention).sort()).toEqual(['oneMonth', 'twoMonths']);
    expect(home.retention.oneMonth === null || Number.isInteger(home.retention.oneMonth)).toBe(
      true,
    );
    expect(home.retention.twoMonths === null || Number.isInteger(home.retention.twoMonths)).toBe(
      true,
    );
    expect(home.globalQuiz).toMatchObject({
      formationTitle: 'SAP S/4HANA Finance',
      notionCount: 14,
      deferred: {
        dueCount: 18,
        deferredCount: 4,
        deferredTo: '2026-11-12',
        capMin: ENGINE.globalQuiz.maxMinutesDefault,
      },
    });
    expect(home.formations.ongoing).toHaveLength(3);
    expect(home.formations.completed).toHaveLength(2);
    expect(home.formations.ongoing.map((row) => row.title)).toEqual([
      'SAP S/4HANA Finance',
      'Gestion de projet agile',
      "Python pour l'analyse de données",
    ]);
    expect(home.formations.completed.map((row) => row.title)).toEqual([
      "Excel pour l'analyse financière",
      'Anglais professionnel B2',
    ]);
    expect(home.formations.ongoing[0]).toMatchObject({
      progressPercent: 29,
      modulePosition: 3,
      moduleTitle: 'Comptabilité générale',
      moduleStatus: { label: 'Quiz à repasser' },
      action: { label: 'Reprendre' },
    });
    expect(home.formations.ongoing[0]?.action.href).toBe(
      `/formations/${demoFormationId('sap')}/modules/${demoModuleId('sap', 3)}`,
    );
    expect(home.formations.ongoing[1]).toMatchObject({
      moduleStatus: { label: 'Apports en cours' },
      nextActivity: { when: 'Demain, 17:30', detail: 'Apports, chapitre 2' },
    });
    expect(home.formations.ongoing[2]).toMatchObject({
      status: 'programme_proposed',
      nextActivity: { when: 'Valider le programme', detail: '8 modules proposés' },
      action: { label: 'Continuer' },
    });
    expect(home.formations.completed[0]).toMatchObject({
      resultPercent: 88,
      maintenanceMode: 'light',
      dueCount: 5,
      weeks: 4,
      volumeHours: 60,
      action: { label: 'Réviser' },
    });
    expect(home.formations.completed[1]).toMatchObject({
      resultPercent: 82,
      maintenanceMode: 'stopped',
      action: { label: 'Voir le bilan' },
    });
    expect(await countAiCalls()).toBe(before);
  });

  it('ne renvoie aucune donnée d’Alex à un autre apprenant (CA-7)', async () => {
    const other = await serviceDb().transaction((tx) => createTestUser(tx));
    try {
      const ctx = createServiceContext({ userId: other.id, requestId: 'rls-home' });
      const result = await getHome(ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.formations.ongoing).toEqual([]);
      expect(result.value.formations.completed).toEqual([]);
      expect(result.value.today.slots).toEqual([]);
      expect(result.value.globalQuiz).toBeNull();
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${other.id}::uuid`);
    }
  });

  it('calcule le jour et les heures dans le fuseau de l’apprenant (CA-5)', async () => {
    const user = await serviceDb().transaction((tx) =>
      createTestUser(tx, { timezone: 'America/New_York' }),
    );
    try {
      const programme = await serviceDb().transaction((tx) =>
        createTestProgramme(tx, user.id, {
          modules: 1,
          chaptersPerModule: 1,
          notionsPerChapter: 1,
          title: 'Fuseau de New York',
        }),
      );
      await serviceDb().execute(sql`
        insert into public.schedule_slots
          (user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at, status, created_by)
        values
          (${user.id}::uuid, ${programme.formationId}::uuid, ${programme.moduleIds[0]}::uuid,
           'course', 'Cours du matin', 'Chapitre 1',
           '2026-11-11T14:00:00Z'::timestamptz, '2026-11-11T15:00:00Z'::timestamptz,
           'planned', 'planner')
      `);
      const ctx = createServiceContext({ userId: user.id, requestId: 'tz-home' });
      const result = await getHome(ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.today.label).toBe('Mercredi 11 novembre');
      expect(result.value.today.slots[0]?.time).toBe('09:00');
      expect(result.value.retention).toEqual({ oneMonth: null, twoMonths: null });
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${user.id}::uuid`);
    }
  });

  it('mesure un p95 inférieur à 300 ms sur vingt appels (CA-7)', async () => {
    const ctx = alexContext();
    await getHome(ctx);
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const start = performance.now();
      const result = await getHome(ctx);
      durations.push(performance.now() - start);
      expect(result.ok).toBe(true);
    }
    const sorted = [...durations].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(300);
  });

  it('ne lit jamais le présent hors de l’horloge injectée', async () => {
    const frozen = clock.now().toISOString();
    const result = await getHome(alexContext());
    expect(result.ok).toBe(true);
    expect(clock.now().toISOString()).toBe(frozen);
  });
});
