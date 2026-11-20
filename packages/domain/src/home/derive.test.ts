import { describe, expect, it } from 'vitest';

import {
  civilDayLabel,
  completedSummary,
  deferredDayLabel,
  formatDuration,
  highlightedSlot,
  minutesUntil,
  moduleStatusPill,
  nextActivity,
  nextActivityDetail,
  nextActivityLabel,
  objectiveLabels,
  primaryActionFor,
  slotHref,
  slotState,
} from './derive';

const NOW = '2026-11-11T12:20:00.000Z';
const TZ = 'Europe/Paris';

function slot(
  overrides: Partial<{
    id: string;
    kind: Parameters<typeof slotState>[0]['kind'];
    status: 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';
    startsAt: string;
    endsAt: string;
  }> = {},
) {
  return {
    id: 'slot-1',
    kind: 'validation_quiz' as const,
    status: 'planned' as const,
    startsAt: '2026-11-11T13:00:00.000Z',
    endsAt: '2026-11-11T14:00:00.000Z',
    ...overrides,
  };
}

describe('[SPEC-603] dérivations de l’accueil', () => {
  it('déduit l’état d’un créneau (EF-2, CA-4)', () => {
    expect(slotState(slot({ status: 'done' }), NOW)).toBe('done');
    expect(slotState(slot({ status: 'missed' }), NOW)).toBe('missed');
    expect(
      slotState(
        slot({
          startsAt: '2026-11-11T12:00:00.000Z',
          endsAt: '2026-11-11T13:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe('ongoing');
    expect(slotState(slot(), NOW, { highlightId: 'slot-1' })).toBe('next');
    expect(slotState(slot({ id: 'other' }), NOW, { highlightId: 'slot-1' })).toBe('upcoming');
    expect(slotState(slot({ kind: 'warmup' }), NOW)).toBe('todo');
    expect(slotState(slot({ kind: 'micro_session' }), NOW)).toBe('todo');
    expect(slotState(slot({ kind: 'global_quiz' }), NOW)).toBe('upcoming');
    expect(slotState(slot({ status: 'moved', startsAt: '2026-11-11T15:00:00.000Z' }), NOW)).toBe(
      'upcoming',
    );
    expect(
      slotState(slot({ status: 'cancelled', startsAt: '2026-11-11T15:00:00.000Z' }), NOW),
    ).toBe('upcoming');
  });

  it('met en avant le premier créneau planifié hors échauffement et micro-séance', () => {
    const slots = [
      slot({ id: 'done', status: 'done', startsAt: '2026-11-11T08:00:00.000Z' }),
      slot({ id: 'warmup', kind: 'warmup', startsAt: '2026-11-11T12:30:00.000Z' }),
      slot({ id: 'quiz', startsAt: '2026-11-11T13:00:00.000Z' }),
      slot({ id: 'later', kind: 'course', startsAt: '2026-11-11T15:00:00.000Z' }),
    ];
    expect(highlightedSlot(slots, NOW)?.id).toBe('quiz');
    expect(minutesUntil(slot({ startsAt: '2026-11-11T13:00:00.000Z' }), NOW)).toBe(40);
    expect(minutesUntil(slot({ startsAt: '2026-11-10T13:00:00.000Z' }), NOW)).toBe(0);
    const none = highlightedSlot([slot({ id: 'done-only', status: 'done' })], NOW);
    expect(none).toBeUndefined();
  });

  it('formate les durées en heures et minutes (EF-2)', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(300)).toBe('5 h');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(-5)).toBe('0 min');
  });

  it('traduit les objectifs dans l’ordre de la formation (EF-6)', () => {
    expect(objectiveLabels(['operational', 'exam'])).toEqual([
      'Être opérationnel',
      'Certification',
    ]);
    expect(objectiveLabels(['dialogue', 'project'])).toEqual([
      'Dialoguer avec des experts',
      'Livrer un projet',
    ]);
    expect(objectiveLabels([])).toEqual([]);
  });

  it('choisit la pastille du module ouvert dans l’ordre de EF-6 (CA-4)', () => {
    const base = {
      contributionsInProgress: false,
      courseStatus: 'ready' as const,
      readingPercent: 100,
      attemptCount: 2,
      lastScore: 90,
      threshold: 80,
    };
    expect(moduleStatusPill({ ...base, lastScore: 58 })).toEqual({
      label: 'Quiz à repasser',
      tone: 'orange',
    });
    expect(moduleStatusPill({ ...base, attemptCount: 0, lastScore: null })).toEqual({
      label: 'Quiz à passer',
      tone: 'indigo',
    });
    expect(moduleStatusPill({ ...base, readingPercent: 35 })).toEqual({
      label: 'Cours à lire',
      tone: 'violet',
    });
    expect(moduleStatusPill({ ...base, readingPercent: null, courseStatus: 'generating' })).toEqual(
      { label: 'Cours en préparation', tone: 'indigo' },
    );
    expect(
      moduleStatusPill({
        ...base,
        readingPercent: null,
        courseStatus: null,
        contributionsInProgress: true,
      }),
    ).toEqual({ label: 'Apports en cours', tone: 'green' });
    expect(
      moduleStatusPill({
        ...base,
        readingPercent: null,
        courseStatus: null,
        contributionsInProgress: false,
      }),
    ).toBeNull();

    // Une contribution en cours bloque les étapes de quiz : le cours n'existe pas encore.
    expect(
      moduleStatusPill({
        ...base,
        readingPercent: null,
        courseStatus: 'generating',
        contributionsInProgress: true,
        attemptCount: 0,
        lastScore: null,
      }),
    ).toEqual({ label: 'Cours en préparation', tone: 'indigo' });
    expect(
      moduleStatusPill({
        ...base,
        readingPercent: null,
        courseStatus: null,
        contributionsInProgress: true,
        attemptCount: 0,
        lastScore: null,
      }),
    ).toEqual({ label: 'Apports en cours', tone: 'green' });
  });

  it('rend la prochaine activité en jour relatif ou daté (EF-6)', () => {
    expect(nextActivityLabel({ startsAt: '2026-11-11T13:00:00.000Z' }, NOW, TZ)).toBe(
      "Aujourd'hui, 14:00",
    );
    expect(nextActivityLabel({ startsAt: '2026-11-12T16:30:00.000Z' }, NOW, TZ)).toBe(
      'Demain, 17:30',
    );
    const dated = nextActivityLabel({ startsAt: '2026-11-13T08:00:00.000Z' }, NOW, TZ);
    expect(dated).toContain('13 nov.');
    expect(dated).toContain('09:00');
    expect(
      nextActivity(
        {
          kind: 'contributions',
          startsAt: '2026-11-12T16:30:00.000Z',
          meta: 'Rétrospectives, chapitre 2',
        },
        NOW,
        TZ,
      ),
    ).toEqual({ when: 'Demain, 17:30', detail: 'Apports, chapitre 2' });
    expect(
      nextActivityDetail({ kind: 'contributions', startsAt: NOW, meta: 'sans chapitre' }),
    ).toBe('Apports');
    expect(nextActivityDetail({ kind: 'validation_quiz', startsAt: NOW, meta: null })).toBe(
      'Quiz de validation',
    );
    expect(nextActivity(null, NOW, TZ)).toBeNull();
  });

  it('formate la date de la journée et les jours de report (EF-1, EF-4)', () => {
    expect(civilDayLabel('2026-11-11', TZ)).toBe('Mercredi 11 novembre');
    expect(deferredDayLabel('2026-11-12', '2026-11-11', TZ)).toBe('jeudi');
    expect(deferredDayLabel('2026-11-19', '2026-11-11', TZ)).toContain('19 nov.');
  });

  it('résume une formation terminée (EF-7)', () => {
    expect(
      completedSummary({
        startDate: '2026-08-24',
        completedAt: '2026-09-18T16:00:00.000Z',
        volumeHours: 60,
        timeZone: TZ,
      }),
    ).toEqual({ completedOn: '2026-09-18', dateLabel: '18 sept. 2026', weeks: 4, hours: 60 });
    expect(
      completedSummary({
        startDate: null,
        completedAt: '2026-07-02T16:00:00.000Z',
        volumeHours: 80,
        timeZone: TZ,
      }),
    ).toEqual({ completedOn: '2026-07-02', dateLabel: '2 juil. 2026', weeks: null, hours: 80 });
    expect(
      completedSummary({
        startDate: '2026-08-24',
        completedAt: null,
        volumeHours: null,
        timeZone: TZ,
      }),
    ).toEqual({ completedOn: null, dateLabel: null, weeks: null, hours: null });
  });

  it('construit l’action principale et le lien d’un créneau (ET-4)', () => {
    const base = { formationId: 'f1', moduleId: 'm1', activityId: 'a1' };
    expect(primaryActionFor({ ...base, kind: 'validation_quiz' })?.href).toBe(
      '/formations/f1/modules/m1/quiz',
    );
    expect(primaryActionFor({ ...base, kind: 'course' })?.label).toBe('Reprendre le cours');
    expect(primaryActionFor({ ...base, kind: 'contributions' })?.href).toBe(
      '/formations/f1/modules/m1',
    );
    expect(primaryActionFor({ ...base, kind: 'exercise' })?.href).toBe(
      '/formations/f1/modules/m1/exercices/a1',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'exercise' })?.href).toBe(
      '/formations/f1/programme/exercices',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'global_quiz' })?.href).toBe(
      '/formations/f1/quiz-global',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'revision' })?.label).toBe(
      'Réviser maintenant',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'sprint' })?.label).toBe(
      'Réviser maintenant',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'mock_exam' })?.href).toBe(
      '/formations/f1/examen-blanc',
    );
    expect(primaryActionFor({ formationId: 'f1', kind: 'buffer' })).toBeNull();
    expect(primaryActionFor({ formationId: 'f1', kind: 'weekly_review' })).toBeNull();
    expect(primaryActionFor(null)).toBeNull();
    expect(slotHref({ ...base, kind: 'warmup' })).toBe('#echauffement');
    expect(slotHref({ ...base, kind: 'micro_session' })).toBe(
      '/formations/f1/quiz-global?mode=micro',
    );
    expect(slotHref({ ...base, kind: 'global_quiz' })).toBe('/formations/f1/quiz-global');
    expect(slotHref({ formationId: 'f1', kind: 'buffer' })).toBe('/formations/f1/programme');
  });
});
