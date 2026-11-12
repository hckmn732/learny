import { describe, expect, it } from 'vitest';

import { dueInWindow, type LocalWindow } from './time-window';

/** Window of the tick at `tickAt` (ISO UTC): `[T − 5 min, T + 55 min[` (ET-5). */
function windowOf(tickAt: string, timezone: string): LocalWindow {
  const tick = Date.parse(tickAt);
  return {
    windowStart: new Date(tick - 5 * 60_000).toISOString(),
    windowEnd: new Date(tick + 55 * 60_000).toISOString(),
    timezone,
  };
}

const due = (hhmm: `${number}:${number}`, tickAt: string, timezone: string) =>
  dueInWindow(hhmm, windowOf(tickAt, timezone))?.toISOString() ?? null;

describe('[SPEC-203] fenêtres locales', () => {
  it('CL-4 — fuseau à demi-heure (Asia/Kolkata, tick 02:05 UTC → 07:30–08:30)', () => {
    const w = windowOf('2026-11-11T02:05:00Z', 'Asia/Kolkata');
    expect(w.windowStart).toBe('2026-11-11T02:00:00.000Z');
    expect(due('07:30', '2026-11-11T02:05:00Z', 'Asia/Kolkata')).toBe('2026-11-11T02:00:00.000Z');
    expect(due('08:00', '2026-11-11T02:05:00Z', 'Asia/Kolkata')).toBe('2026-11-11T02:30:00.000Z');
    expect(due('08:30', '2026-11-11T02:05:00Z', 'Asia/Kolkata')).toBeNull();
    expect(due('07:29', '2026-11-11T02:05:00Z', 'Asia/Kolkata')).toBeNull();
  });

  it('CL-5 — passage à l’heure d’été (Europe/Paris, 29 mars 2026) : première minute valide', () => {
    // Fenêtre [01:00Z, 02:00Z) = 03:00–04:00 locale après le saut.
    expect(due('02:30', '2026-03-29T01:05:00Z', 'Europe/Paris')).toBe('2026-03-29T01:00:00.000Z');
    expect(due('02:00', '2026-03-29T01:05:00Z', 'Europe/Paris')).toBe('2026-03-29T01:00:00.000Z');
    // La fenêtre précédente (00:00–01:00Z = 01:00–02:00 locale) ne la renvoie pas.
    expect(due('02:30', '2026-03-29T00:05:00Z', 'Europe/Paris')).toBeNull();
    // Une heure ordinaire du même jour reste exacte.
    expect(due('03:30', '2026-03-29T01:05:00Z', 'Europe/Paris')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('CL-6 — passage à l’heure d’hiver (25 octobre 2026) : une seule occurrence, la première', () => {
    expect(due('02:30', '2026-10-25T00:05:00Z', 'Europe/Paris')).toBe('2026-10-25T00:30:00.000Z');
    expect(due('02:30', '2026-10-25T01:05:00Z', 'Europe/Paris')).toBeNull();
    expect(due('02:30', '2026-10-25T02:05:00Z', 'Europe/Paris')).toBeNull();
  });

  it('fenêtre chevauchant minuit (tick 22:05 UTC, Europe/Paris → 23:00–00:00)', () => {
    const w = windowOf('2026-11-11T22:05:00Z', 'Europe/Paris');
    expect(w.windowStart).toBe('2026-11-11T22:00:00.000Z');
    expect(due('23:30', '2026-11-11T22:05:00Z', 'Europe/Paris')).toBe('2026-11-11T22:30:00.000Z');
    expect(due('23:00', '2026-11-11T22:05:00Z', 'Europe/Paris')).toBe('2026-11-11T22:00:00.000Z');
    // 00:00 le lendemain est l’instant de fin : exclu.
    expect(due('00:00', '2026-11-11T22:05:00Z', 'Europe/Paris')).toBeNull();
  });

  it('fenêtre dont la fin franchit minuit local : l’heure du lendemain est trouvée', () => {
    // Tick 22:35 UTC → fenêtre 22:30Z–23:30Z = 23:30–00:30 locale (12 → 13 novembre).
    expect(due('00:10', '2026-11-12T22:35:00Z', 'Europe/Paris')).toBe('2026-11-12T23:10:00.000Z');
    expect(due('23:45', '2026-11-12T22:35:00Z', 'Europe/Paris')).toBe('2026-11-12T22:45:00.000Z');
  });

  it('fuseau Pacific/Kiritimati (UTC+14) : la date locale précède la date UTC', () => {
    // Tick 2026-11-11T07:05Z → fenêtre locale 21:00–22:00 le 11 novembre.
    expect(due('21:30', '2026-11-11T07:05:00Z', 'Pacific/Kiritimati')).toBe(
      '2026-11-11T07:30:00.000Z',
    );
    // Tick 2026-11-11T10:05Z → fenêtre locale 00:00–01:00 le 12 novembre.
    expect(due('00:00', '2026-11-11T10:05:00Z', 'Pacific/Kiritimati')).toBe(
      '2026-11-11T10:00:00.000Z',
    );
  });

  it('CA-4 — Europe/Paris et America/New_York à l’instant de référence', () => {
    expect(due('08:00', '2026-11-11T07:05:00Z', 'Europe/Paris')).toBe('2026-11-11T07:00:00.000Z');
    expect(due('08:59', '2026-11-11T07:05:00Z', 'Europe/Paris')).toBe('2026-11-11T07:59:00.000Z');
    expect(due('09:00', '2026-11-11T07:05:00Z', 'Europe/Paris')).toBeNull();
    expect(due('02:00', '2026-11-11T07:05:00Z', 'America/New_York')).toBe(
      '2026-11-11T07:00:00.000Z',
    );
  });

  it('une fenêtre vide ou invalide ne renvoie rien ou refuse', () => {
    const empty = {
      windowStart: '2026-11-11T07:00:00.000Z',
      windowEnd: '2026-11-11T07:00:00.000Z',
      timezone: 'Europe/Paris',
    };
    expect(dueInWindow('08:00', empty)).toBeNull();
    expect(() => dueInWindow('08:00', { ...empty, windowStart: 'nope' })).toThrow(RangeError);
  });
});
