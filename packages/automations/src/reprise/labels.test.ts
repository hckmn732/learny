import { describe, expect, it } from 'vitest';

import { formatDayLabel, formatHour, formatSlotLabel } from './labels';

const TZ = 'Europe/Paris';
const REFERENCE = '2026-11-11T12:20:00Z';

describe('[SPEC-712] reprise · libellés', () => {
  it('EF-8 — un créneau dans les six jours affiche le jour de la semaine', () => {
    expect(formatSlotLabel('2026-11-12T15:00:00+01:00', REFERENCE, TZ)).toBe('Jeudi 15:00');
    expect(formatSlotLabel('2026-11-13T09:00:00+01:00', REFERENCE, TZ)).toBe('Vendredi 9:00');
    expect(formatDayLabel('2026-11-10', REFERENCE, TZ)).toBe('mardi');
  });

  it('EF-8 — au-delà de six jours, la date courte est affichée', () => {
    expect(formatSlotLabel('2026-11-16T09:00:00+01:00', REFERENCE, TZ)).toBe('Lundi 16 nov., 9:00');
    expect(formatDayLabel('2026-11-16', REFERENCE, TZ)).toBe('lundi 16 nov.');
    expect(formatSlotLabel('2026-12-07T14:00:00+01:00', REFERENCE, TZ)).toBe('Lundi 7 déc., 14:00');
  });

  it('CL-9 — l’heure locale fait foi, y compris après un changement d’heure', () => {
    expect(formatHour('2026-10-25T00:30:00Z', TZ)).toBe('2:30');
    expect(formatHour('2026-10-25T01:30:00Z', TZ)).toBe('2:30');
    expect(formatHour('2026-10-25T02:30:00Z', TZ)).toBe('3:30');
    expect(formatHour('2026-10-20T07:05:00Z', 'America/Montreal')).toBe('3:05');
  });
});
