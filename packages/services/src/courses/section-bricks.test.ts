// Unit tests of the brick suspension shared by section reports and corrections (SPEC-609 EF-4,
// BR-MEM-09). The transaction is a fake: these tests pin the empty fast paths and the exact
// statements sent to Postgres.

import { describe, expect, it, vi } from 'vitest';

import { reactivateBricks, suspendBricksForNotions } from './section-bricks';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql }));

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const NOTION = '33333333-3333-4333-8333-333333333333';

function tx(rows: readonly unknown[][] = []) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return { execute } as never;
}

describe('[SPEC-609] briques suspendues par un signalement', () => {
  it('ne touche à rien sans notion (BR-MEM-09)', async () => {
    const database = tx();

    await expect(suspendBricksForNotions(database, USER, FORMATION, [])).resolves.toEqual([]);
    expect(
      (database as unknown as { execute: ReturnType<typeof vi.fn> }).execute,
    ).not.toHaveBeenCalled();
  });

  it('renvoie une liste vide quand aucune brique ne partage les notions', async () => {
    const database = tx([[]]);

    await expect(suspendBricksForNotions(database, USER, FORMATION, [NOTION])).resolves.toEqual([]);
  });

  it('suspend les briques actives et renvoie leurs identifiants', async () => {
    const database = tx([[{ id: 'brick-1' }, { id: 'brick-2' }], []]);

    await expect(suspendBricksForNotions(database, USER, FORMATION, [NOTION])).resolves.toEqual([
      'brick-1',
      'brick-2',
    ]);
    expect(
      (database as unknown as { execute: ReturnType<typeof vi.fn> }).execute,
    ).toHaveBeenCalledTimes(2);
  });

  it('ne réactive rien sans identifiant', async () => {
    const database = tx();

    await reactivateBricks(database, USER, []);
    expect(
      (database as unknown as { execute: ReturnType<typeof vi.fn> }).execute,
    ).not.toHaveBeenCalled();
  });

  it('réactive les briques listées par les signalements corrigés', async () => {
    const database = tx([[]]);

    await reactivateBricks(database, USER, ['brick-1']);
    expect(
      (database as unknown as { execute: ReturnType<typeof vi.fn> }).execute,
    ).toHaveBeenCalledTimes(1);
  });
});
