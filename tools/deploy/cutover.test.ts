// [SPEC-2301] Progressive cutover by ownership override, proven on the real inventory.
//
// The tool is the only writer of `OWNERSHIP_OVERRIDES`: a canary flips the reads of one context
// first, a promotion flips all its mutations at once, and a rollback puts everything back on the
// relay. The refusals are the proof of the single-writer invariant of ADR-2005.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CutoverError,
  ROOT,
  assertSingleWriter,
  checkOverrides,
  compact,
  contextsOf,
  expand,
  formatOverrides,
  isRead,
  normaliseOverrides,
  ownerOf,
  parseOwnership,
  planCutover,
  readTables,
  writersOf,
} from './cutover.mjs';

const tables = readTables(ROOT);
const RELAY_ONLY = { '*': 'ts' } as const;

function operationIds(context: string): { reads: string[]; writes: string[] } {
  const group = contextsOf(tables.inventory).get(context);
  if (group === undefined) throw new Error(`contexte ${context} inconnu`);
  return group;
}

describe('[SPEC-2301] progressive cutover planner', () => {
  it('a canary moves the reads only, never a mutation', () => {
    const plan = planCutover(tables, { stage: 'reads', context: 'learning', current: RELAY_ONLY });
    const { reads, writes } = operationIds('learning');
    expect(reads.length).toBeGreaterThan(0);
    expect(writes.length).toBeGreaterThan(0);
    for (const id of reads) expect(plan[id]).toBe('py');
    // The wildcard carries them: an explicit `ts` entry would be redundant and is compacted away.
    for (const id of writes) expect(ownerOf(id, tables.ownership.operations, plan)).toBe('ts');
    expect(plan['*']).toBe('ts');
    // The contract of the facade: only known entries, only `ts` and `py`.
    expect(checkOverrides(tables, plan)).toEqual([]);
  });

  it('a promotion moves every mutation of the context at once', () => {
    const canary = planCutover(tables, {
      stage: 'reads',
      context: 'learning',
      current: RELAY_ONLY,
    });
    const promoted = planCutover(tables, {
      stage: 'writes',
      context: 'learning',
      current: canary,
    });
    for (const id of operationIds('learning').writes) expect(promoted[id]).toBe('py');
    for (const id of operationIds('learning').reads) expect(promoted[id]).toBe('py');
    // Other contexts are untouched: the wildcard still relays them.
    const other = tables.inventory.find((operation) => operation.context === 'tutor');
    expect(promoted[other?.id ?? '']).toBeUndefined();
    expect(writersOf(tables, promoted, 'learning').owners).toEqual(['py']);
  });

  it('refuses a promotion before the read canary', () => {
    expect(() =>
      planCutover(tables, { stage: 'writes', context: 'learning', current: RELAY_ONLY }),
    ).toThrow(/canary de lecture non terminé/);
    try {
      planCutover(tables, { stage: 'writes', context: 'learning', current: RELAY_ONLY });
    } catch (error) {
      expect(error).toBeInstanceOf(CutoverError);
      expect((error as CutoverError).code).toBe('READS_NOT_PROMOTED');
    }
  });

  it('refuses a read canary when the mutations are already Python', () => {
    try {
      planCutover(tables, { stage: 'reads', context: 'learning', current: {} });
      throw new Error('le canary aurait dû être refusé');
    } catch (error) {
      expect((error as CutoverError).code).toBe('WRITES_FIRST');
    }
  });

  it('refuses a state where a mutation is served on both sides', () => {
    const split = { '*': 'ts', 'slots.move': 'py' } as const;
    expect(() => assertSingleWriter(tables, split, 'learning')).toThrow(/des deux côtés/);
    expect(() =>
      planCutover(tables, { stage: 'writes', context: 'learning', current: split }),
    ).toThrow(/des deux côtés/);
  });

  it('refuses a percentage owner the facade would ignore', () => {
    expect(() => normaliseOverrides('{"agenda.get":"py@10"}')).toThrow(/ts et py/);
    expect(() => normaliseOverrides('not json')).toThrow();
    expect(() => normaliseOverrides({ ghost: 'py' })).not.toThrow();
    expect(checkOverrides(tables, normaliseOverrides({ ghost: 'py' }))).toEqual([
      'entrée inconnue : ghost',
    ]);
  });

  it('refuses an unknown context or an unknown stage', () => {
    expect(() =>
      planCutover(tables, { stage: 'reads', context: 'chapters', current: RELAY_ONLY }),
    ).toThrow(/contexte inconnu/);
    expect(() =>
      planCutover(tables, { stage: 'sprint', context: 'learning', current: RELAY_ONLY }),
    ).toThrow(/étape inconnue/);
    expect(() => planCutover(tables, { stage: 'reads', current: RELAY_ONLY })).toThrow(
      /--context est requis/,
    );
  });

  it('rolls a context back to the relay without touching the others', () => {
    const promoted = planCutover(tables, {
      stage: 'writes',
      context: 'learning',
      current: planCutover(tables, { stage: 'reads', context: 'learning', current: RELAY_ONLY }),
    });
    const before = planCutover(tables, { stage: 'reads', context: 'billing', current: promoted });
    const rolledBack = planCutover(tables, {
      stage: 'rollback',
      context: 'learning',
      current: before,
    });
    expect(rolledBack['*']).toBe('ts');
    for (const id of [...operationIds('learning').reads, ...operationIds('learning').writes]) {
      expect(ownerOf(id, tables.ownership.operations, rolledBack)).toBe('ts');
    }
    // Billing, promoted before the rollback, keeps its canary.
    for (const id of operationIds('billing').reads) {
      expect(ownerOf(id, tables.ownership.operations, rolledBack)).toBe('py');
    }
  });

  it('ends a total cutover with an empty override, and a total rollback with the wildcard', () => {
    expect(planCutover(tables, { stage: 'writes', all: true, current: RELAY_ONLY })).toEqual({});
    expect(planCutover(tables, { stage: 'rollback', all: true })).toEqual({ '*': 'ts' });
    // The empty override is the committed table: the end state of the phase.
    expect(expand(tables, {})).toEqual(
      expand(tables, planCutover(tables, { stage: 'writes', all: true })),
    );
  });

  it('compacts the override to what differs from the wildcard', () => {
    const plan = planCutover(tables, { stage: 'reads', context: 'learning', current: RELAY_ONLY });
    const redundant = { ...plan, 'series.streak': 'ts' as const };
    const compacted = compact(tables, redundant);
    expect(compacted['*']).toBe('ts');
    expect(compacted['series.streak']).toBeUndefined();
    expect(compact(tables, {})).toEqual({});
    expect(compact(tables, { '*': 'ts' })).toEqual({ '*': 'ts' });
  });

  it('formats a stable JSON object the facade reads', () => {
    const text = formatOverrides({ 'b.get': 'py', '*': 'ts', 'a.post': 'py' });
    expect(text).toBe('{"*":"ts","a.post":"py","b.get":"py"}');
    expect(JSON.parse(text)).toEqual({ '*': 'ts', 'a.post': 'py', 'b.get': 'py' });
  });

  it('reads the real inventory: every operation has one owner and a known method', () => {
    const ownership = parseOwnership(
      // The real file, through the same parser the tool uses.
      readFileSync(`${ROOT}/api/ownership.yaml`, 'utf8'),
    );
    expect(Object.keys(ownership.operations)).toHaveLength(217);
    expect(tables.inventory).toHaveLength(217);
    for (const operation of tables.inventory) {
      expect(ownership.operations[operation.id]).toBeDefined();
      expect(typeof isRead(operation)).toBe('boolean');
    }
    const contexts = [...contextsOf(tables.inventory).keys()];
    expect(contexts).toContain('learning');
    expect(contexts).toContain('billing');
    expect(writersOf(tables, {}, 'learning').owners).toEqual(['py']);
  });
});
