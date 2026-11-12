// Unit tests of the SPEC-201 demonstration services: idempotent echo, execution counter and the
// 57-item cursor pagination. No persistence, no network.
import { beforeEach, describe, expect, it } from 'vitest';

import { encodeCursor } from '@learny/contracts';

import { TestClock } from '../../test/support/fakes';

import {
  DEV_ITEM_COUNT,
  devEcho,
  devEchoExecutions,
  listDevItems,
  resetDevEchoCounter,
} from './echo';

const clock = new TestClock();
const ctx = { userId: null, requestId: 'req-1', db: null, clock, logger: {} } as never;

beforeEach(() => {
  resetDevEchoCounter();
});

describe('[SPEC-201] écho idempotent et pagination', () => {
  it('compte les exécutions réelles et horodate avec l’horloge injectée', () => {
    expect(devEchoExecutions()).toBe(0);
    expect(devEcho(ctx, { message: 'bonjour' })).toEqual({
      ok: true,
      value: { message: 'bonjour', receivedAt: '2026-11-11T12:20:00.000Z', counter: 1 },
    });
    expect(devEcho(ctx, { message: 'encore' })).toMatchObject({
      ok: true,
      value: { counter: 2 },
    });
    expect(devEchoExecutions()).toBe(2);
    resetDevEchoCounter();
    expect(devEchoExecutions()).toBe(0);
  });

  it('renvoie l’erreur métier sans exécuter la suite', () => {
    const result = devEcho(ctx, { message: 'x', fail: 'business' });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FORMATION_LIMIT_REACHED' },
    });
    expect(devEchoExecutions()).toBe(0);
  });

  it('laisse remonter une défaillance inattendue', () => {
    expect(() => devEcho(ctx, { message: 'x', fail: 'crash' })).toThrow('défaillance inattendue');
    expect(devEchoExecutions()).toBe(0);
  });

  it('liste les 57 éléments du plus récent au plus ancien (ET-5)', () => {
    const first = listDevItems(ctx, { limit: 10 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.items).toHaveLength(10);
    expect(first.value.items[0]).toEqual({ id: 'item-57', label: 'item-57', position: 57 });
    expect(first.value.nextCursor).not.toBeNull();
    expect(DEV_ITEM_COUNT).toBe(57);
  });

  it('suit un curseur jusqu’à la dernière page, sans doublon', () => {
    const seen: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = listDevItems(ctx, { limit: 20, cursor });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      seen.push(...result.value.items.map((item) => item.position));
      if (result.value.nextCursor === null) break;
      cursor = result.value.nextCursor;
    }
    expect(seen).toEqual(Array.from({ length: 57 }, (_, index) => 57 - index));
  });

  it('borne un curseur hors liste et refuse un curseur illisible (CL-9)', () => {
    const empty = listDevItems(ctx, {
      limit: 10,
      cursor: encodeCursor({ k: 'item-10', id: 'item-10' }),
    });
    expect(empty).toEqual({ ok: true, value: { items: [], nextCursor: null } });

    const invalid = listDevItems(ctx, { limit: 10, cursor: 'pas-un-curseur' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const beyond = listDevItems(ctx, { limit: 5, cursor: encodeCursor({ k: 999, id: 'x' }) });
    expect(beyond.ok ? beyond.value.items.map((item) => item.position) : null).toEqual([
      57, 56, 55, 54, 53,
    ]);

    const zero = listDevItems(ctx, { limit: 5, cursor: encodeCursor({ k: 0, id: 'x' }) });
    expect(zero).toMatchObject({ ok: true, value: { items: [] } });
  });
});
