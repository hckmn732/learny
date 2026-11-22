// Vitest [SPEC-3003] — keys of the idempotent mutations (ET-3).
import { describe, expect, it } from 'vitest';

import { IdempotencyRegistry } from './idempotency';
import { uuidV4 } from './uuid';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('[SPEC-3003] clés d’idempotence (ET-3)', () => {
  it('garde la même clé pour une intention tant qu’elle n’a pas réussi (ET-3)', () => {
    const registry = new IdempotencyRegistry(() => 'cle-stable');

    expect(registry.keyFor('quiz:42')).toBe('cle-stable');
    expect(registry.keyFor('quiz:42')).toBe('cle-stable');
    expect(registry.has('quiz:42')).toBe(true);
  });

  it('crée une clé neuve après un succès, et une clé distincte par intention', () => {
    let sequence = 0;
    const registry = new IdempotencyRegistry(() => `cle-${String((sequence += 1))}`);

    expect(registry.keyFor('a')).toBe('cle-1');
    expect(registry.keyFor('b')).toBe('cle-2');
    registry.resolve('a');
    expect(registry.keyFor('a')).toBe('cle-3');
    expect(registry.size()).toBe(2);
  });

  it('expose les clés en cours pour la file hors ligne (SPEC-3305)', () => {
    const registry = new IdempotencyRegistry(() => 'cle-x');

    registry.keyFor('note:7');

    expect(registry.snapshot()).toEqual({ 'note:7': 'cle-x' });
    registry.clear();
    expect(registry.size()).toBe(0);
  });

  it('produit des identifiants au format UUID v4', () => {
    expect(uuidV4()).toMatch(uuidPattern);
    expect(uuidV4(() => 0.5)).toMatch(uuidPattern);
    expect(uuidV4()).not.toBe(uuidV4());
  });
});
