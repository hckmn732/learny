// Unit tests of the global search service (SPEC-212 EF-1 to EF-5, CL-1, CL-7): validation before
// SQL, grouping in the fixed order, stable ranking, dropped unsafe links and re-read bodies. The
// SQL function and the RLS client are fakes; highlights are the real pure functions.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { silentLogger, TestClock } from '../../test/support/fakes';

import { SEARCH_GROUP_COUNT, SEARCH_SQL_MAX_ROWS, searchUserContent } from './index';

const mocks = vi.hoisted(() => {
  const tag = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  }));
  return {
    tag,
    query: vi.fn(),
  };
});

vi.mock('@learny/db', () => {
  const sql = Object.assign(mocks.tag, {
    join: vi.fn((parts: unknown[]) => parts),
  });
  return { sql, searchUserContent: mocks.query, schema: {} };
});

const clock = new TestClock();
const USER = '11111111-1111-4111-8111-111111111111';

function tx(rows: unknown[] = []) {
  return { execute: vi.fn().mockResolvedValue(rows) };
}

function ctx(database: { run: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }) {
  return {
    userId: USER,
    requestId: 'req-1',
    db: database as never,
    clock,
    logger: { ...silentLogger(), info: vi.fn(), error: vi.fn() },
  };
}

function database(t = tx()) {
  return { db: { run: (fn: (inner: unknown) => Promise<unknown>) => fn(t) }, tx: t };
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.tag.mockClear();
});

describe('[SPEC-212] recherche globale', () => {
  it('valide et normalise la requête avant tout SQL (CL-1)', async () => {
    const { db } = database();
    for (const input of [
      { q: 'a' },
      { q: '   ' },
      { q: 'a'.repeat(101) },
      { q: 'mot', limit: 0 },
      { q: 'mot', limit: 21 },
      { q: 'mot', limit: 1.5 },
    ]) {
      const result = await searchUserContent(ctx(db), input);
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('groupe dans l’ordre Notions, Chapitres, Formations et borne chaque groupe (EF-2, EF-3)', async () => {
    const { db, tx: t } = database(
      tx([{ id: 'n1', body: 'La comptabilité générale et la partie double.' }]),
    );
    mocks.query.mockResolvedValue([
      {
        kind: 'notion',
        id: 'n1',
        title: 'Comptabilité',
        snippet: 'comptabilité',
        href: '/notions/n1',
        rank: 0.9,
      },
      {
        kind: 'notion',
        id: 'n2',
        title: 'Comptabilité avancée',
        snippet: 'comptabilité',
        href: '/notions/n2',
        rank: 0.8,
      },
      {
        kind: 'notion',
        id: 'n3',
        title: 'Comptabilité analytique',
        snippet: 'comptabilité',
        href: '/notions/n3',
        rank: 0.7,
      },
      {
        kind: 'section',
        id: 's1',
        title: 'Chapitre',
        snippet: 'comptabilité',
        href: '/formations/f1/chapitres/c1',
        rank: 0.6,
      },
      {
        kind: 'formation',
        id: 'f1',
        title: 'Formation',
        snippet: 'comptabilité',
        href: '/formations/f1',
        rank: 0.5,
      },
    ]);
    const result = await searchUserContent(ctx(db), { q: '  comptabilité  ', limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.query).toBe('comptabilité');
    expect(result.value.groups.map((group) => group.kind)).toEqual([
      'notion',
      'chapter',
      'formation',
    ]);
    expect(result.value.groups[0]).toMatchObject({ label: 'Notions', total: 3 });
    expect(result.value.groups[0]?.items).toHaveLength(2);
    expect(result.value.groups[1]?.items[0]?.href).toBe('/formations/f1/chapitres/c1');
    // The shown notion's body was read again to centre the snippet.
    expect(mocks.query).toHaveBeenCalledWith(t, {
      q: 'comptabilité',
      limit: SEARCH_GROUP_COUNT * 3 * 2,
    });
    expect(t.execute).toHaveBeenCalledTimes(1);
  });

  it('borne les lignes demandées à 100 et garde le total avant la coupe (ET-2)', async () => {
    const { db } = database(tx([]));
    mocks.query.mockResolvedValue([]);
    await searchUserContent(ctx(db), { q: 'mot', limit: 20 });
    expect(mocks.query).toHaveBeenLastCalledWith(expect.anything(), {
      q: 'mot',
      limit: SEARCH_SQL_MAX_ROWS,
    });
  });

  it('écarte un lien non interne, sans jamais l’afficher (EF-5)', async () => {
    const { db } = database(tx([]));
    mocks.query.mockResolvedValue([
      { kind: 'notion', id: 'n1', title: 'Bonne', snippet: 'x', href: '/notions/n1', rank: 1 },
      {
        kind: 'notion',
        id: 'n2',
        title: 'Mauvaise',
        snippet: 'x',
        href: 'https://evil.example',
        rank: 2,
      },
      { kind: 'notion', id: 'n3', title: 'Double', snippet: 'x', href: '//evil.example', rank: 3 },
    ]);
    const c = ctx(db);
    const result = await searchUserContent(c, { q: 'mot' });
    expect(result.ok ? result.value.groups[0]?.items.map((item) => item.id) : []).toEqual(['n1']);
    expect(c.logger.error).toHaveBeenCalled();
  });

  it('trie par rang puis identifiant, et retombe sur le snippet SQL sans corps (EF-3, CL-7)', async () => {
    const { db } = database(tx([{ id: 'n2', body: 'Un texte sans le mot cherché.' }]));
    mocks.query.mockResolvedValue([
      {
        kind: 'notion',
        id: 'n2',
        title: '<b>Titre</b>',
        snippet: 'le mot en snippet',
        href: '/notions/n2',
        rank: 1,
      },
      { kind: 'notion', id: 'n1', title: 'Titre', snippet: 'mot', href: '/notions/n1', rank: 1 },
    ]);
    const result = await searchUserContent(ctx(db), { q: 'mot' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = result.value.groups[0]?.items ?? [];
    expect(items.map((item) => item.id)).toEqual(['n1', 'n2']);
    expect(items[0]?.title).toBe('Titre');
    expect(items[1]?.title).toBe('Titre');
    expect(items[1]?.snippet).toContain('texte');
  });

  it('répond sans groupe quand rien ne correspond (EF-1)', async () => {
    const { db } = database(tx([]));
    mocks.query.mockResolvedValue([]);
    const result = await searchUserContent(ctx(db), { q: 'introuvable' });
    expect(result).toEqual({
      ok: true,
      value: { query: 'introuvable', groups: [] },
    });
  });

  it('ne journalise que la longueur de la requête et le nombre de résultats (ET-5)', async () => {
    const { db } = database(tx([]));
    mocks.query.mockResolvedValue([
      { kind: 'notion', id: 'n1', title: 'x', snippet: 'x', href: '/notions/n1', rank: 1 },
    ]);
    const c = ctx(db);
    await searchUserContent(c, { q: 'secret personnel' });
    expect(c.logger.info).toHaveBeenCalledWith('search completed', {
      operation: 'search',
      queryLength: 16,
      resultCount: 1,
    });
  });

  it('refuse une recherche sans lecteur connecté', async () => {
    const { db } = database();
    const result = await searchUserContent({ ...ctx(db), userId: null, db: null }, { q: 'mot' });
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
