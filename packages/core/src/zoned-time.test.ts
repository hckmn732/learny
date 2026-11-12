import { describe, expect, it } from 'vitest';

import { localTimeToInstant, zonedParts } from './zoned-time';

describe('[SPEC-203] fuseaux : champs locaux', () => {
  it.each([
    ['2026-11-11T07:05:00Z', 'Europe/Paris', '2026-11-11', 8, 5, 3, 60],
    ['2026-11-11T07:05:00Z', 'Asia/Kolkata', '2026-11-11', 12, 35, 3, 330],
    ['2026-11-11T07:05:00Z', 'America/New_York', '2026-11-11', 2, 5, 3, -300],
    ['2026-11-11T07:05:00Z', 'Pacific/Kiritimati', '2026-11-11', 21, 5, 3, 840],
    ['2026-11-11T07:05:00Z', 'Pacific/Auckland', '2026-11-11', 20, 5, 3, 780],
    ['2026-11-15T23:30:00Z', 'Europe/Paris', '2026-11-16', 0, 30, 1, 60],
    ['2026-11-15T22:30:00Z', 'Europe/Paris', '2026-11-15', 23, 30, 7, 60],
    ['2026-07-01T12:00:00Z', 'Europe/Paris', '2026-07-01', 14, 0, 3, 120],
  ])('%s en %s', (instant, zone, localDate, hour, minute, weekday, offset) => {
    const parts = zonedParts(instant, zone);
    expect(parts).toMatchObject({
      localDate,
      hour,
      minute,
      weekday,
      offsetMinutes: offset,
    });
  });

  it('accepte une instance Date et refuse un fuseau ou un instant invalides', () => {
    expect(zonedParts(new Date('2026-11-11T12:20:00Z'), 'Europe/Paris').hour).toBe(13);
    expect(() => zonedParts('2026-11-11T12:20:00Z', 'Mars/Olympus')).toThrow(RangeError);
    expect(() => zonedParts('pas une date', 'Europe/Paris')).toThrow(RangeError);
  });
});

describe('[SPEC-203] fuseaux : heure locale vers instant', () => {
  const iso = (value: Date) => value.toISOString();

  it.each([
    ['2026-11-11', '08:00', 'Europe/Paris', '2026-11-11T07:00:00.000Z'],
    ['2026-07-01', '08:00', 'Europe/Paris', '2026-07-01T06:00:00.000Z'],
    ['2026-11-11', '07:30', 'Asia/Kolkata', '2026-11-11T02:00:00.000Z'],
    ['2026-11-11', '02:00', 'America/New_York', '2026-11-11T07:00:00.000Z'],
    ['2026-11-11', '00:00', 'Pacific/Kiritimati', '2026-11-10T10:00:00.000Z'],
  ])('%s %s en %s', (date, hhmm, zone, expected) => {
    expect(iso(localTimeToInstant(date, hhmm, zone))).toBe(expected);
  });

  it('place une heure inexistante (avancement) à la première minute valide suivante', () => {
    // Paris, 29 mars 2026 : 02:00 → 03:00 à 01:00 UTC.
    expect(iso(localTimeToInstant('2026-03-29', '02:30', 'Europe/Paris'))).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    expect(iso(localTimeToInstant('2026-03-29', '02:00', 'Europe/Paris'))).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    expect(iso(localTimeToInstant('2026-03-29', '03:00', 'Europe/Paris'))).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    // New York, 8 mars 2026 : 02:00 → 03:00 à 07:00 UTC.
    expect(iso(localTimeToInstant('2026-03-08', '02:15', 'America/New_York'))).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('prend la première occurrence d’une heure ambiguë (recul)', () => {
    // Paris, 25 octobre 2026 : 03:00 → 02:00 à 01:00 UTC ; 02:30 existe à 00:30 et 01:30 UTC.
    expect(iso(localTimeToInstant('2026-10-25', '02:30', 'Europe/Paris'))).toBe(
      '2026-10-25T00:30:00.000Z',
    );
    expect(iso(localTimeToInstant('2026-11-01', '01:30', 'America/New_York'))).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('est cohérente avec zonedParts hors des changements d’heure', () => {
    const zones = ['Europe/Paris', 'Asia/Kolkata', 'America/New_York', 'Pacific/Auckland'];
    for (const zone of zones) {
      const instant = localTimeToInstant('2026-11-11', '09:45', zone);
      expect(zonedParts(instant, zone)).toMatchObject({
        localDate: '2026-11-11',
        hour: 9,
        minute: 45,
      });
    }
  });

  it('refuse une date, une heure ou un fuseau invalides', () => {
    expect(() => localTimeToInstant('2026-02-30', '08:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => localTimeToInstant('11/11/2026', '08:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => localTimeToInstant('2026-11-11', '24:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => localTimeToInstant('2026-11-11', '8:00', 'Europe/Paris')).toThrow(RangeError);
    expect(() => localTimeToInstant('2026-11-11', '08:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});
