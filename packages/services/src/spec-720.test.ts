// Unit rules of the weekly review (SPEC-720, BR-AUT-09).
//
// The helpers are pure: they receive the injected instant and the profile zone, never the process
// clock (ADR-0047). They pin the admitted settings, the local week and its year-week key around a
// DST change, the « Non disponible » retention, the at-risk rule and the channel decision that
// keeps an `app` review strictly inside the application (CA-1, CA-2, CL-4, CL-5).
import { describe, expect, it } from 'vitest';

import {
  formatWeeklyStudy,
  isAtRiskNotion,
  isoWeekKey,
  sortAtRiskNotions,
  sumPlanMinutes,
  WEEKLY_REVIEW_AVAILABILITY_HREF,
  WeeklyReviewParams,
  weeklyPeriodLabel,
  weeklyReceivedLabel,
  weeklyRetentionLabel,
  weeklyReviewDedupeKey,
  weeklyReviewExternalChannels,
  weeklyReviewWeek,
} from '@learny/contracts';

const PARIS = 'Europe/Paris';
const USER = '11111111-1111-4111-8111-111111111111';

describe('[SPEC-720] règles et calculs', () => {
  it('CA-1 — le dimanche à 19:00 local produit une semaine locale stable', () => {
    expect(WeeklyReviewParams.parse({})).toEqual({
      weekday: 7,
      hour: 19,
      channel: 'app',
    });

    const sunday = new Date('2026-11-08T18:00:00.000Z');
    const week = weeklyReviewWeek(sunday, PARIS);
    expect(week).toMatchObject({
      localDay: '2026-11-08',
      weekday: 7,
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
      nextWeekStart: '2026-11-09',
      weekKey: '2026-W45',
    });
    expect(isoWeekKey('2026-11-02')).toBe('2026-W45');
    expect(weeklyReviewDedupeKey(USER, week.weekKey)).toBe(`weekly:${USER}:2026-W45`);

    // The same local week always carries the same key: a replayed tick cannot duplicate the row.
    const earlier = weeklyReviewWeek(new Date('2026-11-05T08:00:00.000Z'), PARIS);
    expect(earlier.weekKey).toBe(week.weekKey);
    expect(weeklyReviewDedupeKey(USER, earlier.weekKey)).toBe(
      weeklyReviewDedupeKey(USER, week.weekKey),
    );
  });

  it('CL-5 — un dimanche de changement d’heure reste une seule semaine locale', () => {
    const spring = weeklyReviewWeek(new Date('2026-03-29T17:00:00.000Z'), PARIS);
    expect(spring).toMatchObject({
      localDay: '2026-03-29',
      weekStart: '2026-03-23',
      weekEnd: '2026-03-29',
      nextWeekStart: '2026-03-30',
    });
    const autumn = weeklyReviewWeek(new Date('2026-10-25T18:00:00.000Z'), PARIS);
    expect(autumn).toMatchObject({
      localDay: '2026-10-25',
      weekStart: '2026-10-19',
      nextWeekStart: '2026-10-26',
    });
    expect(autumn.weekKey).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('CA-2 — le canal application reste sans livraison externe, app + e-mail autorise l’e-mail', () => {
    expect(weeklyReviewExternalChannels('app')).toEqual([]);
    expect(weeklyReviewExternalChannels('app_email')).toEqual(['email']);
    expect(
      WeeklyReviewParams.safeParse({ weekday: 5, hour: 18, channel: 'app_email' }).success,
    ).toBe(true);
    for (const weekday of [1, 2, 3, 4]) {
      expect(WeeklyReviewParams.safeParse({ weekday }).success).toBe(false);
    }
    for (const hour of [17, 21]) {
      expect(WeeklyReviewParams.safeParse({ hour }).success).toBe(false);
    }
    expect(WeeklyReviewParams.safeParse({ channel: 'email' }).success).toBe(false);
  });

  it('CL-4 — une mesure absente vaut « Non disponible », jamais 0 %', () => {
    expect(formatWeeklyStudy(0)).toBe('0 min');
    expect(formatWeeklyStudy(780)).toBe('13 h');
    expect(formatWeeklyStudy(90)).toBe('1 h 30');
    expect(weeklyRetentionLabel(null)).toBe('Non disponible');
    expect(weeklyRetentionLabel(85.71428571428571)).toBe('86 %');
    expect(weeklyRetentionLabel(0)).toBe('0 %');
  });

  it('ET-4 — une notion à risque est sous 60 % et due ou porteuse d’une lacune ouverte', () => {
    const now = new Date('2026-11-11T12:20:00.000Z');
    const base = {
      notionId: '22222222-2222-4222-8222-222222222222',
      label: 'Clé de comptabilisation',
      mastery: 35,
      dueAt: null,
      gapNature: null,
      gapClearedAt: null,
    } as const;
    expect(isAtRiskNotion({ ...base, mastery: 60, gapNature: 'confusion' }, now)).toBe(false);
    expect(isAtRiskNotion({ ...base, gapNature: 'confusion' }, now)).toBe(true);
    expect(isAtRiskNotion({ ...base, dueAt: '2026-11-10T08:00:00.000Z' }, now)).toBe(true);
    expect(isAtRiskNotion({ ...base, dueAt: '2026-12-10T08:00:00.000Z' }, now)).toBe(false);
    expect(
      isAtRiskNotion(
        {
          ...base,
          dueAt: '2026-12-10T08:00:00.000Z',
          gapNature: 'confusion',
          gapClearedAt: '2026-11-09T08:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);

    const sorted = sortAtRiskNotions([
      { notionId: '33333333-3333-4333-8333-333333333333', label: 'B', mastery: 55 },
      { notionId: '44444444-4444-4444-8444-444444444444', label: 'A', mastery: 55 },
      { notionId: '55555555-5555-4555-8555-555555555555', label: 'C', mastery: 28 },
    ]);
    expect(sorted.map((notion) => notion.label)).toEqual(['C', 'A', 'B']);
  });

  it('EF-2 — les libellés du bilan sont déterministes et le plan se somme', () => {
    expect(weeklyPeriodLabel('2026-11-02', '2026-11-08')).toBe('2 – 8 nov.');
    expect(weeklyPeriodLabel('2026-10-26', '2026-11-01')).toBe('26 oct. – 1 nov.');
    expect(weeklyReceivedLabel('2026-11-08T18:00:00.000Z', PARIS)).toBe('reçu dim. 19:00');
    expect(
      sumPlanMinutes([
        { date: '2026-11-09', minutes: 120, slots: 2 },
        { date: '2026-11-10', minutes: 60, slots: 1 },
      ]),
    ).toBe(180);
    expect(WEEKLY_REVIEW_AVAILABILITY_HREF).toBe('/parametres#rythme');
  });
});
