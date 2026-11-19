import { describe, expect, it } from 'vitest';

import {
  displayStatus,
  indexCatalog,
  nextAction,
  nextActionJson,
  normalizeState,
  trackConfig,
  type Catalog,
  type SddState,
} from '../../core.mjs';

function catalog(): Catalog {
  const spec = (id: string, phase: string, dependsOn: string[]) => ({
    id,
    title: `Titre ${id}`,
    phase,
    priority: 'V1',
    path: `specs/${id}.md`,
    dependsOn,
    businessRules: [],
    screens: [],
    adrs: [],
  });
  return indexCatalog({
    phases: [
      { id: 'P0', dir: 'p0', title: 'Zéro', checkpoint: 'CP-0' },
      { id: 'P9', dir: 'p9', title: 'Neuf', checkpoint: 'CP-9' },
    ],
    specs: [
      spec('SPEC-001', 'P0', []),
      spec('SPEC-002', 'P0', ['SPEC-001']),
      spec('SPEC-003', 'P0', ['SPEC-002']),
      spec('SPEC-004', 'P0', ['SPEC-001']),
      spec('SPEC-901', 'P9', ['SPEC-001']),
    ],
  });
}

function state(c: Catalog, patch: (st: SddState) => void = () => undefined): SddState {
  const st = normalizeState(c, null);
  patch(st);
  return st;
}

const done = (st: SddState, ...ids: string[]) => {
  for (const id of ids) {
    const s = st.specs[id];
    if (s) s.status = 'done';
  }
};

describe('[SPEC-003] next action', () => {
  it('starts with SPEC-001 on a fresh state', () => {
    const c = catalog();
    expect(nextActionJson(nextAction(c, state(c)))).toMatchObject({ kind: 'start', id: 'SPEC-001' });
  });

  it('resumes the in-progress specification first (CL-5)', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001');
      const x = s.specs['SPEC-004'];
      if (x) x.status = 'in_progress';
    });
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'resume', id: 'SPEC-004' });
  });

  it('proposes the next ready specification once dependencies are done', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001');
    });
    expect(displayStatus(c, st, 'SPEC-002')).toBe('ready');
    expect(displayStatus(c, st, 'SPEC-003')).toBe('waiting');
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'start', id: 'SPEC-002' });
  });

  it('keeps the next phase locked until its checkpoint passes', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001');
    });
    expect(displayStatus(c, st, 'SPEC-901')).toBe('waiting');
  });

  it('asks for the checkpoint when the phase is done', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001', 'SPEC-002', 'SPEC-003', 'SPEC-004');
    });
    expect(nextActionJson(nextAction(c, st))).toEqual({
      kind: 'checkpoint',
      checkpoint: 'CP-0',
      phase: 'P0',
    });
  });

  it('finishes only after CP-9', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001', 'SPEC-002', 'SPEC-003', 'SPEC-004', 'SPEC-901');
      const cp0 = s.checkpoints['CP-0'];
      if (cp0) cp0.status = 'passed';
    });
    expect(nextAction(c, st).kind).toBe('checkpoint');
    const cp9 = st.checkpoints['CP-9'];
    if (cp9) cp9.status = 'passed';
    expect(nextAction(c, st).kind).toBe('finished');
  });

  it('shows dependents of a blocked spec as dependency_blocked without mutating them (CA-2)', () => {
    const c = catalog();
    const st = state(c, (s) => {
      done(s, 'SPEC-001');
      const x = s.specs['SPEC-002'];
      if (x) x.status = 'blocked';
    });
    expect(displayStatus(c, st, 'SPEC-003')).toBe('dependency_blocked');
    expect(st.specs['SPEC-003']?.status).toBe('pending');
    // An independent branch stays selectable (CL-6).
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'start', id: 'SPEC-004' });
  });

  it('runs an independent track without waiting for the product checkpoints (ADR-0341)', () => {
    const c = catalog();
    c.phases.push(
      { id: 'P10', dir: 'p10', title: 'Migration A', checkpoint: 'CP-10', track: 'migration' },
      { id: 'P11', dir: 'p11', title: 'Migration B', checkpoint: 'CP-11', track: 'migration', requires: ['CP-0'] },
    );
    const base = c.byId['SPEC-001'];
    if (!base) throw new Error('fixture');
    const mig = (id: string, phase: string, dependsOn: string[]) => {
      const s = { ...base, id, phase, path: `specs/${id}.md`, dependsOn };
      c.specs.push(s);
      c.byId[id] = s;
    };
    mig('SPEC-1001', 'P10', ['SPEC-001']);
    mig('SPEC-1101', 'P11', ['SPEC-1001']);
    const st = state(c, (s) => {
      done(s, 'SPEC-001', 'SPEC-002', 'SPEC-003', 'SPEC-004');
    });
    // The product track asks for CP-0; the migration track starts SPEC-1001 regardless.
    expect(nextAction(c, st).kind).toBe('checkpoint');
    expect(nextActionJson(nextAction(c, st, 'migration'))).toMatchObject({ kind: 'start', id: 'SPEC-1001' });
    c.activeTrack = 'migration';
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'start', id: 'SPEC-1001' });
    // P11 waits for CP-10 (same track) and CP-0 (requires).
    done(st, 'SPEC-1001');
    const set = (cp: string) => {
      const x = st.checkpoints[cp];
      if (x) x.status = 'passed';
    };
    set('CP-10');
    expect(displayStatus(c, st, 'SPEC-1101')).toBe('waiting');
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'stuck', waitingFor: ['CP-0'] });
    set('CP-0');
    expect(nextActionJson(nextAction(c, st))).toMatchObject({ kind: 'start', id: 'SPEC-1101' });
    // Track configuration: the product track merges into main, the migration track into its branch.
    c.tracks = { migration: { baseBranch: 'migration', versionTags: false } };
    expect(trackConfig(c, 'produit')).toEqual({ baseBranch: 'main', versionTags: true });
    expect(trackConfig(c, 'migration')).toEqual({ baseBranch: 'migration', versionTags: false });
  });

  it('never selects a member of a dependency cycle (CL-2)', () => {
    const c = catalog();
    const a = c.byId['SPEC-002'];
    const b = c.byId['SPEC-003'];
    if (a && b) {
      a.dependsOn = ['SPEC-003'];
      b.dependsOn = ['SPEC-002'];
    }
    const st = state(c, (s) => {
      done(s, 'SPEC-001', 'SPEC-004');
    });
    const action = nextAction(c, st);
    expect(action.kind).toBe('stuck');
  });
});
