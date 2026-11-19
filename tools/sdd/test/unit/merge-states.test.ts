import { describe, expect, it } from 'vitest';

import {
  emptySpecState,
  indexCatalog,
  mergeTrackStates,
  normalizeState,
  type Catalog,
  type CheckpointState,
  type SddState,
  type SpecState,
  type StoredStatus,
} from '../../core.mjs';

/** Catalogue à deux pistes comme specs/catalog.json : produit (P0) et migration (P10, ADR-1006). */
function trackCatalog(): Catalog {
  const spec = (id: string, phase: string) => ({
    id,
    title: `Titre ${id}`,
    phase,
    priority: phase === 'P10' ? 'migration' : 'V1',
    path: `specs/${phase}/${id}.md`,
    dependsOn: [],
    businessRules: [],
    screens: [],
    adrs: [],
  });
  return indexCatalog({
    activeTrack: 'migration',
    tracks: {
      produit: { baseBranch: 'main', versionTags: true },
      migration: { baseBranch: 'migration', versionTags: false, adrBase: 1000 },
    },
    phases: [
      { id: 'P0', dir: 'p0', title: 'Produit', checkpoint: 'CP-0' },
      { id: 'P10', dir: 'p10', title: 'Migration', checkpoint: 'CP-10', track: 'migration' },
    ],
    specs: [spec('SPEC-001', 'P0'), spec('SPEC-1001', 'P10'), spec('SPEC-1002', 'P10')],
  });
}

function entry(status: StoredStatus, patch: Partial<SpecState> = {}): SpecState {
  return { ...emptySpecState(), status, ...patch };
}

function checkpoint(status: CheckpointState['status']): CheckpointState {
  return { status, at: null, tag: null, report: null };
}

function state(
  specs: Record<string, SpecState>,
  checkpoints: Record<string, CheckpointState> = {},
  updatedAt: string | null = null,
  anomalies: unknown[] = [],
): SddState {
  return { version: 1, updatedAt, specs, checkpoints, anomalies };
}

const TRACK = 'migration';

describe('[SPEC-1001] merge track states', () => {
  it('garde les entrées migration de ours et les entrées produit de theirs (ADR-1006 §4)', () => {
    const c = trackCatalog();
    const oursMig = entry('in_progress', { attempts: 1, branch: 'spec/SPEC-1001-titre' });
    const theirsMig = entry('pending', { attempts: 0 });
    const merged = mergeTrackStates(
      c,
      state({ 'SPEC-1001': oursMig }),
      state({ 'SPEC-1001': theirsMig, 'SPEC-001': entry('done', { attempts: 2, commit: 'ab12cd3' }) }),
      TRACK,
    );
    expect(merged.specs['SPEC-1001']).toEqual(oursMig);
    expect(merged.specs['SPEC-001']).toEqual(entry('done', { attempts: 2, commit: 'ab12cd3' }));
  });

  it('décide par piste, jamais champ par champ (CL-5, CA-4)', () => {
    const c = trackCatalog();
    const theirsProd = entry('done', {
      attempts: 2,
      validations: { lint: { status: 'passed', at: '2026-11-13T10:00:00.000Z', details: 'main' } },
    });
    const oursProd = entry('blocked', {
      attempts: 5,
      lastError: 'côté migration',
      validations: { lint: { status: 'failed', at: '2026-11-12T10:00:00.000Z', details: 'migration' } },
    });
    const merged = mergeTrackStates(
      c,
      state({ 'SPEC-001': oursProd }),
      state({ 'SPEC-001': theirsProd }),
      TRACK,
    );
    expect(merged.specs['SPEC-001']).toEqual(theirsProd);
    expect(merged.specs['SPEC-001']?.lastError).toBeNull();
  });

  it("retombe sur l'autre côté quand le côté propriétaire manque l'entrée", () => {
    const c = trackCatalog();
    const onlyOurs = entry('in_progress', { attempts: 3 });
    const onlyTheirs = entry('pending');
    const merged = mergeTrackStates(
      c,
      state({ 'SPEC-001': onlyOurs }),
      state({ 'SPEC-1002': onlyTheirs }),
      TRACK,
    );
    expect(merged.specs['SPEC-001']).toEqual(onlyOurs);
    expect(merged.specs['SPEC-1002']).toEqual(onlyTheirs);
    // Pur : une spécification absente des deux états n'est pas inventée ; la normalisation
    // du dépôt (sync-main) complète ensuite les entrées manquantes du catalogue.
    expect(merged.specs['SPEC-1001']).toBeUndefined();
    expect(normalizeState(c, merged).specs['SPEC-1001']?.status).toBe('pending');
  });

  it('garde le updatedAt le plus récent, quel que soit le côté propriétaire (EF-3)', () => {
    const c = trackCatalog();
    expect(
      mergeTrackStates(
        c,
        state({}, {}, '2026-11-12T10:00:00.000Z'),
        state({}, {}, '2026-11-13T09:00:00.000Z'),
        TRACK,
      ).updatedAt,
    ).toBe('2026-11-13T09:00:00.000Z');
    expect(
      mergeTrackStates(c, state({}, {}, '2026-11-14T08:00:00.000Z'), state({}, {}, null), TRACK)
        .updatedAt,
    ).toBe('2026-11-14T08:00:00.000Z');
    expect(mergeTrackStates(c, state({}, {}, null), state({}, {}, null), TRACK).updatedAt).toBeNull();
  });

  it('fusionne les checkpoints par piste (CP produit ← main, CP migration ← branche)', () => {
    const c = trackCatalog();
    const merged = mergeTrackStates(
      c,
      state(
        {},
        { 'CP-0': checkpoint('pending'), 'CP-10': checkpoint('pending'), 'CP-99': checkpoint('passed') },
      ),
      state({}, { 'CP-0': checkpoint('passed'), 'CP-10': checkpoint('failed') }),
      TRACK,
    );
    expect(merged.checkpoints['CP-0']).toEqual(checkpoint('passed'));
    expect(merged.checkpoints['CP-10']).toEqual(checkpoint('pending'));
    expect(merged.checkpoints['CP-99']?.status).toBe('passed'); // hors catalogue : conservé
  });

  it('unionne les anomalies sans doublon hérité du point de départ', () => {
    const c = trackCatalog();
    const shared = {
      spec: 'SPEC-001',
      at: '2026-11-10T10:00:00.000Z',
      attempts: 5,
      reason: 'avant la piste',
      external: false,
    };
    const merged = mergeTrackStates(
      c,
      state({}, {}, null, [
        shared,
        {
          spec: 'SPEC-1001',
          at: '2026-11-12T10:00:00.000Z',
          attempts: 1,
          reason: 'conflit de fusion',
          external: false,
        },
      ]),
      state({}, {}, null, [
        shared,
        { spec: 'SPEC-807', at: '2026-11-13T10:00:00.000Z', attempts: 2, reason: 'échec e2e', external: false },
      ]),
      TRACK,
    );
    expect(merged.anomalies).toHaveLength(3);
  });

  it('ne modifie jamais ses arguments (fonction pure, ET-4)', () => {
    const c = trackCatalog();
    const ours = state(
      { 'SPEC-1001': entry('in_progress') },
      { 'CP-10': checkpoint('pending') },
      '2026-11-12T10:00:00.000Z',
    );
    const theirs = state(
      { 'SPEC-001': entry('done') },
      { 'CP-0': checkpoint('passed') },
      '2026-11-13T10:00:00.000Z',
    );
    const beforeOurs = structuredClone(ours);
    const beforeTheirs = structuredClone(theirs);
    const merged = mergeTrackStates(c, ours, theirs, TRACK);
    expect(ours).toEqual(beforeOurs);
    expect(theirs).toEqual(beforeTheirs);
    expect(merged.version).toBe(1);
  });
});
