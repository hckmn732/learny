import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SYNC = path.join(ROOT, 'tools', 'sdd', 'sync-main.mjs');
const NOW = '2026-11-11T12:20:00.000Z'; // horloge figée (ADR-0047)
const BASE_AT = '2026-11-10T08:00:00.000Z';
const MIGRATION_AT = '2026-11-12T08:00:00.000Z';
const MAIN_AT = '2026-11-13T08:00:00.000Z';
const REAL_TRACKED = ['progress/state.json', 'progress/PROGRESS.md'];

let repo: string | null = null;

interface FixtureSpecState {
  status: string;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  branch: string | null;
  commit: string | null;
  lastError: string | null;
  validations: Record<string, unknown>;
}
interface FixtureState {
  version: number;
  updatedAt: string;
  specs: Record<string, FixtureSpecState>;
}

function git(...args: string[]) {
  if (!repo) throw new Error('no fixture');
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function file(rel: string): string {
  if (!repo) throw new Error('no fixture');
  return path.join(repo, rel);
}

function specState(status: string): FixtureSpecState {
  return {
    status,
    attempts: 0,
    startedAt: null,
    completedAt: null,
    branch: null,
    commit: null,
    lastError: null,
    validations: {},
  };
}

function write(rel: string, content: string): void {
  const target = file(rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** Catalogue minimal à deux pistes (ADR-1006) : produit P0/CP-0, migration P10/CP-10. */
function writeCatalog(): void {
  const catalog = {
    project: 'Fixture',
    version: 1,
    activeTrack: 'migration',
    tracks: {
      produit: { baseBranch: 'main', versionTags: true },
      migration: { baseBranch: 'migration', versionTags: false, adrBase: 1000 },
    },
    phases: [
      { id: 'P0', dir: 'p0', title: 'Produit', checkpoint: 'CP-0' },
      { id: 'P10', dir: 'p10', title: 'Migration', checkpoint: 'CP-10', track: 'migration' },
    ],
    specs: [
      {
        id: 'SPEC-001', title: 'Titre SPEC-001', phase: 'P0', priority: 'V1',
        path: 'specs/p0/SPEC-001.md', dependsOn: [], businessRules: [], screens: [], adrs: [], visual: 'demo',
      },
      {
        id: 'SPEC-1001', title: 'Titre SPEC-1001', phase: 'P10', priority: 'migration',
        path: 'specs/p10/SPEC-1001.md', dependsOn: ['SPEC-001'], businessRules: [], screens: [], adrs: [], visual: 'demo',
      },
    ],
  };
  write('specs/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`);
}

function baseState(): Record<string, unknown> {
  return {
    version: 1,
    updatedAt: BASE_AT,
    specs: { 'SPEC-001': specState('pending'), 'SPEC-1001': specState('pending') },
    checkpoints: {
      'CP-0': { status: 'pending', at: null, tag: null, report: null },
      'CP-10': { status: 'pending', at: null, tag: null, report: null },
    },
    anomalies: [],
  };
}

/** Côté migration : updatedAt + SPEC-1001 (piste migration) + SPEC-001 divergent (CL-5). */
function migrationState(): Record<string, unknown> {
  const st = baseState();
  st.updatedAt = MIGRATION_AT; // même ligne que main → conflit garanti à chaque sync
  const specs = st.specs as Record<string, FixtureSpecState>;
  specs['SPEC-1001'] = {
    ...specState('in_progress'),
    attempts: 1,
    startedAt: MIGRATION_AT,
    branch: 'spec/SPEC-1001-titre',
  };
  specs['SPEC-001'] = { ...specState('blocked'), lastError: 'divergé sur la piste' };
  return st;
}

/** Côté main : updatedAt + SPEC-001 (piste produit) avancés. */
function mainState(): Record<string, unknown> {
  const st = baseState();
  st.updatedAt = MAIN_AT;
  const specs = st.specs as Record<string, FixtureSpecState>;
  specs['SPEC-001'] = { ...specState('done'), attempts: 2, completedAt: MAIN_AT, commit: 'ab12cd3' };
  return st;
}

/** Dépôt temporaire : base sur `initialBranch`, suivi + un fichier de code committés. */
function fixtureRepo(initialBranch = 'main'): string {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-sync-'));
  writeCatalog();
  write('progress/state.json', `${JSON.stringify(baseState(), null, 2)}\n`);
  write('progress/PROGRESS.md', '# Progression du projet base\n');
  write('code/app.js', 'const version = 1;\n');
  git('init', '-q', '-b', initialBranch);
  git('config', 'user.name', 'Learny SDD Agent');
  git('config', 'user.email', 'sdd-agent@learny.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(sdd): point de départ');
  return repo;
}

/** Fait diverger migration et main (suivi et/ou code), puis revient sur migration. */
function diverge(opts: { tracking?: boolean; code?: boolean }): void {
  git('checkout', '-q', '-b', 'migration');
  if (opts.tracking) {
    write('progress/state.json', `${JSON.stringify(migrationState(), null, 2)}\n`);
    write('progress/PROGRESS.md', '# Progression du projet migration\n');
  }
  if (opts.code) write('code/app.js', 'const version = 2; // migration\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(sdd): avance la piste migration');

  git('checkout', '-q', 'main');
  if (opts.tracking) {
    write('progress/state.json', `${JSON.stringify(mainState(), null, 2)}\n`);
    write('progress/PROGRESS.md', '# Progression du projet main\n');
  }
  if (opts.code) write('code/app.js', 'const version = 3; // main\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(sdd): avance main');

  git('checkout', '-q', 'migration');
}

function syncMain(): { code: number; out: string } {
  if (!repo) throw new Error('no fixture');
  const r = spawnSync(process.execPath, [SYNC], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, SDD_ROOT: repo, SDD_NOW: NOW },
  });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

function readState(): FixtureState {
  return JSON.parse(fs.readFileSync(file('progress/state.json'), 'utf8')) as FixtureState;
}

function commitCount(): number {
  return git('log', '--format=%H').stdout.trim().split('\n').filter(Boolean).length;
}

const hash = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
const realHashes: Record<string, string> = {};

beforeAll(() => {
  for (const rel of REAL_TRACKED) realHashes[rel] = hash(rel);
});

afterEach(() => {
  if (repo) fs.rmSync(repo, { recursive: true, force: true });
  repo = null;
});

describe('[SPEC-1001] sync main', () => {
  it('résout un conflit limité au suivi puis committe (CA-4, EF-3, CL-1)', () => {
    fixtureRepo();
    diverge({ tracking: true });
    const r = syncMain();
    expect(r.code, r.out).toBe(0);

    // Commit de fusion, deux parents, message conventionnel exact.
    expect(git('show', '-s', '--format=%P', 'HEAD').stdout.trim().split(' ')).toHaveLength(2);
    expect(git('log', '-1', '--format=%s').stdout.trim()).toBe(
      'merge(sdd): synchronise main dans migration',
    );

    // ADR-1006 §4 : SPEC-001 (produit) ← main ; SPEC-1001 (migration) ← branche ; updatedAt max.
    const st = readState();
    expect(st.specs['SPEC-001']?.status).toBe('done');
    expect(st.specs['SPEC-001']?.attempts).toBe(2);
    expect(st.specs['SPEC-001']?.lastError).toBeNull();
    expect(st.specs['SPEC-1001']?.status).toBe('in_progress');
    expect(st.updatedAt).toBe(MAIN_AT);

    // PROGRESS.md régénéré depuis l'état fusionné, sans marqueurs (CL-5 : pas de mélange).
    const md = fs.readFileSync(file('progress/PROGRESS.md'), 'utf8');
    expect(md).toContain(`le ${NOW}`);
    expect(md).toContain('in_progress');
    expect(md).not.toContain('<<<<<<<');
    expect(fs.readFileSync(file('progress/state.json'), 'utf8')).not.toContain('<<<<<<<');

    // Fusion commitée : arbre propre.
    expect(git('status', '--porcelain').stdout.trim()).toBe('');
  });

  it('fusionne proprement quand main avance sans toucher au suivi (EF-3)', () => {
    fixtureRepo();
    git('checkout', '-q', '-b', 'migration');
    git('commit', '-q', '--allow-empty', '-m', 'chore(sdd): travail de la piste');
    git('checkout', '-q', 'main');
    write('code/app.js', 'const version = 9;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'chore(sdd): avance main');
    git('checkout', '-q', 'migration');

    const r = syncMain();
    expect(r.code, r.out).toBe(0);
    expect(git('show', '-s', '--format=%P', 'HEAD').stdout.trim().split(' ')).toHaveLength(2);
    expect(git('log', '-1', '--format=%s').stdout.trim()).toBe(
      'merge(sdd): synchronise main dans migration',
    );
    expect(git('status', '--porcelain').stdout.trim()).toBe('');
  });

  it('résout le suivi mais s’arrête code 2 sans commit sur un conflit de code (CL-4, CA-4)', () => {
    fixtureRepo();
    diverge({ tracking: true, code: true });
    const before = commitCount();

    const r = syncMain();
    expect(r.code, r.out).toBe(2);
    expect(r.out).toContain('code/app.js');

    // Résolution du suivi appliquée (indexée), même sans commit.
    const st = readState();
    expect(st.specs['SPEC-001']?.status).toBe('done');
    expect(st.specs['SPEC-1001']?.status).toBe('in_progress');
    expect(st.updatedAt).toBe(MAIN_AT);
    expect(fs.readFileSync(file('progress/PROGRESS.md'), 'utf8')).not.toContain('<<<<<<<');

    // Aucun commit : même tête, fusion toujours en cours.
    expect(commitCount()).toBe(before);
    expect(git('rev-parse', '-q', '--verify', 'MERGE_HEAD').status).toBe(0);
  });

  it('s’arrête code 2 avec la liste des fichiers sans rien résoudre (conflit de code seul)', () => {
    fixtureRepo();
    diverge({ code: true });
    const before = commitCount();

    const r = syncMain();
    expect(r.code, r.out).toBe(2);
    expect(r.out).toContain('code/app.js');
    expect(commitCount()).toBe(before);
    expect(git('rev-parse', '-q', '--verify', 'MERGE_HEAD').status).toBe(0);
  });

  it('sort 1 quand la branche main locale manque (CL-3)', () => {
    // Dépôt créé directement sur migration : aucune branche main locale.
    fixtureRepo('migration');
    const r = syncMain();
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('main introuvable');
    expect(git('rev-parse', '-q', '--verify', 'MERGE_HEAD').status).not.toBe(0);
  });

  it('ne touche jamais au suivi du vrai dépôt', () => {
    for (const rel of REAL_TRACKED) expect(hash(rel), rel).toBe(realHashes[rel]);
  });
});
