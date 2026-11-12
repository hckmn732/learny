// Integration tests of the user time zone (SPEC-207 §12): the zone and the quiet hours are read
// from `profiles` and `notification_settings`, and every local-time result is checked against
// PostgreSQL's own time zone database. Core cannot depend on @learny/db without a package cycle,
// so the harness is reached by relative path; it is the same one the db package tests use.
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, sql } from '../../../db/src/index';
import { asUser, createTestUser, withRollback } from '../../../db/src/testing/index';
import { clock } from '../../src/clock';
import {
  DEFAULT_QUIET_HOURS,
  DEFAULT_TIME_ZONE,
  endOfUserDay,
  isQuietHours,
  nextOutsideQuietHours,
  startOfUserDay,
  toUserZone,
  userLocalDay,
  userWeekday,
} from '../../src/time';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];

interface UserTime {
  timezone: string;
  quietStart: string;
  quietEnd: string;
}

const iso = (date: Date) => date.toISOString();

async function readUserTime(tx: Tx, userId: string): Promise<UserTime> {
  return asUser(tx, userId, async (scoped) => {
    const rows = await scoped.execute<{ timezone: string; quiet_start: string; quiet_end: string }>(
      sql`
        select p.timezone, s.quiet_start::text as quiet_start, s.quiet_end::text as quiet_end
        from public.profiles p
        join public.notification_settings s on s.user_id = p.id
        where p.id = ${userId}::uuid
      `,
    );
    const row = rows[0];
    if (row === undefined) throw new Error('profil introuvable');
    return { timezone: row.timezone, quietStart: row.quiet_start, quietEnd: row.quiet_end };
  });
}

async function insertNotification(tx: Tx, userId: string, createdAt: string): Promise<void> {
  await tx.execute(sql`
    insert into public.notifications (user_id, type, title, body, href, icon, created_at)
    values (${userId}::uuid, 'daily_digest', 'Programme du jour', 'Test', '/agenda', 'calendar',
      ${createdAt}::timestamptz)
  `);
}

/** Notifications of the user created in the half-open interval [start, end), in UTC order. */
async function createdBetween(tx: Tx, userId: string, start: Date, end: Date): Promise<string[]> {
  const rows = await tx.execute<{ created_at: string }>(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
    from public.notifications
    where user_id = ${userId}::uuid
      and created_at >= ${iso(start)}::timestamptz
      and created_at < ${iso(end)}::timestamptz
    order by created_at
  `);
  return rows.map((row) => row.created_at);
}

async function createdOnLocalDay(
  tx: Tx,
  userId: string,
  timeZone: string,
  day: string,
): Promise<string[]> {
  const rows = await tx.execute<{ created_at: string }>(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
    from public.notifications
    where user_id = ${userId}::uuid
      and (created_at at time zone ${timeZone})::date = ${day}::date
    order by created_at
  `);
  return rows.map((row) => row.created_at);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-207] user timezone', () => {
  it('reads the defaults of the profile and of the settings as the core constants (CA-1)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const stored = await readUserTime(tx, user.id);
      expect(stored.timezone).toBe(DEFAULT_TIME_ZONE);
      expect({ start: stored.quietStart.slice(0, 5), end: stored.quietEnd.slice(0, 5) }).toEqual(
        DEFAULT_QUIET_HOURS,
      );
      // PostgreSQL renders a `time` column as HH:mm:ss; the core accepts it as is.
      expect(stored.quietStart).toBe('21:00:00');
      expect(
        isQuietHours('2026-11-11T20:00:00Z', {
          start: stored.quietStart,
          end: stored.quietEnd,
          timeZone: stored.timezone,
        }),
      ).toBe(true);
    });
  });

  it('shows the same instant as 13:20 in Paris and 21:20 in Tokyo, per stored zone (CA-1)', async () => {
    await withRollback(async (tx) => {
      const paris = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const tokyo = await createTestUser(tx, { timezone: 'Asia/Tokyo' });
      const parisZone = (await readUserTime(tx, paris.id)).timezone;
      const tokyoZone = (await readUserTime(tx, tokyo.id)).timezone;
      expect([parisZone, tokyoZone]).toEqual(['Europe/Paris', 'Asia/Tokyo']);

      expect(toUserZone(clock.now(), parisZone).time).toBe('13:20');
      expect(toUserZone(clock.now(), tokyoZone).time).toBe('21:20');
      // The wall clock of both users agrees with PostgreSQL's.
      const rows = await tx.execute<{ zone: string; local: string }>(sql`
        select z as zone, to_char(${iso(clock.now())}::timestamptz at time zone z, 'YYYY-MM-DD HH24:MI') as local
        from unnest(array[${parisZone}, ${tokyoZone}]::text[]) as z
      `);
      expect(rows.map((row) => `${row.zone} ${row.local}`)).toEqual([
        'Europe/Paris 2026-11-11 13:20',
        'Asia/Tokyo 2026-11-11 21:20',
      ]);
    });
  });

  it('selects the rows of the local day with the half-open bounds, like PostgreSQL does (CA-1)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const { timezone } = await readUserTime(tx, user.id);
      const instants = [
        '2026-11-10T22:59:59.999Z', // 23:59:59.999 on the 10th
        '2026-11-10T23:00:00.000Z', // exactly midnight on the 11th: belongs to the 11th
        clock.now().toISOString(),
        '2026-11-11T22:59:59.999Z',
        '2026-11-11T23:00:00.000Z', // exactly midnight on the 12th: belongs to the 12th
      ];
      for (const instant of instants) await insertNotification(tx, user.id, instant);

      const start = startOfUserDay('2026-11-11', timezone);
      const end = endOfUserDay('2026-11-11', timezone);
      const selected = await createdBetween(tx, user.id, start, end);
      expect(selected).toEqual([
        '2026-11-10T23:00:00.000Z',
        '2026-11-11T12:20:00.000Z',
        '2026-11-11T22:59:59.999Z',
      ]);
      expect(selected).toEqual(await createdOnLocalDay(tx, user.id, timezone, '2026-11-11'));
      for (const instant of instants) {
        const day = userLocalDay(instant, timezone);
        expect(await createdOnLocalDay(tx, user.id, timezone, day)).toContain(instant);
      }
    });
  });

  it('keeps the DST days of 23 and 25 hours consistent with PostgreSQL (CA-2)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const { timezone } = await readUserTime(tx, user.id);
      const instants = [
        '2027-03-27T22:59:59.999Z',
        '2027-03-27T23:00:00.000Z',
        '2027-03-28T00:59:59.999Z', // 01:59:59 CET
        '2027-03-28T01:00:00.000Z', // 03:00 CEST
        '2027-03-28T21:59:59.999Z',
        '2027-03-28T22:00:00.000Z',
        '2026-10-24T21:59:59.999Z',
        '2026-10-24T22:00:00.000Z',
        '2026-10-25T00:30:00.000Z', // first 02:30
        '2026-10-25T01:30:00.000Z', // second 02:30
        '2026-10-25T22:59:59.999Z',
        '2026-10-25T23:00:00.000Z',
      ];
      for (const instant of instants) await insertNotification(tx, user.id, instant);

      for (const [day, hours] of [
        ['2027-03-28', 23],
        ['2026-10-25', 25],
      ] as const) {
        const start = startOfUserDay(day, timezone);
        const end = endOfUserDay(day, timezone);
        expect((end.getTime() - start.getTime()) / 3_600_000).toBe(hours);
        const selected = await createdBetween(tx, user.id, start, end);
        expect(selected).toEqual(await createdOnLocalDay(tx, user.id, timezone, day));
        expect(selected.length).toBeGreaterThan(2);
      }
      // The two 02:30 of the autumn night are two rows of the same local day.
      const night = await createdOnLocalDay(tx, user.id, timezone, '2026-10-25');
      expect(night).toContain('2026-10-25T00:30:00.000Z');
      expect(night).toContain('2026-10-25T01:30:00.000Z');
    });
  });

  it('agrees with the PostgreSQL wall clock across clock changes and zones (CA-1, CA-2)', async () => {
    const zones = [
      'Europe/Paris',
      'America/New_York',
      'Asia/Kolkata',
      'Australia/Lord_Howe',
      'Pacific/Kiritimati',
      'Etc/GMT+12',
      'America/Havana',
    ];
    const instants: string[] = [];
    for (const from of ['2026-03-07T00:00:00Z', '2026-10-24T00:00:00Z', '2027-03-27T00:00:00Z']) {
      for (let minutes = 0; minutes < 4 * 24 * 60; minutes += 37) {
        instants.push(new Date(Date.parse(from) + minutes * 60_000).toISOString());
      }
    }
    await withRollback(async (tx) => {
      for (const zone of zones) {
        const rows = await tx.execute<{ instant: string; local: string; isodow: number }>(sql`
          select i as instant,
            to_char(i::timestamptz at time zone ${zone}, 'YYYY-MM-DD HH24:MI') as local,
            extract(isodow from i::timestamptz at time zone ${zone})::int as isodow
          from jsonb_array_elements_text(${JSON.stringify(instants)}::jsonb) as i
        `);
        expect(rows).toHaveLength(instants.length);
        for (const row of rows) {
          const local = toUserZone(row.instant, zone);
          expect(`${local.date} ${local.time}`, `${zone} ${row.instant}`).toBe(row.local);
          expect(userWeekday(row.instant, zone), `${zone} ${row.instant}`).toBe(row.isodow);
        }
      }
    });
  });

  it('defers a notification out of the quiet hours read from the settings (CA-3)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const stored = await readUserTime(tx, user.id);
      const quiet = { start: stored.quietStart, end: stored.quietEnd, timeZone: stored.timezone };

      // 21:30 UTC is 22:30 in Paris: quiet, deferred to 08:00 local on the next day.
      const evening = '2026-11-11T21:30:00Z';
      expect(isQuietHours(evening, quiet)).toBe(true);
      const deferred = nextOutsideQuietHours(evening, quiet);
      expect(iso(deferred)).toBe('2026-11-12T07:00:00.000Z');
      expect(isQuietHours(deferred, quiet)).toBe(false);
      const wall = await tx.execute<{ local: string }>(sql`
        select to_char(${iso(deferred)}::timestamptz at time zone ${stored.timezone}, 'YYYY-MM-DD HH24:MI') as local
      `);
      expect(wall[0]?.local).toBe('2026-11-12 08:00');

      // The fixed clock of the tests (13:20 in Paris) is outside the quiet hours.
      expect(iso(nextOutsideQuietHours(clock.now(), quiet))).toBe(iso(clock.now()));
    });
  });

  it('applies the custom quiet hours of each user in their own zone (CA-3)', async () => {
    await withRollback(async (tx) => {
      const paris = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const newYork = await createTestUser(tx, { timezone: 'America/New_York' });
      await tx.execute(sql`
        update public.notification_settings set quiet_start = '22:00', quiet_end = '07:30'
        where user_id = ${newYork.id}::uuid
      `);
      await tx.execute(sql`
        update public.notification_settings set quiet_start = '08:00', quiet_end = '08:00'
        where user_id = ${paris.id}::uuid
      `);

      const parisTime = await readUserTime(tx, paris.id);
      const newYorkTime = await readUserTime(tx, newYork.id);
      const at = '2026-11-12T03:00:00Z'; // 04:00 in Paris, 22:00 in New York
      const quietOf = (stored: UserTime) => ({
        start: stored.quietStart,
        end: stored.quietEnd,
        timeZone: stored.timezone,
      });

      // start = end: Paris has no quiet hours at all, so the send is not deferred.
      expect(isQuietHours(at, quietOf(parisTime))).toBe(false);
      expect(iso(nextOutsideQuietHours(at, quietOf(parisTime)))).toBe(at.replace('Z', '.000Z'));
      // New York: 22:00 is quiet (start included) until 07:30 local = 12:30 UTC.
      expect(isQuietHours(at, quietOf(newYorkTime))).toBe(true);
      expect(iso(nextOutsideQuietHours(at, quietOf(newYorkTime)))).toBe('2026-11-12T12:30:00.000Z');
    });
  });

  it('does not alter stored UTC timestamps when the zone of the profile changes (EF-7)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const instant = '2026-11-11T23:30:00.000Z';
      await insertNotification(tx, user.id, instant);
      const before = await createdBetween(
        tx,
        user.id,
        new Date('2026-11-11T00:00:00Z'),
        new Date('2026-11-13T00:00:00Z'),
      );
      expect(before).toEqual([instant]);
      expect(userLocalDay(instant, (await readUserTime(tx, user.id)).timezone)).toBe('2026-11-12');

      await tx.execute(sql`
        update public.profiles set timezone = 'America/Los_Angeles' where id = ${user.id}::uuid
      `);
      const after = await createdBetween(
        tx,
        user.id,
        new Date('2026-11-11T00:00:00Z'),
        new Date('2026-11-13T00:00:00Z'),
      );
      expect(after).toEqual(before);
      const changed = (await readUserTime(tx, user.id)).timezone;
      expect(changed).toBe('America/Los_Angeles');
      expect(userLocalDay(instant, changed)).toBe('2026-11-11');
    });
  });

  it('keeps two users of different zones on their own local day', async () => {
    await withRollback(async (tx) => {
      const paris = await createTestUser(tx, { timezone: 'Europe/Paris' });
      const kiritimati = await createTestUser(tx, { timezone: 'Pacific/Kiritimati' });
      const instant = '2026-11-11T23:30:00.000Z';
      for (const user of [paris, kiritimati]) await insertNotification(tx, user.id, instant);

      // One scoped read after the other: `asUser` uses savepoints of a single transaction.
      const results: (readonly [string, string[]])[] = [];
      for (const user of [paris, kiritimati]) {
        const { timezone } = await readUserTime(tx, user.id);
        const day = userLocalDay(instant, timezone);
        results.push([
          day,
          await createdBetween(
            tx,
            user.id,
            startOfUserDay(day, timezone),
            endOfUserDay(day, timezone),
          ),
        ]);
      }
      expect(results).toEqual([
        ['2026-11-12', [instant]],
        ['2026-11-12', [instant]],
      ]);
      // On the 11th, neither of them has anything: both are already on the 12th.
      expect(await createdOnLocalDay(tx, paris.id, 'Europe/Paris', '2026-11-11')).toEqual([]);
      expect(
        await createdOnLocalDay(tx, kiritimati.id, 'Pacific/Kiritimati', '2026-11-11'),
      ).toEqual([]);
    });
  });
});
