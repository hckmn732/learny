import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createFixture, removeFixture } from '../fixture';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FIXED_NOW = '2026-11-11T12:20:00.000Z';
const REAL_TRACKED = ['progress/state.json', 'progress/PROGRESS.md', 'specs/catalog.json'];

let repo: string | null = null;

function sdd(script: string, ...args: string[]) {
  if (!repo) throw new Error('no fixture');
  // pnpm forwards the arguments to node tools/sdd/<script>.mjs; SDD_ROOT points at the fixture.
  const r = spawnSync('pnpm', ['-s', `sdd:${script}`, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, SDD_ROOT: repo, SDD_NOW: FIXED_NOW, SDD_PUSH: '0' },
  });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

function git(...args: string[]) {
  if (!repo) throw new Error('no fixture');
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function file(rel: string): string {
  if (!repo) throw new Error('no fixture');
  return path.join(repo, rel);
}

interface StoredSpec {
  status: string;
  attempts: number;
  lastError: string | null;
  validations: Record<string, { status: string }>;
}

function readState(): { specs: Record<string, StoredSpec> } {
  return JSON.parse(fs.readFileSync(file('progress/state.json'), 'utf8')) as {
    specs: Record<string, StoredSpec>;
  };
}

function writeState(st: unknown) {
  fs.mkdirSync(path.dirname(file('progress/state.json')), { recursive: true });
  fs.writeFileSync(file('progress/state.json'), JSON.stringify(st, null, 2));
}

function fixtureRepo(): string {
  repo = createFixture();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Learny SDD Agent');
  git('config', 'user.email', 'sdd-agent@learny.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(sdd): initialise le référentiel');
  return repo;
}

const hash = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
const realHashes: Record<string, string> = {};

beforeAll(() => {
  for (const rel of REAL_TRACKED) realHashes[rel] = hash(rel);
});

afterEach(() => {
  if (repo) removeFixture(repo);
  repo = null;
});

describe('[SPEC-003] CLI', () => {
  it('forwards arguments to next, status and audit (CA-1)', () => {
    fixtureRepo();
    const next = sdd('next', '--json');
    expect(next.code).toBe(0);
    expect(JSON.parse(next.out)).toEqual({
      kind: 'start',
      id: 'SPEC-001',
      title: 'Titre SPEC-001',
      path: 'specs/p0/SPEC-001-titre.md',
      dependsOn: [],
    });

    expect(sdd('status').code).toBe(0);
    const first = fs.readFileSync(file('progress/PROGRESS.md'), 'utf8');
    expect(first).toContain(`le ${FIXED_NOW}`);
    expect(first).toContain('| Spécifications | 3 (V1 : 3, V2 : 0) |');
    expect(sdd('status').code).toBe(0);
    expect(fs.readFileSync(file('progress/PROGRESS.md'), 'utf8')).toBe(first);

    const audit = sdd('audit');
    expect(audit.code, audit.out).toBe(0);
    expect(fs.existsSync(file('progress/audit.md'))).toBe(false);
    expect(sdd('audit', '--write').code).toBe(0);
    expect(fs.readFileSync(file('progress/audit.md'), 'utf8')).toContain('- Erreurs : 0');
  });

  it('starts, locks and resumes a specification (CA-2, CL-3, CL-5)', () => {
    fixtureRepo();
    const start = sdd('start', 'SPEC-001');
    expect(start.code, start.out).toBe(0);
    expect(readState().specs['SPEC-001']?.status).toBe('in_progress');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('spec/SPEC-001-titre');
    const lock = fs.readFileSync(file('.sdd/lock.json'), 'utf8');

    const before = fs.readFileSync(file('progress/state.json'), 'utf8');
    const other = sdd('start', 'SPEC-003');
    expect(other.code).not.toBe(0);
    expect(other.out).toContain('Verrou actif sur SPEC-001');
    expect(fs.readFileSync(file('progress/state.json'), 'utf8')).toBe(before);
    expect(fs.readFileSync(file('.sdd/lock.json'), 'utf8')).toBe(lock);

    expect(JSON.parse(sdd('next', '--json').out)).toMatchObject({ kind: 'resume', id: 'SPEC-001' });
    const resume = sdd('start', 'SPEC-001');
    expect(resume.code).toBe(0);
    expect(resume.out).toContain('REPRISE SPEC-001');
  });

  it('refuses an unknown or missing identifier without writing (CL-1)', () => {
    fixtureRepo();
    const unknown = sdd('start', 'SPEC-999');
    expect(unknown.code).not.toBe(0);
    expect(unknown.out).toContain('Spécification inconnue : SPEC-999');
    expect(sdd('start').out).toContain('Identifiant de spécification attendu');
    expect(fs.existsSync(file('progress/state.json'))).toBe(false);
  });

  it('blocks after the fifth failure and shows dependents as dependency_blocked (CA-2)', () => {
    fixtureRepo();
    expect(sdd('start', 'SPEC-001').code).toBe(0);
    for (let i = 1; i <= 4; i += 1) {
      const r = sdd('fail', 'SPEC-001', `échec ${String(i)}`);
      expect(r.out).toContain(`tentative ${String(i)}/5`);
    }
    expect(readState().specs['SPEC-001']?.status).toBe('in_progress');
    expect(sdd('fail', 'SPEC-001', 'échec 5').out).toContain('SPEC-001 bloquée');
    const st = readState();
    expect(st.specs['SPEC-001']).toMatchObject({ status: 'blocked', attempts: 5, lastError: 'échec 5' });
    expect(st.specs['SPEC-002']?.status).toBe('pending');
    expect(fs.readFileSync(file('progress/PROGRESS.md'), 'utf8')).toContain('dependency_blocked');
    expect(fs.readFileSync(file('progress/anomalies.md'), 'utf8')).toContain('**SPEC-001**');
  });

  it('records an external blocker immediately', () => {
    fixtureRepo();
    expect(sdd('start', 'SPEC-001').code).toBe(0);
    expect(sdd('fail', 'SPEC-001', 'service tiers indisponible', '--external').code).toBe(0);
    expect(readState().specs['SPEC-001']?.status).toBe('blocked');
    expect(fs.readFileSync(file('progress/blockers.md'), 'utf8')).toContain(
      'service tiers indisponible',
    );
    expect(fs.existsSync(file('.sdd/lock.json'))).toBe(false);
  });

  it('refuses validate outside in_progress and checkpoint before the phase is done', () => {
    fixtureRepo();
    const v = sdd('validate', 'SPEC-002');
    expect(v.code).not.toBe(0);
    expect(v.out).toContain('SPEC-002 doit être en cours');
    const cp = sdd('checkpoint', 'CP-0');
    expect(cp.code).not.toBe(0);
    expect(cp.out).toContain('Spécifications non terminées : SPEC-001, SPEC-002, SPEC-003');
  });

  it('refuses complete when a video, a @visual test or a criterion is missing (CA-5)', () => {
    fixtureRepo();
    expect(sdd('start', 'SPEC-001').code).toBe(0);
    const passed = { status: 'passed', at: FIXED_NOW, details: '' };
    const st = JSON.parse(fs.readFileSync(file('progress/state.json'), 'utf8')) as {
      specs: Record<string, { validations: Record<string, unknown> }>;
    };
    const spec = st.specs['SPEC-001'];
    if (!spec) throw new Error('missing');
    const all = ['lint', 'typecheck', 'build', 'unit', 'integration', 'e2e', 'visual', 'acceptance'];

    spec.validations = Object.fromEntries(all.filter((k) => k !== 'visual').map((k) => [k, passed]));
    writeState(st);
    const noVisual = sdd('complete', 'SPEC-001');
    expect(noVisual.code).not.toBe(0);
    expect(noVisual.out).toContain('Validations non réussies : visual');

    spec.validations = Object.fromEntries(
      all.map((k) => [k, k === 'acceptance' ? { ...passed, status: 'failed' } : passed]),
    );
    writeState(st);
    expect(sdd('complete', 'SPEC-001').out).toContain('Validations non réussies : acceptance');

    spec.validations = Object.fromEntries(all.map((k) => [k, passed]));
    writeState(st);
    const ev = file('evidence/SPEC-001');
    fs.mkdirSync(path.join(ev, 'video'), { recursive: true });
    for (const f of ['summary.md', 'acceptance.md', 'checks.json']) fs.writeFileSync(path.join(ev, f), '');
    const noVideo = sdd('complete', 'SPEC-001');
    expect(noVideo.code).not.toBe(0);
    expect(noVideo.out).toContain('Aucune vidéo dans evidence/SPEC-001/video');
    expect(readState().specs['SPEC-001']?.status).toBe('in_progress');
  });

  it('creates an ADR in the target repository', () => {
    fixtureRepo();
    const r = sdd('adr', 'new', 'Décision de test', '--context', 'Contexte.', '--decision', 'Décision.');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('ADR-0002 créé');
    const adr = fs.readFileSync(file('docs/adr/ADR-0002-decision-de-test.md'), 'utf8');
    expect(adr).toContain('- **Date** : 2026-11-11');
  });

  it('reports a malformed state without rewriting it (CL-8)', () => {
    fixtureRepo();
    writeState({});
    fs.writeFileSync(file('progress/state.json'), '{ oops');
    const r = sdd('next');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('progress/state.json illisible');
    expect(fs.readFileSync(file('progress/state.json'), 'utf8')).toBe('{ oops');
  });

  it('never mutates the real repository tracking files', () => {
    for (const rel of REAL_TRACKED) expect(hash(rel), rel).toBe(realHashes[rel]);
  });
});
