import { describe, expect, it } from 'vitest';

import { EVENTS } from '@learny/contracts';

import { EVENT_NAMES } from '../events';

import { functions } from './index';

type Trigger = { event?: string | { event?: string }; cron?: string };

const triggersOf = (fn: (typeof functions)[number]): Trigger[] =>
  (fn.opts as { triggers?: Trigger[] }).triggers ?? [];

const eventOf = (trigger: Trigger): string | undefined =>
  typeof trigger.event === 'string' ? trigger.event : trigger.event?.event;

// 5 fields: minute hour day-of-month month day-of-week, optionally prefixed by `TZ=<zone> `.
const CRON = /^(TZ=[A-Za-z_/]+ )?([0-9*/,-]+ ){4}[0-9*/,-]+$/;

describe('[SPEC-203] registre', () => {
  it('CA-7 — chaque fonction a un identifiant unique et kebab-case', () => {
    const ids = functions.map((fn) => fn.id());
    expect(new Set(ids).size).toBe(ids.length);
    for (const fn of functions) {
      expect((fn.opts as { id: string }).id, fn.id()).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it('CA-7 — chaque déclencheur est un événement du catalogue ou un cron valide', () => {
    const known = new Set<string>([...Object.keys(EVENTS), EVENT_NAMES.sddDemoJobRequested]);
    let checked = 0;
    for (const fn of functions) {
      const triggers = triggersOf(fn);
      expect(triggers.length, fn.id()).toBeGreaterThan(0);
      for (const trigger of triggers) {
        if (trigger.cron !== undefined) {
          expect(trigger.cron, fn.id()).toMatch(CRON);
        } else {
          expect(
            known.has(eventOf(trigger) ?? ''),
            `${fn.id()} : ${String(eventOf(trigger))}`,
          ).toBe(true);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(functions.length);
  });

  it('enregistre les fonctions de SPEC-203 avec leurs déclencheurs et leurs reprises', () => {
    const byId = new Map(functions.map((fn) => [(fn.opts as { id: string }).id, fn]));
    const get = (id: string) => {
      const fn = byId.get(id);
      if (fn === undefined) throw new Error(`fonction absente du registre : ${id}`);
      return fn;
    };
    const retriesOf = (id: string) => (get(id).opts as { retries?: number }).retries;

    expect(triggersOf(get('cron-hourly-tick'))).toEqual([{ cron: 'TZ=UTC 5 * * * *' }]);
    expect(retriesOf('cron-hourly-tick')).toBe(1);
    expect(triggersOf(get('cron-nightly'))).toEqual([{ cron: 'TZ=UTC 30 1 * * *' }]);
    expect(triggersOf(get('nightly-outbox-cleanup'))).toEqual([{ event: 'cron/nightly' }]);
    expect(triggersOf(get('sdd-demo-pipeline'))).toEqual([{ event: 'sdd/demo-requested' }]);
    expect(retriesOf('sdd-demo-pipeline')).toBe(3);
    expect(byId.has('sdd-demo-job')).toBe(true);

    // SPEC-208 EF-7 — the purge of the security tables follows each hourly tick, once per tick.
    expect(triggersOf(get('security-purge'))).toEqual([{ event: 'cron/hourly-tick' }]);
    expect((get('security-purge').opts as { idempotency?: string }).idempotency).toBe(
      'event.data.tickAt',
    );

    // SPEC-209 — one delivery consumer and the two hourly notification jobs.
    expect(triggersOf(get('notification-delivery'))).toEqual([
      { event: 'notification/delivery-due' },
    ]);
    expect((get('notification-delivery').opts as { idempotency?: string }).idempotency).toBe(
      'event.data.deliveryId',
    );
    expect(triggersOf(get('notifications-deferred-due'))).toEqual([{ event: 'cron/hourly-tick' }]);
    expect(triggersOf(get('notifications-daily-digest'))).toEqual([{ event: 'cron/hourly-tick' }]);
  });

  it('applique la concurrence par utilisateur par défaut aux événements qui portent un userId', async () => {
    const { defineFunction } = await import('../define');
    const withUser = defineFunction(
      { id: 'registry-probe-user', trigger: { event: 'gap/cleared' } },
      () => Promise.resolve(null),
    );
    const withoutUser = defineFunction(
      { id: 'registry-probe-cron', trigger: { event: 'cron/nightly' } },
      () => Promise.resolve(null),
    );
    expect((withUser.opts as { concurrency?: unknown }).concurrency).toEqual({
      key: 'event.data.userId',
      limit: 5,
    });
    expect((withoutUser.opts as { concurrency?: unknown }).concurrency).toBeUndefined();
    expect((withUser.opts as { retries?: number }).retries).toBe(3);
    expect(() =>
      defineFunction({ id: 'PasKebab', trigger: { event: 'gap/cleared' } }, () =>
        Promise.resolve(null),
      ),
    ).toThrow(/kebab-case/);
  });
});
