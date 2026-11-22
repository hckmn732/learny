// Unit tests of the injectable clock (SPEC-3001 ET-4, CL-5, ADR-0047, ADR-3004 § 7).
import { describe, expect, it } from 'vitest';

import {
  APP_TIME_ZONE,
  createAppClock,
  DEFAULT_FIXED_AT,
  formatClockTime,
  nowLabel,
} from './clock';

describe('[SPEC-3001] horloge de l’application', () => {
  it('fige l’horloge sur EXPO_PUBLIC_CLOCK_FIXED_AT', () => {
    const fixed = createAppClock(DEFAULT_FIXED_AT);

    expect(fixed.now().toISOString()).toBe(new Date(DEFAULT_FIXED_AT).toISOString());
    // Two reads return the same instant: nothing reads the system time.
    expect(fixed.now().getTime()).toBe(fixed.now().getTime());
  });

  it('affiche 13:20 à Paris pour l’instant de référence de la piste mobile', () => {
    const fixed = createAppClock(DEFAULT_FIXED_AT);

    expect(formatClockTime(fixed.now())).toBe('13:20');
    expect(formatClockTime(fixed.now(), 'UTC')).toBe('12:20');
  });

  it('respecte le passage à l’heure d’hiver', () => {
    // 2026-12-01T12:20:00Z is 13:20 in Paris (UTC+1) as well.
    const winter = createAppClock('2026-12-01T11:20:00Z');

    expect(formatClockTime(winter.now())).toBe('12:20');
  });

  it('retombe sur l’horloge système quand aucune date n’est fixée', () => {
    const system = createAppClock(null);

    expect(system.now()).toBeInstanceOf(Date);
  });

  it('expose l’instant par défaut et le fuseau de la maquette', () => {
    expect(DEFAULT_FIXED_AT).toBe('2026-11-11T12:20:00Z');
    expect(APP_TIME_ZONE).toBe('Europe/Paris');
  });

  it('produit un libellé HH:MM à deux chiffres', () => {
    const fixed = createAppClock('2026-11-11T04:05:00Z');

    expect(formatClockTime(fixed.now(), 'UTC')).toBe('04:05');
    expect(nowLabel('UTC')).toHaveLength(5);
  });
});
