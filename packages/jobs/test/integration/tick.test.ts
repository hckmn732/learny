import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setClock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createFixedClock } from '@learny/testing';

import {
  cronHourlyTick,
  dueInWindow,
  executeFunctionInline,
  setEventSender,
  type InlineEvent,
} from '../../src';

import { FACTORY_PREFIX, createFactoryUser, deleteFactoryUsers } from './helpers';

const TICK = '2026-11-11T07:05:00Z';
const TIMING_FILE = path.resolve(process.cwd(), 'test-results', 'spec-203-tick-timing.json');

const trigger = (): InlineEvent => ({
  id: 'scheduled-tick-test',
  name: 'inngest/scheduled.timer',
  data: {},
  ts: Date.parse(TICK),
});

async function runTick() {
  const sent: InlineEvent[] = [];
  const run = await executeFunctionInline(cronHourlyTick, trigger(), {
    sendEvents: (events) => {
      sent.push(...events);
      return Promise.resolve();
    },
  });
  return { run, sent };
}

const localTicks = (sent: InlineEvent[], ids: Set<string>) =>
  sent.filter((event) => event.name === 'user/local-tick' && ids.has(String(event.data.userId)));

let users: Record<string, string>;
const noopSender = { send: () => Promise.resolve() };

beforeAll(async () => {
  setClock(createFixedClock(TICK));
  setEventSender(noopSender);
  await deleteFactoryUsers();
  users = {
    paris: await createFactoryUser({ label: 'paris', timezone: 'Europe/Paris' }),
    kolkata: await createFactoryUser({ label: 'kolkata', timezone: 'Asia/Kolkata' }),
    newYork: await createFactoryUser({ label: 'new-york', timezone: 'America/New_York' }),
    auckland: await createFactoryUser({ label: 'auckland', timezone: 'Pacific/Auckland' }),
    onboarding: await createFactoryUser({
      label: 'onboarding',
      timezone: 'Europe/Paris',
      onboardingStep: 'ia',
    }),
    deleted: await createFactoryUser({
      label: 'deleted',
      timezone: 'Europe/Paris',
      deletionScheduledFor: '2026-11-10T07:05:00Z',
    }),
  };
});

afterAll(async () => {
  setEventSender(undefined);
  await deleteFactoryUsers();
  await closeDb();
});

describe('[SPEC-203] tick horaire', () => {
  it('CA-4 — fenêtres locales de 2026-11-11T07:05:00Z, utilisateurs en onboarding ou supprimés exclus', async () => {
    const { run, sent } = await runTick();
    expect(run).toMatchObject({ status: 'completed', executions: 1 });

    const ids = new Set(Object.values(users));
    const ticks = localTicks(sent, ids);
    const byUser = new Map(ticks.map((event) => [String(event.data.userId), event]));

    // CL-8 — in onboarding before the reminders step, or deletion already due: not selected.
    expect(byUser.has(users.onboarding as string)).toBe(false);
    expect(byUser.has(users.deleted as string)).toBe(false);
    expect(ticks).toHaveLength(4);

    const window = (key: string) => byUser.get(users[key] as string)?.data;
    // Window [T − 5 min, T + 55 min[ in UTC, identical for everybody.
    for (const key of ['paris', 'kolkata', 'newYork', 'auckland']) {
      expect(window(key)).toMatchObject({
        windowStart: '2026-11-11T07:00:00.000Z',
        windowEnd: '2026-11-11T08:00:00.000Z',
      });
    }
    // Paris 08:00–09:00 (Wednesday, ISO day 3), Kolkata 12:30–13:30, New York 02:00–03:00.
    expect(window('paris')).toMatchObject({
      timezone: 'Europe/Paris',
      localDate: '2026-11-11',
      localWeekday: 3,
    });
    expect(window('kolkata')).toMatchObject({ timezone: 'Asia/Kolkata', localWeekday: 3 });
    expect(window('newYork')).toMatchObject({ timezone: 'America/New_York', localWeekday: 3 });
    // Auckland (UTC+13 in November) is already on 20:00, the same day.
    expect(window('auckland')).toMatchObject({ localDate: '2026-11-11', localWeekday: 3 });

    // The consumers' view: dueInWindow answers inside the local window of each zone.
    const due = (key: string, hhmm: `${number}:${number}`) => {
      const data = window(key) as { windowStart: string; windowEnd: string; timezone: string };
      return dueInWindow(hhmm, data)?.toISOString() ?? null;
    };
    expect(due('paris', '08:00')).toBe('2026-11-11T07:00:00.000Z');
    expect(due('paris', '09:00')).toBeNull();
    expect(due('kolkata', '12:30')).toBe('2026-11-11T07:00:00.000Z');
    expect(due('kolkata', '13:29')).toBe('2026-11-11T07:59:00.000Z');
    expect(due('kolkata', '13:30')).toBeNull();
    expect(due('newYork', '02:00')).toBe('2026-11-11T07:00:00.000Z');
    expect(due('auckland', '20:00')).toBe('2026-11-11T07:00:00.000Z');
  });

  it('EF-3, CL-7 — identifiants déterministes par utilisateur et fenêtre, événement global unique', async () => {
    const first = await runTick();
    const second = await runTick();
    const ids = new Set(Object.values(users));
    // The handler is re-entered after every step: an event is sent once per run, never again.
    const everyId = first.sent.map((event) => event.id);
    expect(new Set(everyId).size).toBe(everyId.length);
    const firstIds = localTicks(first.sent, ids)
      .map((event) => event.id)
      .sort();
    expect(firstIds).toEqual(
      localTicks(second.sent, ids)
        .map((event) => event.id)
        .sort(),
    );
    for (const id of firstIds) {
      expect(id).toMatch(/^local-tick:[0-9a-f-]{36}:2026-11-11T07:00:00\.000Z$/);
    }

    const global = first.sent.filter((event) => event.name === 'cron/hourly-tick');
    expect(global).toEqual([
      expect.objectContaining({
        id: 'hourly-tick:2026-11-11T07:05:00.000Z',
        data: { tickAt: '2026-11-11T07:05:00.000Z' },
      }),
    ]);
  });

  it('ET-5 — le tick à 07:05:30 est tronqué à la minute', async () => {
    setClock(createFixedClock('2026-11-11T07:05:30Z'));
    try {
      const { sent } = await runTick();
      expect(sent.find((event) => event.name === 'cron/hourly-tick')?.data).toEqual({
        tickAt: '2026-11-11T07:05:00.000Z',
      });
    } finally {
      setClock(createFixedClock(TICK));
    }
  });

  it(
    'CL-9 — 2 000 utilisateurs : 4 pages de 500 et temps de tick mesuré (< 60 s)',
    { timeout: 240_000 },
    async () => {
      const setupStarted = performance.now();
      await serviceDb().execute(sql`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
      )
      select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', ${`${FACTORY_PREFIX}load-`} || g::text || '@test.learny.test',
        '{"timezone":"Europe/Paris"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb,
        now(), now()
      from generate_series(1, 2000) g
    `);
      await serviceDb().execute(sql`
      update public.profiles set onboarding_step = 'done'
      where email like ${`${FACTORY_PREFIX}load-%`}
    `);

      const setupMs = performance.now() - setupStarted;
      const started = performance.now();
      const { run, sent } = await runTick();
      const elapsedMs = performance.now() - started;

      expect(run.status).toBe('completed');
      const loaded = sent.filter(
        (event) => event.name === 'user/local-tick' && event.data.timezone === 'Europe/Paris',
      );
      expect(loaded.length).toBeGreaterThanOrEqual(2000);
      // Pages of 500: one select-users step per page, plus the empty/partial last page.
      const pages = Object.keys(run.stepRuns).filter((name) => name.startsWith('select-users-'));
      expect(pages.length).toBeGreaterThanOrEqual(4);
      expect(elapsedMs).toBeLessThan(60_000);

      const selected = sent.filter((event) => event.name === 'user/local-tick').length;
      mkdirSync(path.dirname(TIMING_FILE), { recursive: true });
      writeFileSync(
        TIMING_FILE,
        `${JSON.stringify(
          {
            users: selected,
            pages: pages.length,
            elapsedMs: Math.round(elapsedMs),
            setupMs: Math.round(setupMs),
            // 10 000 users = 5 times the measured load (linear fan-out, 500 users per page).
            extrapolated10000Ms: Math.round((elapsedMs * 10_000) / selected),
          },
          null,
          2,
        )}\n`,
      );
    },
  );
});
