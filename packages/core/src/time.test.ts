import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { clock } from './clock';
import { isAppError } from './errors';
import {
  DEFAULT_QUIET_HOURS,
  DEFAULT_TIME_ZONE,
  detectUserTimeZone,
  endOfUserDay,
  formatUserDate,
  instantsAtLocalTime,
  isQuietHours,
  isValidIanaZone,
  localTimeToShiftedInstant,
  nextOutsideQuietHours,
  parseTimeZone,
  startOfUserDay,
  toInstant,
  toUserZone,
  userDayBounds,
  userLocalDay,
  userLocalHour,
  userWeekday,
} from './time';

const PARIS = 'Europe/Paris';
const HOUR_MS = 3_600_000;

const iso = (date: Date) => date.toISOString();
const hoursOf = (bounds: { start: Date; end: Date }) =>
  (bounds.end.getTime() - bounds.start.getTime()) / HOUR_MS;

function validationError(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('aucune erreur levée');
}

describe('[SPEC-207] local time', () => {
  describe('fixed clock and Paris (CA-1)', () => {
    it('serves the reference instant of ADR-0047 to every call', () => {
      expect(iso(clock.now())).toBe('2026-11-11T12:20:00.000Z');
      expect(clock.now().getTime()).toBe(clock.now().getTime());
    });

    it('shows 13:20 in Paris at the fixed instant, with offset and zone name (EF-2)', () => {
      expect(toUserZone(clock.now(), PARIS)).toEqual({
        instant: '2026-11-11T12:20:00.000Z',
        timeZone: PARIS,
        date: '2026-11-11',
        time: '13:20',
        year: 2026,
        month: 11,
        day: 11,
        hour: 13,
        minute: 20,
        second: 0,
        weekday: 3,
        offsetMinutes: 60,
        offset: '+01:00',
        zoneName: 'heure normale d’Europe centrale',
      });
    });

    it('formats in French with the given zone (EF-2)', () => {
      expect(formatUserDate(clock.now(), PARIS)).toBe('mercredi 11 novembre 2026 à 13:20');
      expect(formatUserDate(clock.now(), 'Asia/Tokyo')).toBe('mercredi 11 novembre 2026 à 21:20');
      expect(formatUserDate('2026-07-14T10:00:00Z', PARIS, { day: 'numeric', month: 'long' })).toBe(
        '14 juillet',
      );
    });

    it('does not let the options replace the zone', () => {
      const options = { timeZone: 'Asia/Tokyo', timeStyle: 'short' } as const;
      expect(formatUserDate(clock.now(), PARIS, options)).toBe('13:20');
    });

    it('gives the half-open bounds of the local day (EF-3, ET-4)', () => {
      const bounds = userDayBounds('2026-11-11', PARIS);
      expect(iso(bounds.start)).toBe('2026-11-10T23:00:00.000Z');
      expect(iso(bounds.end)).toBe('2026-11-11T23:00:00.000Z');
      expect(hoursOf(bounds)).toBe(24);
      expect(iso(startOfUserDay('2026-11-11', PARIS))).toBe('2026-11-10T23:00:00.000Z');
      expect(iso(endOfUserDay('2026-11-11', PARIS))).toBe('2026-11-11T23:00:00.000Z');
    });

    it('puts an event exactly at the end bound in the new day (ET-4)', () => {
      const { start, end } = userDayBounds('2026-11-11', PARIS);
      expect(userLocalDay(start, PARIS)).toBe('2026-11-11');
      expect(userLocalDay(new Date(end.getTime() - 1), PARIS)).toBe('2026-11-11');
      expect(userLocalDay(end, PARIS)).toBe('2026-11-12');
      expect(userLocalDay(new Date(start.getTime() - 1), PARIS)).toBe('2026-11-10');
    });

    it('uses the summer offset in summer (ET-2)', () => {
      const summer = toUserZone('2026-07-14T10:00:00Z', PARIS);
      expect(summer.time).toBe('12:00');
      expect(summer.offset).toBe('+02:00');
      expect(summer.zoneName).toBe('heure d’été d’Europe centrale');
      expect(iso(startOfUserDay('2026-07-14', PARIS))).toBe('2026-07-13T22:00:00.000Z');
    });

    it('accepts an ISO string with an explicit offset', () => {
      expect(toUserZone('2026-11-11T14:20:00+02:00', PARIS).time).toBe('13:20');
      expect(toUserZone('2026-11-11T12:20Z', PARIS).time).toBe('13:20');
    });
  });

  describe('local hour and weekday (EF-4)', () => {
    it('does not run a Monday-local job on the Sunday local day', () => {
      // 23:30 UTC on Sunday 8 November is already Monday 00:30 in Paris.
      const sundayUtc = '2026-11-08T23:30:00Z';
      expect(new Date(sundayUtc).getUTCDay()).toBe(0);
      expect(userWeekday(sundayUtc, PARIS)).toBe(1);
      expect(userLocalHour(sundayUtc, PARIS)).toBe(0);
      // And the other way round: Monday 05:00 UTC is still Sunday evening in Los Angeles.
      expect(userWeekday('2026-11-09T05:00:00Z', 'America/Los_Angeles')).toBe(7);
      expect(userLocalHour('2026-11-09T05:00:00Z', 'America/Los_Angeles')).toBe(21);
    });

    it('numbers the weekdays from Monday = 1 to Sunday = 7', () => {
      const days = [9, 10, 11, 12, 13, 14, 15].map((day) =>
        userWeekday(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`, 'UTC'),
      );
      expect(days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('selects the users whose local hour is 8 at a given UTC instant', () => {
      const instant = '2026-11-11T07:00:00Z';
      const zones = [PARIS, 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
      expect(zones.filter((zone) => userLocalHour(instant, zone) === 8)).toEqual([PARIS]);
    });
  });

  describe('extreme zones (CL-7)', () => {
    it('computes the local day independently of the UTC day, at UTC+14 and UTC−12', () => {
      const instant = '2026-11-11T23:30:00Z';
      expect(userLocalDay(instant, 'UTC')).toBe('2026-11-11');
      expect(userLocalDay(instant, 'Pacific/Kiritimati')).toBe('2026-11-12');
      expect(userLocalDay(instant, 'Etc/GMT+12')).toBe('2026-11-11');
      expect(toUserZone(instant, 'Pacific/Kiritimati').offset).toBe('+14:00');
      expect(toUserZone(instant, 'Etc/GMT+12').offset).toBe('-12:00');
      expect(userLocalHour(instant, 'Pacific/Kiritimati')).toBe(13);
      expect(userLocalHour(instant, 'Etc/GMT+12')).toBe(11);
    });

    it('bounds the local day of the extreme zones on their own midnight', () => {
      expect(iso(startOfUserDay('2026-11-11', 'Pacific/Kiritimati'))).toBe(
        '2026-11-10T10:00:00.000Z',
      );
      expect(iso(endOfUserDay('2026-11-11', 'Pacific/Kiritimati'))).toBe(
        '2026-11-11T10:00:00.000Z',
      );
      expect(iso(startOfUserDay('2026-11-11', 'Etc/GMT+12'))).toBe('2026-11-11T12:00:00.000Z');
      expect(iso(endOfUserDay('2026-11-11', 'Etc/GMT+12'))).toBe('2026-11-12T12:00:00.000Z');
    });

    it('survives a skipped calendar day (Samoa, 30 December 2011) with an empty interval', () => {
      const bounds = userDayBounds('2011-12-30', 'Pacific/Apia');
      expect(hoursOf(bounds)).toBe(0);
      expect(hoursOf(userDayBounds('2011-12-31', 'Pacific/Apia'))).toBe(24);
    });
  });

  describe('clock changes (CA-2)', () => {
    it('lasts 23 hours on the spring change in Paris and does not invent 02:30 (CL-2)', () => {
      const bounds = userDayBounds('2027-03-28', PARIS);
      expect(iso(bounds.start)).toBe('2027-03-27T23:00:00.000Z');
      expect(iso(bounds.end)).toBe('2027-03-28T22:00:00.000Z');
      expect(hoursOf(bounds)).toBe(23);
      expect(instantsAtLocalTime('2027-03-28', '02:30', PARIS)).toEqual([]);
      expect(instantsAtLocalTime('2027-03-28', '03:30', PARIS).map(iso)).toEqual([
        '2027-03-28T01:30:00.000Z',
      ]);
      // 01:59 is CET (+01:00), 03:00 is CEST (+02:00): one hour of wall clock is missing.
      expect(toUserZone('2027-03-28T00:59:00Z', PARIS).time).toBe('01:59');
      expect(toUserZone('2027-03-28T01:00:00Z', PARIS).time).toBe('03:00');
    });

    it('lasts 25 hours on the autumn change in Paris and keeps the two 02:30 apart (CL-3)', () => {
      const bounds = userDayBounds('2026-10-25', PARIS);
      expect(iso(bounds.start)).toBe('2026-10-24T22:00:00.000Z');
      expect(iso(bounds.end)).toBe('2026-10-25T23:00:00.000Z');
      expect(hoursOf(bounds)).toBe(25);

      const twice = instantsAtLocalTime('2026-10-25', '02:30', PARIS);
      expect(twice.map(iso)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
      expect(twice.map((instant) => toUserZone(instant, PARIS).time)).toEqual(['02:30', '02:30']);
      expect(twice.map((instant) => toUserZone(instant, PARIS).offset)).toEqual([
        '+02:00',
        '+01:00',
      ]);
      expect(new Set(twice.map((instant) => instant.getTime())).size).toBe(2);
    });

    it('chains the days around a change without gap or overlap', () => {
      for (const days of [
        ['2027-03-27', '2027-03-28', '2027-03-29'],
        ['2026-10-24', '2026-10-25', '2026-10-26'],
      ] as const) {
        const [a, b, c] = days.map((day) => userDayBounds(day, PARIS));
        expect(a?.end.getTime()).toBe(b?.start.getTime());
        expect(b?.end.getTime()).toBe(c?.start.getTime());
      }
    });

    it('handles a half-hour change (Lord Howe) and a change at midnight (Havana)', () => {
      expect(hoursOf(userDayBounds('2026-10-04', 'Australia/Lord_Howe'))).toBe(23.5);
      expect(hoursOf(userDayBounds('2026-04-05', 'Australia/Lord_Howe'))).toBe(24.5);
      // Havana: midnight does not exist in spring, and is read twice in autumn.
      expect(hoursOf(userDayBounds('2026-03-08', 'America/Havana'))).toBe(23);
      expect(hoursOf(userDayBounds('2026-11-01', 'America/Havana'))).toBe(25);
      expect(userLocalHour(startOfUserDay('2026-03-08', 'America/Havana'), 'America/Havana')).toBe(
        1,
      );
    });

    it('computes the same bounds whatever the zone spelling of the process', () => {
      expect(iso(startOfUserDay('2027-03-28', PARIS))).toBe(
        iso(startOfUserDay('2027-03-28', 'Europe/Paris')),
      );
    });
  });

  describe('quiet hours (CA-3)', () => {
    const quiet = { timeZone: PARIS } as const;

    it('exposes the 21:00–08:00 default of BR-NOT-04', () => {
      expect(DEFAULT_QUIET_HOURS).toEqual({ start: '21:00', end: '08:00' });
      expect(DEFAULT_TIME_ZONE).toBe('Europe/Paris');
    });

    it('includes 21:00 and excludes 08:00 (CL-4)', () => {
      // 20:00Z = 21:00 in Paris on 11 November (CET).
      expect(isQuietHours('2026-11-11T19:59:59.999Z', quiet)).toBe(false);
      expect(isQuietHours('2026-11-11T20:00:00Z', quiet)).toBe(true);
      expect(isQuietHours('2026-11-11T23:30:00Z', quiet)).toBe(true);
      expect(isQuietHours('2026-11-11T06:59:59.999Z', quiet)).toBe(true);
      expect(isQuietHours('2026-11-11T07:00:00Z', quiet)).toBe(false);
      expect(isQuietHours(clock.now(), quiet)).toBe(false);
    });

    it('follows the local clock in summer and winter (ET-2)', () => {
      // 19:00Z is 21:00 in summer (CEST) and 20:00 in winter (CET).
      expect(isQuietHours('2026-07-14T19:00:00Z', quiet)).toBe(true);
      expect(isQuietHours('2026-11-11T19:00:00Z', quiet)).toBe(false);
    });

    it('supports a range that does not cross midnight (CL-5)', () => {
      const day = { start: '08:00', end: '12:00', timeZone: PARIS };
      expect(isQuietHours('2026-11-11T06:59:59Z', day)).toBe(false);
      expect(isQuietHours('2026-11-11T07:00:00Z', day)).toBe(true);
      expect(isQuietHours('2026-11-11T10:59:59Z', day)).toBe(true);
      expect(isQuietHours('2026-11-11T11:00:00Z', day)).toBe(false);
    });

    it('treats start = end as no quiet hours (CL-6)', () => {
      const none = { start: '08:00', end: '08:00', timeZone: PARIS };
      for (const at of ['2026-11-11T07:00:00Z', '2026-11-11T22:00:00Z', '2026-11-11T12:20:00Z']) {
        expect(isQuietHours(at, none)).toBe(false);
        expect(iso(nextOutsideQuietHours(at, none))).toBe(iso(new Date(at)));
      }
    });

    it('returns the instant itself when sending is allowed (EF-6)', () => {
      const now = clock.now();
      const next = nextOutsideQuietHours(now, quiet);
      expect(iso(next)).toBe(iso(now));
      expect(next).not.toBe(now);
      expect(iso(nextOutsideQuietHours('2026-11-11T07:00:00.123Z', quiet))).toBe(
        '2026-11-11T07:00:00.123Z',
      );
    });

    it('defers to the next 08:00 local from the evening and from the night (EF-6)', () => {
      // Evening: 22:30 in Paris on the 11th -> 08:00 on the 12th.
      expect(iso(nextOutsideQuietHours('2026-11-11T21:30:00Z', quiet))).toBe(
        '2026-11-12T07:00:00.000Z',
      );
      // Exactly 21:00 is quiet -> next morning.
      expect(iso(nextOutsideQuietHours('2026-11-11T20:00:00Z', quiet))).toBe(
        '2026-11-12T07:00:00.000Z',
      );
      // After midnight -> the same morning.
      expect(iso(nextOutsideQuietHours('2026-11-11T23:30:00Z', quiet))).toBe(
        '2026-11-12T07:00:00.000Z',
      );
      expect(iso(nextOutsideQuietHours('2026-11-12T03:00:00Z', quiet))).toBe(
        '2026-11-12T07:00:00.000Z',
      );
      // One millisecond before the end is still quiet.
      expect(iso(nextOutsideQuietHours('2026-11-12T06:59:59.999Z', quiet))).toBe(
        '2026-11-12T07:00:00.000Z',
      );
    });

    it('defers across a spring change with the summer offset (08:00 CEST = 06:00Z)', () => {
      expect(iso(nextOutsideQuietHours('2027-03-27T22:00:00Z', quiet))).toBe(
        '2027-03-28T06:00:00.000Z',
      );
    });

    it('defers across an autumn change with the winter offset (08:00 CET = 07:00Z)', () => {
      expect(iso(nextOutsideQuietHours('2026-10-24T20:00:00Z', quiet))).toBe(
        '2026-10-25T07:00:00.000Z',
      );
    });

    it('returns the instant of the jump when the end boundary is skipped by the clock', () => {
      const skipped = { start: '23:00', end: '02:30', timeZone: PARIS };
      const next = nextOutsideQuietHours('2027-03-27T22:30:00Z', skipped);
      expect(iso(next)).toBe('2027-03-28T01:00:00.000Z');
      expect(toUserZone(next, PARIS).time).toBe('03:00');
      expect(isQuietHours(next, skipped)).toBe(false);
      expect(isQuietHours(new Date(next.getTime() - 1), skipped)).toBe(true);
    });

    it('returns the first reading after the instant when the end boundary is read twice', () => {
      const repeated = { start: '21:00', end: '02:30', timeZone: PARIS };
      const first = nextOutsideQuietHours('2026-10-25T00:10:00Z', repeated);
      expect(iso(first)).toBe('2026-10-25T00:30:00.000Z');
      const second = nextOutsideQuietHours('2026-10-25T01:10:00Z', repeated);
      expect(iso(second)).toBe('2026-10-25T01:30:00.000Z');
      for (const next of [first, second]) {
        expect(isQuietHours(next, repeated)).toBe(false);
        expect(toUserZone(next, PARIS).time).toBe('02:30');
      }
    });

    it('always lands outside quiet hours and in the future, across a year of instants', () => {
      const zones = [PARIS, 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Kiritimati'];
      const windows = [
        { start: '21:00', end: '08:00' },
        { start: '01:30', end: '03:30' },
        { start: '23:00', end: '02:30' },
      ];
      const start = Date.parse('2026-01-01T00:00:00Z');
      for (const timeZone of zones) {
        for (const window of windows) {
          for (let step = 0; step < 24 * 366; step += 5) {
            const at = new Date(start + step * HOUR_MS + 17 * 60_000);
            const next = nextOutsideQuietHours(at, { ...window, timeZone });
            expect(isQuietHours(next, { ...window, timeZone })).toBe(false);
            expect(next.getTime()).toBeGreaterThanOrEqual(at.getTime());
            expect(next.getTime() - at.getTime()).toBeLessThanOrEqual(26 * HOUR_MS);
          }
        }
      }
    });

    it('gives two users in different zones their own answer', () => {
      const at = '2026-11-11T21:30:00Z';
      expect(isQuietHours(at, { timeZone: PARIS })).toBe(true);
      expect(isQuietHours(at, { timeZone: 'America/New_York' })).toBe(false);
      expect(isQuietHours(at, { timeZone: 'Asia/Tokyo' })).toBe(true);
    });
  });

  describe('validation (CA-4)', () => {
    it.each(['', 'Mars/Phobos', 'europe/paris', 'EUROPE/PARIS', 'Europe/PARIS', '+01:00', ' UTC'])(
      'refuses the invalid zone %j with a validation error (EF-2, CL-1)',
      (zone) => {
        const error = validationError(() => toUserZone(clock.now(), zone));
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(error.errors?.[0]?.path).toBe('timeZone');
        expect(() => parseTimeZone(zone)).toThrow(error.detail);
        expect(() => startOfUserDay('2026-11-11', zone)).toThrow(error.detail);
        expect(() => endOfUserDay('2026-11-11', zone)).toThrow(error.detail);
        expect(() => userLocalHour(clock.now(), zone)).toThrow(error.detail);
        expect(() => userWeekday(clock.now(), zone)).toThrow(error.detail);
        expect(() => userLocalDay(clock.now(), zone)).toThrow(error.detail);
        expect(() => formatUserDate(clock.now(), zone)).toThrow(error.detail);
        expect(() => isQuietHours(clock.now(), { timeZone: zone })).toThrow(error.detail);
        expect(() => nextOutsideQuietHours(clock.now(), { timeZone: zone })).toThrow(error.detail);
        expect(() => instantsAtLocalTime('2026-11-11', '08:00', zone)).toThrow(error.detail);
      },
    );

    it('refuses a zone that is not a string', () => {
      expect(() => parseTimeZone(undefined)).toThrow('Fuseau horaire IANA invalide.');
      expect(() => parseTimeZone(42)).toThrow('Fuseau horaire IANA invalide.');
    });

    it.each([PARIS, 'UTC', 'Etc/GMT+12', 'America/New_York', 'Pacific/Kiritimati'])(
      'accepts the zone %s',
      (zone) => {
        expect(parseTimeZone(zone)).toBe(zone);
      },
    );

    it('accepts legitimate aliases that the engine canonicalises (Asia/Kolkata, Europe/Kyiv)', () => {
      for (const zone of [
        'Asia/Kolkata',
        'Europe/Kyiv',
        'Asia/Ho_Chi_Minh',
        'America/Argentina/Buenos_Aires',
        'Asia/Kathmandu',
      ]) {
        expect(parseTimeZone(zone)).toBe(zone);
        expect(toUserZone(clock.now(), zone).timeZone).toBe(zone);
      }
      expect(toUserZone(clock.now(), 'Asia/Kolkata').time).toBe('17:50');
      // The shared validator of SPEC-202 stays as it is: it only knows the canonical spellings.
      expect(isValidIanaZone(PARIS)).toBe(true);
      expect(isValidIanaZone('Mars/Phobos')).toBe(false);
    });

    it('falls back to Europe/Paris when the browser gives nothing usable (EF-7)', () => {
      expect(detectUserTimeZone()).toBe('Europe/Paris');
      expect(detectUserTimeZone(undefined)).toBe('Europe/Paris');
      expect(detectUserTimeZone(null)).toBe('Europe/Paris');
      expect(detectUserTimeZone('')).toBe('Europe/Paris');
      expect(detectUserTimeZone('Mars/Phobos')).toBe('Europe/Paris');
      expect(detectUserTimeZone('+05:30')).toBe('Europe/Paris');
      expect(detectUserTimeZone('europe/london')).toBe('Europe/Paris');
    });

    it('keeps the IANA name given by the browser (EF-7)', () => {
      expect(detectUserTimeZone('America/Montreal')).toBe('America/Montreal');
      expect(detectUserTimeZone('Asia/Calcutta')).toBe('Asia/Calcutta');
      expect(detectUserTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(detectUserTimeZone('UTC')).toBe('UTC');
    });

    it.each([
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-1-1',
      '26-11-11',
      '',
      '2026-11-11T00:00',
    ])('refuses the civil day %j (ET-3)', (day) => {
      const error = validationError(() => startOfUserDay(day, PARIS));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.errors?.[0]?.path).toBe('day');
    });

    it('accepts a leap day only in a leap year', () => {
      expect(iso(startOfUserDay('2028-02-29', PARIS))).toBe('2028-02-28T23:00:00.000Z');
      expect(() => startOfUserDay('2027-02-29', PARIS)).toThrow('Date civile invalide');
      expect(iso(endOfUserDay('2028-02-28', PARIS))).toBe('2028-02-28T23:00:00.000Z');
      expect(iso(endOfUserDay('2026-12-31', PARIS))).toBe('2026-12-31T23:00:00.000Z');
    });

    it.each(['24:00', '7:00', '12:60', '08:00:30', '0800', '', '23:5'])(
      'refuses the time %j (ET-3)',
      (time) => {
        const error = validationError(() =>
          isQuietHours(clock.now(), { start: time, timeZone: PARIS }),
        );
        expect(error.errors?.[0]?.path).toBe('start');
        expect(() => isQuietHours(clock.now(), { end: time, timeZone: PARIS })).toThrow(
          'Heure invalide',
        );
        expect(() => instantsAtLocalTime('2026-11-11', time, PARIS)).toThrow('Heure invalide');
      },
    );

    it('accepts 00:00, 23:59 and the HH:mm:00 form that PostgreSQL gives for a time column', () => {
      expect(isQuietHours(clock.now(), { start: '00:00', end: '23:59', timeZone: PARIS })).toBe(
        true,
      );
      expect(
        isQuietHours('2026-11-11T20:00:00Z', {
          start: '21:00:00',
          end: '08:00:00',
          timeZone: PARIS,
        }),
      ).toBe(true);
    });

    it('refuses an instant without a zone designator or with an impossible date', () => {
      for (const value of [
        '2026-11-11T12:20:00',
        '2026-11-11',
        '2026-02-30T12:00:00Z',
        '2026-13-11T12:00:00Z',
        '2026-11-11T25:00:00Z',
        'maintenant',
        '',
      ]) {
        const error = validationError(() => toInstant(value));
        expect(error.errors?.[0]?.path).toBe('instant');
      }
      expect(() => toInstant(new Date(Number.NaN))).toThrow('Instant invalide.');
    });

    it('returns a copy of the instant it receives', () => {
      const original = new Date('2026-11-11T12:20:00Z');
      const copy = toInstant(original);
      copy.setUTCFullYear(2000);
      expect(iso(original)).toBe('2026-11-11T12:20:00.000Z');
    });
  });

  describe('determinism (CL-8)', () => {
    const run = () =>
      JSON.stringify([
        toUserZone('2026-11-11T12:20:00Z', PARIS),
        formatUserDate('2026-11-11T12:20:00Z', PARIS),
        userDayBounds('2027-03-28', PARIS),
        userWeekday('2026-11-08T23:30:00Z', PARIS),
        isQuietHours('2026-11-11T20:00:00Z', { timeZone: PARIS }),
        nextOutsideQuietHours('2026-11-11T21:30:00Z', { timeZone: PARIS }),
      ]);

    it('gives the same output when the time zone of the process changes', () => {
      const initial = process.env.TZ;
      try {
        const outputs = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati'].map(
          (processZone) => {
            process.env.TZ = processZone;
            return run();
          },
        );
        expect(new Set(outputs).size).toBe(1);
      } finally {
        if (initial === undefined) delete process.env.TZ;
        else process.env.TZ = initial;
      }
    });

    it('gives the same output in processes with another system time zone and locale', () => {
      const root = resolve(import.meta.dirname, '../../..');
      const script = `
        const t = await import('./packages/core/src/time.ts');
        console.log(JSON.stringify([
          t.toUserZone('2026-11-11T12:20:00Z', 'Europe/Paris'),
          t.formatUserDate('2026-11-11T12:20:00Z', 'Europe/Paris'),
          t.userDayBounds('2027-03-28', 'Europe/Paris'),
          t.userWeekday('2026-11-08T23:30:00Z', 'Europe/Paris'),
          t.isQuietHours('2026-11-11T20:00:00Z', { timeZone: 'Europe/Paris' }),
          t.nextOutsideQuietHours('2026-11-11T21:30:00Z', { timeZone: 'Europe/Paris' }),
        ]));`;
      const outputs = [
        { TZ: 'Asia/Tokyo', LC_ALL: 'ja_JP.UTF-8', LANG: 'ja_JP.UTF-8' },
        { TZ: 'America/Los_Angeles', LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8' },
      ].map((env) =>
        execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
          cwd: root,
          env: { ...process.env, ...env },
          encoding: 'utf8',
        }).trim(),
      );
      expect(outputs[0]).toBe(outputs[1]);
      expect(outputs[0]).toBe(run());
    });
  });

  describe('system clock (ET-6, CA-4)', () => {
    it('never reads the system clock in time.ts', () => {
      const source = readFileSync(resolve(import.meta.dirname, 'time.ts'), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toMatch(/Date\.now\s*\(/);
      expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/);
      expect(code).not.toMatch(/Intl\.DateTimeFormat\s*\(\s*\)/);
      expect(code).not.toMatch(/getTimezoneOffset|toLocale(Date|Time)?String|getHours\(|getDate\(/);
    });
  });
});

describe('[SPEC-401] heure locale décalée par un saut d’horloge', () => {
  const iso = (value: Date) => value.toISOString();

  it.each([
    ['2026-11-11', '09:00', 'Europe/Paris', '2026-11-11T08:00:00.000Z'],
    ['2027-03-28', '02:30', 'Europe/Paris', '2027-03-28T01:30:00.000Z'],
    ['2026-10-25', '02:30', 'Europe/Paris', '2026-10-25T00:30:00.000Z'],
    ['2026-03-08', '02:30', 'America/New_York', '2026-03-08T07:30:00.000Z'],
  ])('%s %s en %s', (day, time, zone, expected) => {
    expect(iso(localTimeToShiftedInstant(day, time, zone))).toBe(expected);
  });

  it('refuse une date ou un fuseau invalides', () => {
    expect(() => localTimeToShiftedInstant('2026-02-30', '09:00', 'Europe/Paris')).toThrow();
    expect(() => localTimeToShiftedInstant('2026-11-11', '09:00', 'Europe/Pariss')).toThrow();
  });
});
