import { describe, expect, it } from 'vitest';

import { formatDueInterval } from './interval';

// SPEC-701 ET-7, CA-10 — civil days in the learner's zone, DST included.
const NOW = new Date('2026-11-11T12:20:00Z');
const TZ = 'Europe/Paris';

describe('[SPEC-701] formatDueInterval', () => {
  it.each([
    ['2026-11-11T20:00:00Z', 'Aujourd’hui'],
    ['2026-11-12T08:00:00Z', 'Demain'],
    ['2026-11-13T08:00:00Z', 'Dans 2 jours'],
    ['2026-11-17T08:00:00Z', 'Dans 6 jours'],
    ['2026-11-24T08:00:00Z', 'Dans 13 jours'],
    ['2026-11-25T08:00:00Z', 'Dans 2 semaines'],
    ['2026-12-01T08:00:00Z', 'Dans 2 semaines'],
    ['2027-01-10T08:00:00Z', 'Dans 2 mois'],
    ['2027-03-11T08:00:00Z', 'Dans 4 mois'],
  ])('CA-10 — %s → %s', (dueAt, expected) => {
    expect(formatDueInterval(dueAt, NOW, TZ)).toBe(expected);
  });

  it('CA-10 — le passage à l’heure d’hiver ne décale pas d’un jour', () => {
    const before = new Date('2026-10-24T12:00:00Z');
    expect(formatDueInterval('2026-10-25T12:00:00Z', before, TZ)).toBe('Demain');
    expect(formatDueInterval('2026-10-26T12:00:00Z', before, TZ)).toBe('Dans 2 jours');
  });

  it('CA-10 — une échéance passée ou du jour reste « Aujourd’hui »', () => {
    expect(formatDueInterval('2026-11-10T08:00:00Z', NOW, TZ)).toBe('Aujourd’hui');
    expect(formatDueInterval('invalide', NOW, TZ)).toBe('Aujourd’hui');
  });
});
