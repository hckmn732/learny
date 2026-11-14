import { describe, expect, it } from 'vitest';

import { calculateStreak, type StreakCalendarDay } from '@learny/learning-engine';

import {
  milestoneLabel,
  nextMilestoneOf,
  toRegularity,
} from './serie-regularite-et-jalons-interface';

const PARIS = 'Europe/Paris';

function calendar(): StreakCalendarDay[] {
  return [
    { date: '2026-10-29', status: 'missed' },
    { date: '2026-10-30', status: 'missed' },
    { date: '2026-10-31', status: 'studied' },
    { date: '2026-11-01', status: 'neutral' },
    { date: '2026-11-02', status: 'studied' },
  ];
}

describe('[SPEC-723] règles et calculs', () => {
  it('CA-1 — mappe les trois états du moteur sur les cases du menu', () => {
    expect(toRegularity(calendar())).toEqual([
      { date: '2026-10-29', status: 'none' },
      { date: '2026-10-30', status: 'none' },
      { date: '2026-10-31', status: 'done' },
      { date: '2026-11-01', status: 'neutral' },
      { date: '2026-11-02', status: 'done' },
    ]);
  });

  it('CA-1 — le seed du 11 novembre donne 12 jours et 14 cases, un jour neutre ne coupe pas', () => {
    const seed = [
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ];
    const base = {
      studyDays: [1, 2, 3, 4, 5] as const,
      at: '2026-11-11T12:20:00.000Z',
      timeZone: PARIS,
      params: { readingMinSeconds: 300, regularityDays: 14, maxLookbackDays: 3660 },
    };
    const result = calculateStreak({
      ...base,
      studyDays: [...base.studyDays],
      dailyActivity: seed.map((day) => ({ at: `${day}T12:00:00.000Z`, kind: 'quiz' })),
      pauses: [],
    });
    expect(result.days).toBe(12);
    expect(result.calendar).toHaveLength(14);
    expect(result.calendar.map((day) => day.date)).toEqual(
      [...result.calendar.map((day) => day.date)].sort(),
    );
    expect(result.calendar.filter((day) => day.status === 'studied')).toHaveLength(12);

    // CL-3 — a paused day without activity stays neutral in the middle of the strip.
    const paused = calculateStreak({
      ...base,
      studyDays: [...base.studyDays],
      dailyActivity: seed
        .filter((day) => day !== '2026-11-04')
        .map((day) => ({ at: `${day}T12:00:00.000Z`, kind: 'quiz' })),
      pauses: [{ startsOn: '2026-11-04', endsOn: '2026-11-04' }],
    });
    expect(paused.days).toBe(11);
    expect(paused.calendar.find((day) => day.date === '2026-11-04')?.status).toBe('neutral');
    expect(
      paused.calendar.every((day) => ['studied', 'neutral', 'missed'].includes(day.status)),
    ).toBe(true);
  });

  it('CA-2 — les libellés de jalons restent sobres et sans classement', () => {
    expect(milestoneLabel('notions_100')).toBe('100 notions retenues');
    expect(milestoneLabel('streak_30')).toBe('30 jours de série');
    expect(milestoneLabel('module_validated:abc', 'Comptabilité générale')).toBe(
      'Module « Comptabilité générale » validé',
    );
    for (const label of [
      milestoneLabel('notions_100'),
      milestoneLabel('streak_30'),
      milestoneLabel('module_validated:abc'),
    ]) {
      expect(label).not.toMatch(/classement|premier|mieux|plus vite|score/i);
    }
  });

  it('CA-2 — le prochain jalon est le plus proche, à ordre déterministe', () => {
    const openModule = { id: 'm1', title: 'Comptabilité générale' };
    expect(
      nextMilestoneOf({
        streakDays: 12,
        masteredNotions: 0,
        openModule,
        notionsGoal: 100,
        streakGoal: 30,
      }),
    ).toEqual({
      kind: 'module_validated',
      key: 'module_validated:m1',
      remaining: 1,
      label: 'Module « Comptabilité générale » à valider',
    });
    expect(
      nextMilestoneOf({ streakDays: 29, masteredNotions: 99, openModule: null }),
    ).toMatchObject({ kind: 'notions_100', remaining: 1 });
    expect(nextMilestoneOf({ streakDays: 30, masteredNotions: 100, openModule: null })).toBeNull();
    expect(
      nextMilestoneOf({
        streakDays: 12,
        masteredNotions: 0,
        openModule: null,
        notionsGoal: 100,
        streakGoal: 30,
      }),
    ).toMatchObject({ kind: 'streak_30', remaining: 18 });
  });

  it('CA-2, CL-2 — une valeur limite exacte déclenche le jalon sans doublon de calcul', () => {
    expect(nextMilestoneOf({ streakDays: 30, masteredNotions: 100, openModule: null })).toBeNull();
    expect(nextMilestoneOf({ streakDays: 29, masteredNotions: 100, openModule: null })).toEqual({
      kind: 'streak_30',
      key: 'streak_30',
      remaining: 1,
      label: '30 jours de série',
    });
  });
});
