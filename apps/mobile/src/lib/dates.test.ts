// Vitest [SPEC-3003] — dates in the user's time zone (BR-ACC-07, EF-1).
//
// The device of the test runs in `America/New_York`; the zone of the learner (`/me`) is
// `Europe/Paris`. Every assertion below would fail if the implementation read the device zone.
import { describe, expect, it } from 'vitest';

import {
  FALLBACK_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatIsoDay,
  formatTime,
  formatUserDate,
  isValidTimeZone,
  userTimeZone,
} from './dates';

/** 2026-11-11T12:20:00Z: 13:20 in Paris, 07:20 in New York. */
const INSTANT = new Date('2026-11-11T12:20:00Z');
/** 2026-11-11T23:30:00Z: already the 12th in Paris, still the 11th in New York. */
const LATE = new Date('2026-11-11T23:30:00Z');

describe('[SPEC-3003] dates dans le fuseau de l’utilisateur (BR-ACC-07)', () => {
  it('rend la date du fuseau demandé, jamais celle de l’appareil', () => {
    // The test process runs with TZ=UTC (vitest config); the device zone is irrelevant here.
    expect(formatDate(INSTANT, 'Europe/Paris')).toBe('11/11/2026');
    expect(formatDate(INSTANT, 'America/New_York')).toBe('11/11/2026');
    expect(formatDate(LATE, 'Europe/Paris')).toBe('12/11/2026');
    expect(formatDate(LATE, 'America/New_York')).toBe('11/11/2026');
    expect(formatTime(INSTANT, 'Europe/Paris')).toBe('13:20');
    expect(formatTime(INSTANT, 'America/New_York')).toBe('07:20');
    expect(formatDateTime(INSTANT, 'Europe/Paris')).toBe('11/11/2026 13:20');
    expect(formatIsoDay(LATE, 'Europe/Paris')).toBe('2026-11-12');
  });

  it('lit la zone sur /me et retombe sur Europe/Paris (BR-ACC-07)', () => {
    expect(userTimeZone({ timezone: 'America/New_York' })).toBe('America/New_York');
    expect(userTimeZone({ timezone: 'Europe/Paris' })).toBe('Europe/Paris');
    expect(userTimeZone(null)).toBe(FALLBACK_TIME_ZONE);
    expect(userTimeZone(undefined)).toBe(FALLBACK_TIME_ZONE);
    expect(userTimeZone({ timezone: null })).toBe(FALLBACK_TIME_ZONE);
    expect(userTimeZone({ timezone: 'Zone/Inconnue' })).toBe(FALLBACK_TIME_ZONE);
    expect(FALLBACK_TIME_ZONE).toBe('Europe/Paris');
  });

  it('applique la zone du profil à la date affichée (BR-ACC-07)', () => {
    // A learner whose profile says Paris reads the 12th, whatever the device says.
    expect(formatUserDate(LATE, { timezone: 'Europe/Paris' })).toBe('12/11/2026');
    expect(formatUserDate(LATE, { timezone: 'America/New_York' })).toBe('11/11/2026');
    expect(formatUserDate(LATE, null)).toBe('12/11/2026');
  });

  it('valide une zone IANA', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Pas/Une/Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
