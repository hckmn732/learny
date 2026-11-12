import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import { REFERENCE_NOW } from '@learny/testing/clock';

import { EngineError } from './errors';
import {
  addDays,
  compareDates,
  daysBetween,
  formatInstant,
  formatLocalTime,
  instantAt,
  isInstantIso,
  isIsoDate,
  isLocalTime,
  isTimeZone,
  isoWeekday,
  localDateOf,
  localMinutesOf,
  parseInstant,
  parseLocalTime,
  startOfLocalDay,
} from './time';
import type { IsoDate } from './types';

const FAST_CHECK = { seed: 20261111, numRuns: 200 } as const;
const PARIS = 'Europe/Paris';
const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';
const ZONES = [PARIS, 'America/New_York', 'Asia/Tokyo', KIRITIMATI] as const;

function engineError(run: () => unknown, code: string, path?: string): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe(code);
    if (path !== undefined) expect(engine.details?.path).toBe(path);
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

describe('[SPEC-401] temps du moteur', () => {
  describe('table de référence (CA-4)', () => {
    it.each([
      ['instantAt', instantAt('2026-11-11', '09:00', PARIS), '2026-11-11T08:00:00.000Z'],
      ['instantAt printemps', instantAt('2027-03-28', '02:30', PARIS), '2027-03-28T01:30:00.000Z'],
      ['instantAt automne', instantAt('2026-10-25', '02:30', PARIS), '2026-10-25T00:30:00.000Z'],
      ['localDateOf Kiritimati', localDateOf(REFERENCE_NOW, KIRITIMATI), '2026-11-12'],
      ['localMinutesOf Paris', localMinutesOf(REFERENCE_NOW, PARIS), 800],
      ['isoWeekday', isoWeekday('2026-11-11'), 3],
      ['daysBetween', daysBetween('2026-11-02', '2026-12-11'), 39],
      ['addDays bissextile', addDays('2028-02-28', 1), '2028-02-29'],
    ])('%s', (_label, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe('cas limites CL-1 à CL-5', () => {
    it.each(['2026-11-11 12:20', '2026-13-01T00:00:00Z', '2026-02-30T00:00:00.000Z', ''])(
      'refuse l’instant %j (CL-1)',
      (value) => {
        engineError(() => parseInstant(value), 'INVALID_INSTANT');
        expect(isInstantIso(value)).toBe(false);
      },
    );

    it('refuse une date civile ou un fuseau invalides avec le chemin Zod (CL-2)', () => {
      engineError(() => addDays('2026-02-30', 1), 'INVALID_INPUT', 'date');
      engineError(() => instantAt('2026-02-30', '09:00', PARIS), 'INVALID_INPUT', 'date');
      engineError(() => localDateOf(REFERENCE_NOW, 'Europe/Pariss'), 'INVALID_INPUT', 'tz');
      engineError(() => startOfLocalDay('2026-11-11', 'Europe/Pariss'), 'INVALID_INPUT');
      expect(isIsoDate('2026-02-30')).toBe(false);
      expect(isTimeZone('Europe/Pariss')).toBe(false);
    });

    it('applique la règle des changements d’heure (CL-3)', () => {
      expect(instantAt('2027-03-28', '02:30', PARIS)).toBe('2027-03-28T01:30:00.000Z');
      expect(instantAt('2026-10-25', '02:30', PARIS)).toBe('2026-10-25T00:30:00.000Z');
    });

    it('gère les fuseaux très décalés (CL-4)', () => {
      expect(localDateOf(REFERENCE_NOW, KIRITIMATI)).toBe('2026-11-12');
      expect(localDateOf(REFERENCE_NOW, PAGO_PAGO)).toBe('2026-11-11');
      expect(localMinutesOf(REFERENCE_NOW, KIRITIMATI)).toBe(140);
      expect(localMinutesOf(REFERENCE_NOW, PAGO_PAGO)).toBe(80);
    });

    it('traverse les fins de mois et les années bissextiles sans fuseau (CL-5)', () => {
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
      expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    });
  });

  describe('propriétés', () => {
    it('localDateOf(instantAt(d, t, tz), tz) redonne le jour local', () => {
      const day = fc
        .tuple(fc.integer({ min: 0, max: 1095 }), fc.integer({ min: 0, max: 47 }))
        .map(([offset, halfHour]) => ({
          date: addDays('2026-01-01', offset),
          time: `${String(Math.floor(halfHour / 2)).padStart(2, '0')}:${halfHour % 2 === 0 ? '00' : '30'}`,
        }));
      fc.assert(
        fc.property(day, fc.constantFrom(...ZONES), ({ date, time }, zone) => {
          expect(localDateOf(instantAt(date, time, zone), zone)).toBe(date);
        }),
        FAST_CHECK,
      );
    });

    it('addDays et daysBetween sont inverses', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1095 }).map((offset) => addDays('2026-01-01', offset)),
          fc.integer({ min: -365, max: 365 }),
          (date, days) => {
            expect(addDays(addDays(date, days), -days)).toBe(date);
            expect(daysBetween(date, addDays(date, days))).toBe(days);
          },
        ),
        FAST_CHECK,
      );
    });
  });

  it('convertit les heures locales et les instants', () => {
    expect(parseLocalTime('00:00')).toBe(0);
    expect(parseLocalTime('23:59')).toBe(1439);
    expect(formatLocalTime(0)).toBe('00:00');
    expect(formatLocalTime(1439)).toBe('23:59');
    expect(parseInstant(REFERENCE_NOW)).toBe(Date.parse(REFERENCE_NOW));
    expect(formatInstant(parseInstant(REFERENCE_NOW))).toBe(REFERENCE_NOW);
    expect(startOfLocalDay('2026-11-11', PARIS)).toBe('2026-11-10T23:00:00.000Z');
    expect(startOfLocalDay('2026-11-11', KIRITIMATI)).toBe('2026-11-10T10:00:00.000Z');
    expect(compareDates('2026-11-02', '2026-12-11')).toBe(-1);
    expect(compareDates('2026-11-02', '2026-11-02')).toBe(0);
    expect(compareDates('2026-12-11', '2026-11-02')).toBe(1);
    expect(isLocalTime('24:00')).toBe(false);
    engineError(() => parseLocalTime('24:00'), 'INVALID_INPUT', 'time');
    engineError(() => formatLocalTime(1440), 'INVALID_INPUT', 'minutes');
    engineError(() => formatInstant(Number.NaN), 'INVALID_INSTANT');
    engineError(() => formatInstant(Number.POSITIVE_INFINITY), 'INVALID_INSTANT');
    expect(ENGINE.fsrs.requestRetention).toBe(0.9);
  });

  it('compare des dates typées et gère les siècles non bissextiles', () => {
    expect(addDays('1900-02-28', 1)).toBe('1900-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('2000-03-01', -1)).toBe('2000-02-29');
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2026-04-30')).toBe(true);
    expect(isLocalTime('9:00')).toBe(false);
    expect(isInstantIso('2026-11-11T12:20:00.000Z')).toBe(true);
    expect(compareDates('2026-11-11', '2026-11-12')).toBe(-1);
  });

  it('refuse une durée non entière et compare des dates typées', () => {
    engineError(() => addDays('2026-11-11', 1.5), 'INVALID_INPUT', 'n');
    engineError(() => daysBetween('2026-11-11', 'pas une date'), 'INVALID_INPUT', 'b');
    engineError(() => isoWeekday('2026-11-11x'), 'INVALID_INPUT', 'date');
    engineError(() => compareDates('2026-11-11', '2026-11-11x'), 'INVALID_INPUT', 'b');
    const date: IsoDate = '2026-11-11';
    expect(isoWeekday(date)).toBe(3);
  });
});
