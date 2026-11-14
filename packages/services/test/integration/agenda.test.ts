import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setClock, type Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { demoFormationId, demoModuleId, demoUserId, seedDemo } from '@learny/db/seed';
import { createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing/clock';

import { agendaSlotHref, getAgenda } from '../../src/agenda';
import { createServiceContext, type ServiceContext } from '../../src/context';

const ALEX = demoUserId('alex');
const SAP = demoFormationId('sap');
const AGILE = demoFormationId('agile');

function context(userId: string, clock: Clock): ServiceContext {
  return createServiceContext({ userId, requestId: 'spec-704-agenda', clock });
}

let stranger: { userId: string } | null = null;

beforeAll(async () => {
  setClock(createFixedClock());
  await seedDemo();
  const user = await serviceDb().transaction(async (tx) => {
    const created = await createTestUser(tx);
    await tx.execute(
      sql`update public.profiles set onboarding_step = 'done' where id = ${created.id}::uuid`,
    );
    return created;
  });
  stranger = { userId: user.id };
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-704] getAgenda', () => {
  it('renvoie les créneaux de la semaine du 9 au 13 novembre et leurs totaux (CA-1, CA-6, CA-8)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const agenda = result.value;

    expect(agenda.today).toBe('2026-11-11');
    expect(agenda.timezone).toBe('Europe/Paris');
    expect(agenda.formations.map((formation) => formation.title)).toEqual([
      'SAP S/4HANA Finance',
      'Gestion de projet agile',
    ]);
    // Les 22 créneaux rédigés de la semaine (marges et créneaux agile compris).
    expect(agenda.slots).toHaveLength(22);
    expect(agenda.totals).toEqual({
      plannedMinutes: 1440,
      doneMinutes: 900,
      marginsRemaining: 3,
    });
    // Les statuts affichés sont planned, done, missed (BR-AGE-04).
    expect([...new Set(agenda.slots.map((slot) => slot.status))].sort()).toEqual([
      'done',
      'planned',
    ]);
    // Sélection par défaut : le quiz de validation du mercredi 11 à 14:00 (EF-9).
    const quiz = agenda.slots.find((slot) => slot.title === 'Quiz de validation');
    expect(quiz).toMatchObject({
      date: '2026-11-11',
      startMinutes: 840,
      endMinutes: 900,
      kind: 'validation_quiz',
      status: 'planned',
      moduleNumber: 3,
    });
  });

  it('calcule bornes, période de la légende et jours d’étude (ADR-0183)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    // Union des périodes des formations visibles : 26 oct. – 11 déc.
    expect(result.value.bounds).toEqual({ start: '2026-10-26', end: '2026-12-11' });
    // La légende du mini-calendrier suit la formation en cours du menu (SAP).
    expect(result.value.captionPeriod).toEqual({ start: '2026-11-02', end: '2026-12-11' });
    expect(result.value.studyDays).toEqual([1, 2, 3, 4, 5]);
    expect(result.value.currentFormationId).toBe(SAP);
  });

  it('réduit bornes, créneaux et totaux au filtre par formation (CA-5)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: AGILE,
    });
    if (!result.ok) throw new Error('agenda indisponible');
    expect(result.value.slots.map((slot) => slot.title)).toEqual([
      'Agile · apports',
      'Agile · apports',
    ]);
    expect(result.value.bounds).toEqual({ start: '2026-10-26', end: '2026-11-27' });
    expect(result.value.captionPeriod).toEqual({ start: '2026-10-26', end: '2026-11-27' });
    expect(result.value.totals).toEqual({
      plannedMinutes: 30,
      doneMinutes: 30,
      marginsRemaining: 0,
    });
  });

  it('cible « Ouvrir » selon ET-5 pour chaque type présent dans le seed (CA-7)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    const byTitle = (title: string) => result.value.slots.find((slot) => slot.title === title);
    const quiz = byTitle('Quiz de validation');
    expect(quiz?.href).toBe(`/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz`);
    const course = byTitle('Lecture du cours');
    expect(course?.href).toBe(`/formations/${SAP}/modules/${demoModuleId('sap', 3)}/cours`);
    const exercise = byTitle('Exercice pratique');
    const exerciseActivity = exercise?.activityId ?? '';
    expect(exerciseActivity).not.toBe('');
    expect(exercise?.href).toBe(
      `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/exercices/${exerciseActivity}`,
    );
    const revision = byTitle('Révision du module');
    expect(revision?.href).toBe(`/formations/${SAP}/quiz-global`);
    const globalQuiz = byTitle('Quiz global');
    expect(globalQuiz?.href).toBe(`/formations/${SAP}/quiz-global`);
    const margin = byTitle('Marge de rattrapage');
    expect(margin?.href).toBe('/agenda?vue=jour&date=2026-11-12');
    expect(
      agendaSlotHref({
        kind: 'mock_exam',
        formationId: SAP,
        moduleId: null,
        activityId: null,
        date: '2026-11-11',
      }),
    ).toBe(`/formations/${SAP}/examen-blanc`);
    expect(
      agendaSlotHref({
        kind: 'micro_session',
        formationId: SAP,
        moduleId: null,
        activityId: null,
        date: '2026-11-11',
      }),
    ).toBe(`/formations/${SAP}/quiz-global?mode=micro`);
    expect(
      agendaSlotHref({
        kind: 'warmup',
        formationId: SAP,
        moduleId: null,
        activityId: null,
        date: '2026-11-11',
      }),
    ).toBe('/accueil#echauffement');
    expect(
      agendaSlotHref({
        kind: 'weekly_review',
        formationId: SAP,
        moduleId: null,
        activityId: null,
        date: '2026-11-11',
      }),
    ).toBe('/accueil#bilan');
  });

  it('marque `movable` seulement pour un créneau prévu et futur (EF-9)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    const w2 = result.value.slots.find((slot) => slot.title === 'Quiz de validation');
    expect(w2?.movable).toBe(true);
    const l1 = result.value.slots.find((slot) => slot.title === 'Apports · Plan comptable');
    expect(l1?.movable).toBe(false);
  });

  it('recalcule le jour et les minutes locales dans un autre fuseau (CL-1)', async () => {
    if (stranger === null) throw new Error('utilisateur de test absent');
    const userId = stranger.userId;
    await serviceDb().execute(sql`
      insert into public.formations (id, owner_id, title, monogram, status, start_date, end_date, volume_hours, objectives, exam_format)
      values ('11111111-1111-4111-8111-111111111111'::uuid, ${userId}::uuid, 'Formation fuseau', 'FF', 'active', '2026-11-01', '2026-11-30', 20, '{}'::text[], null)
      on conflict (id) do nothing
    `);
    await serviceDb().execute(sql`
      update public.profiles set timezone = 'America/Toronto' where id = ${userId}::uuid
    `);
    await serviceDb().execute(sql`
      insert into public.schedule_slots (user_id, formation_id, kind, title, starts_at, ends_at, status, created_by)
      values
        (${userId}::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'course', 'Cours 09:00', '2026-11-11T14:00:00Z'::timestamptz, '2026-11-11T15:00:00Z'::timestamptz, 'planned', 'planner'),
        (${userId}::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'course', 'À cheval sur minuit', '2026-11-11T04:30:00Z'::timestamptz, '2026-11-11T05:30:00Z'::timestamptz, 'planned', 'planner')
    `);

    const result = await getAgenda(context(userId, createFixedClock()), {
      from: '2026-11-10',
      to: '2026-11-12',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    expect(result.value.timezone).toBe('America/Toronto');
    const morning = result.value.slots.find((slot) => slot.title === 'Cours 09:00');
    // 14:00Z = 09:00 à Toronto (UTC−5) : même jour, mêmes minutes locales.
    expect(morning).toMatchObject({
      date: '2026-11-11',
      startMinutes: 540,
      endMinutes: 600,
    });
    const crossing = result.value.slots.find((slot) => slot.title === 'À cheval sur minuit');
    // 04:30Z = 23:30 du 10 novembre à Toronto ; la fin (00:30 du 11) reste du lendemain.
    expect(crossing).toMatchObject({
      date: '2026-11-10',
      startMinutes: 1410,
      endMinutes: 30,
    });
  });

  it('masque les créneaux déplacés et annulés (CA-8)', async () => {
    if (stranger === null) throw new Error('utilisateur de test absent');
    const userId = stranger.userId;
    await serviceDb().execute(sql`
      insert into public.schedule_slots (user_id, formation_id, kind, title, starts_at, ends_at, status, created_by)
      values
        (${userId}::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'course', 'Déplacé', '2026-11-11T14:00:00Z'::timestamptz, '2026-11-11T15:00:00Z'::timestamptz, 'moved', 'planner'),
        (${userId}::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'course', 'Annulé', '2026-11-11T16:00:00Z'::timestamptz, '2026-11-11T17:00:00Z'::timestamptz, 'cancelled', 'planner'),
        (${userId}::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'course', 'Manqué', '2026-11-10T14:00:00Z'::timestamptz, '2026-11-10T15:00:00Z'::timestamptz, 'missed', 'planner')
    `);
    const result = await getAgenda(context(userId, createFixedClock()), {
      from: '2026-11-10',
      to: '2026-11-12',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    const titles = result.value.slots.map((slot) => slot.title);
    expect(titles).toContain('Manqué');
    expect(titles).not.toContain('Déplacé');
    expect(titles).not.toContain('Annulé');
  });

  it('refuse la formation d’un autre apprenant et l’appel sans session (CA-9)', async () => {
    const foreign = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      // Une formation qui n’existe pas pour Alex (aucune correspondance) → 404.
      formation: '22222222-2222-4222-8222-222222222222',
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');

    if (stranger === null) throw new Error('utilisateur de test absent');
    const notOwned = await getAgenda(context(stranger.userId, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: SAP,
    });
    expect(notOwned.ok).toBe(false);
    if (!notOwned.ok) expect(notOwned.error.code).toBe('NOT_FOUND');

    const anonymous = createServiceContext({
      userId: null,
      requestId: 'spec-704-agenda',
      clock: createFixedClock(),
    });
    const unauthenticated = await getAgenda(anonymous, {
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    expect(unauthenticated.ok).toBe(false);
    if (!unauthenticated.ok) expect(unauthenticated.error.code).toBe('UNAUTHENTICATED');
  });

  it('isole les créneaux par RLS : Alex ne voit pas les créneaux de Camille (CA-9)', async () => {
    const result = await getAgenda(context(ALEX, createFixedClock()), {
      from: '2026-11-09',
      to: '2026-11-10',
      formation: 'all',
    });
    if (!result.ok) throw new Error('agenda indisponible');
    expect(result.value.slots.map((slot) => slot.title)).not.toContain('Apports · tests');
  });
});
