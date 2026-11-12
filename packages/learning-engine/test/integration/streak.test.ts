import { describe, expect, it } from 'vitest';

import {
  calculateStreak,
  detectMilestones,
  instantAt,
  localDateOf,
  withParams,
} from '../../src/index';
import type { DailyActivityEntry } from '../../src/index';

const PARIS = 'Europe/Paris';
const AT = '2026-11-11T12:20:00.000Z';

function entry(
  at: string,
  kind: DailyActivityEntry['kind'] = 'quiz',
  durationSeconds?: number,
): DailyActivityEntry {
  return durationSeconds === undefined ? { at, kind } : { at, kind, durationSeconds };
}

describe('[SPEC-409] composition', () => {
  it('compose l’activité quotidienne, l’horloge et les paramètres ENGINE', () => {
    const params = withParams('streak');
    const result = calculateStreak({
      dailyActivity: [
        entry(instantAt('2026-11-06', '19:00', PARIS)),
        entry(instantAt('2026-11-09', '19:00', PARIS), 'exercise'),
        entry(instantAt('2026-11-10', '19:00', PARIS), 'reading', 300),
      ],
      studyDays: [1, 2, 3, 4, 5],
      pauses: [],
      at: AT,
      timeZone: PARIS,
      params,
    });

    // Friday, Monday and Tuesday are consecutive study days; the unplanned weekend is neutral.
    expect(result.days).toBe(3);
    expect(result.calendar).toHaveLength(params.regularityDays);
    expect(result.calendar.at(-1)?.date).toBe(localDateOf(AT, PARIS));
    expect(result.lastQualifyingDay).toBe('2026-11-10');
  });

  it('applique une surcharge de paramètres sans changer le contrat', () => {
    const params = withParams('streak', {
      readingMinSeconds: 600,
      regularityDays: 7,
      maxLookbackDays: 3,
    });
    const result = calculateStreak({
      dailyActivity: [
        entry(instantAt('2026-11-09', '19:00', PARIS), 'reading'),
        entry(instantAt('2026-11-10', '19:00', PARIS), 'reading'),
      ],
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      pauses: [],
      at: AT,
      timeZone: PARIS,
      params,
    });

    expect(result.days).toBe(0);
    expect(result.calendar).toHaveLength(7);
    expect(result.lastQualifyingDay).toBeNull();
  });

  it('reste invariante à la répétition et ne redouble pas les jalons', () => {
    const params = withParams('streak');
    const source = {
      dailyActivity: [
        entry(instantAt('2026-11-09', '19:00', PARIS)),
        entry(instantAt('2026-11-10', '19:00', PARIS)),
      ],
      studyDays: [1, 2, 3, 4, 5] as const,
      pauses: [],
      at: AT,
      timeZone: PARIS,
      params,
    };
    const first = calculateStreak(source);
    const second = calculateStreak(source);
    const milestones = withParams('milestones');
    const milestoneParams = {
      notionsRetained: milestones.notionsRetained,
      streakDays: milestones.streakDays,
    };
    const detected = detectMilestones({
      previousKeys: [],
      validatedModules: [],
      masteredNotions: milestones.notionsRetained,
      streakDays: first.days,
      params: milestoneParams,
    });
    const recalculated = detectMilestones({
      previousKeys: detected.map((milestone) => milestone.key),
      validatedModules: [],
      masteredNotions: milestones.notionsRetained,
      streakDays: second.days,
      params: milestoneParams,
    });

    expect(first).toEqual(second);
    expect(detected.map((milestone) => milestone.kind)).toEqual(['notions_100']);
    expect(recalculated).toEqual([]);
  });

  it('compose correctement autour d’un changement d’heure', () => {
    const params = withParams('streak');
    const at = instantAt('2026-10-26', '13:00', PARIS);
    const previousEvening = instantAt('2026-10-25', '23:30', PARIS);
    const result = calculateStreak({
      dailyActivity: [
        entry(instantAt('2026-10-24', '23:30', PARIS)),
        entry(previousEvening),
        entry(instantAt('2026-10-26', '00:30', PARIS)),
      ],
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      pauses: [],
      at,
      timeZone: PARIS,
      params,
    });

    expect(localDateOf(previousEvening, PARIS)).toBe('2026-10-25');
    expect(result.calendar.at(-1)?.date).toBe('2026-10-26');
    expect(result.lastQualifyingDay).toBe('2026-10-26');
    expect(result.days).toBe(3);
  });
});
