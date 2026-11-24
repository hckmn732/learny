import { describe, expect, it } from 'vitest';

import {
  WeeklyReviewActionPayload,
  WeeklyReviewDto,
  formatWeeklyStudy,
  isAtRiskNotion,
  isoWeekKey,
  sortAtRiskNotions,
  sumPlanMinutes,
  weeklyPeriodLabel,
  weeklyReceivedLabel,
  weeklyRetentionLabel,
  weeklyReviewDedupeKey,
  weeklyReviewExternalChannels,
  weeklyReviewWeek,
} from './automatisme-9-bilan-de-la-semaine';

/**
 * [SPEC-720] « Bilan de la semaine » (BR-AUT-09, ADR-0190, ADR-0047).
 *
 * The module owns the local-week computation, the display helpers and the payload schemas; the
 * service composes them. These cases pin the boundaries the interface relies on (CL-4: a missing
 * measure is « Non disponible », never 0 %).
 */
const CLOCK = new Date('2026-11-11T12:20:00.000Z');

describe('[SPEC-720] semaine locale et libellés', () => {
  it('calcule la semaine ISO d’un lundi, y compris au changement d’année', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01');
    expect(isoWeekKey('pas une date')).toBe('pas une date');
    expect(isoWeekKey('2026-11-09')).toMatch(/^2026-W\d{2}$/);
  });

  it('décrit la semaine locale du bilan depuis l’horloge injectée', () => {
    const week = weeklyReviewWeek(CLOCK, 'Europe/Paris');
    expect(week.localDay).toBe('2026-11-11');
    expect(week.weekday).toBe(3);
    expect(week.weekStart).toBe('2026-11-09');
    expect(week.weekEnd).toBe('2026-11-11');
    expect(week.nextWeekStart).toBe('2026-11-16');
    expect(week.weekKey).toBe(isoWeekKey('2026-11-09'));
  });

  it('tient compte du fuseau au passage de minuit', () => {
    const late = new Date('2026-11-11T23:30:00.000Z');
    expect(weeklyReviewWeek(late, 'Europe/Paris').localDay).toBe('2026-11-12');
    expect(weeklyReviewWeek(late, 'UTC').localDay).toBe('2026-11-11');
  });

  it('formate les heures étudiées et la rétention', () => {
    expect(formatWeeklyStudy(0)).toBe('0 min');
    expect(formatWeeklyStudy(45)).toBe('45 min');
    expect(formatWeeklyStudy(780)).toBe('13 h');
    expect(formatWeeklyStudy(810)).toBe('13 h 30');
    expect(formatWeeklyStudy(-5)).toBe('0 min');
    expect(weeklyRetentionLabel(null)).toBe('Non disponible');
    expect(weeklyRetentionLabel(86.4)).toBe('86 %');
    expect(weeklyRetentionLabel(0)).toBe('0 %');
  });

  it('compose les libellés de période et de réception', () => {
    expect(weeklyPeriodLabel('2026-11-09', '2026-11-15')).toBe('9 – 15 nov.');
    expect(weeklyPeriodLabel('2026-10-26', '2026-11-01')).toBe('26 oct. – 1 nov.');
    expect(weeklyReceivedLabel(CLOCK, 'Europe/Paris')).toContain('reçu');
    expect(weeklyReceivedLabel(CLOCK, 'Europe/Paris')).toContain('13:20');
    expect(weeklyReceivedLabel('2026-11-11T18:00:00.000Z', 'Europe/Paris')).toContain('19:00');
  });

  it('construit la clé de déduplication et les canaux externes', () => {
    expect(weeklyReviewDedupeKey('user-1', '2026-W46')).toBe('weekly:user-1:2026-W46');
    expect(weeklyReviewExternalChannels('app')).toEqual([]);
    expect(weeklyReviewExternalChannels('app_email')).toEqual(['email']);
  });
});

describe('[SPEC-720] notions à risque et plan', () => {
  const base = {
    notionId: '11111111-1111-4111-8111-111111111111',
    label: 'Intégrales',
    mastery: 40,
    dueAt: null,
    gapNature: null,
    gapClearedAt: null,
  };

  it('applique le seuil de maîtrise de 60', () => {
    expect(isAtRiskNotion({ ...base, mastery: 60 }, CLOCK)).toBe(false);
    expect(isAtRiskNotion({ ...base, mastery: 59 }, CLOCK)).toBe(false);
  });

  it('retient une lacune ouverte ou une révision due', () => {
    expect(isAtRiskNotion({ ...base, gapNature: 'confusion' }, CLOCK)).toBe(true);
    expect(
      isAtRiskNotion({ ...base, gapNature: 'confusion', gapClearedAt: '2026-11-01T00:00:00Z' }, CLOCK),
    ).toBe(false);
    expect(isAtRiskNotion({ ...base, dueAt: '2026-11-10T00:00:00Z' }, CLOCK)).toBe(true);
    expect(isAtRiskNotion({ ...base, dueAt: '2026-11-12T00:00:00Z' }, CLOCK)).toBe(false);
  });

  it('trie par maîtrise, puis libellé, puis identifiant', () => {
    const first = { ...base, notionId: 'a', label: 'Alpha', mastery: 10 };
    const second = { ...base, notionId: 'b', label: 'Bêta', mastery: 10 };
    const third = { ...base, notionId: 'c', label: 'Gamma', mastery: 30 };
    expect(sortAtRiskNotions([third, second, first]).map((item) => item.label)).toEqual([
      'Alpha',
      'Bêta',
      'Gamma',
    ]);
  });

  it('additionne les minutes du plan', () => {
    expect(sumPlanMinutes([])).toBe(0);
    expect(
      sumPlanMinutes([
        { date: '2026-11-16', minutes: 30, slots: 1 },
        { date: '2026-11-17', minutes: 45, slots: 2 },
      ]),
    ).toBe(75);
  });
});

describe('[SPEC-720] schémas du bilan', () => {
  const payload = {
    dedupeKey: 'weekly:user-1:2026-W46',
    weekKey: '2026-W46',
    weekStart: '2026-11-09',
    weekEnd: '2026-11-11',
    nextWeekStart: '2026-11-16',
    reviewOn: '2026-11-11T12:20:00.000Z',
    studyMinutes: 780,
    retention: { horizonDays: 30, rate: 86.4, reviewed: 120, successful: 104 },
    atRiskNotions: [
      {
        notionId: '11111111-1111-4111-8111-111111111111',
        label: 'Intégrales',
        mastery: 40,
      },
    ],
    atRiskCount: 1,
    plan: [{ date: '2026-11-16', minutes: 30, slots: 1 }],
    planMinutes: 30,
    channel: 'app_email',
    availabilityHref: '/parametres#rythme',
  };

  it('accepte une charge de bilan complète et refuse une clé de semaine invalide', () => {
    expect(WeeklyReviewActionPayload.safeParse(payload).success).toBe(true);
    expect(
      WeeklyReviewActionPayload.safeParse({ ...payload, weekKey: '2026-46' }).success,
    ).toBe(false);
    expect(
      WeeklyReviewActionPayload.safeParse({ ...payload, availabilityHref: '//evil.example' }).success,
    ).toBe(false);
    expect(
      WeeklyReviewActionPayload.safeParse({ ...payload, planExtra: true }).success,
    ).toBe(false);
  });

  it('rend l’état vide explicite du bilan', () => {
    expect(
      WeeklyReviewDto.safeParse({ available: false, review: null, timezone: 'Europe/Paris' })
        .success,
    ).toBe(true);
    expect(
      WeeklyReviewDto.safeParse({ available: true, review: null, timezone: '' }).success,
    ).toBe(false);
  });
});
