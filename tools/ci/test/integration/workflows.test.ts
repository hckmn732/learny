import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { commandExists } from '../../check-workflows.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CHECK = path.join(ROOT, 'tools', 'ci', 'check-workflows.mjs');
const FIXTURES: string[] = [];

const originalRemotes = spawnSync('git', ['remote', '-v'], { cwd: ROOT, encoding: 'utf8' }).stdout;

afterAll(() => {
  for (const dir of FIXTURES) fs.rmSync(dir, { recursive: true, force: true });
});

/** A temporary repository containing only what ci:check reads (ET-6). */
function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-ci-'));
  FIXTURES.push(dir);
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  for (const name of ['ci.yml', 'pr-title.yml']) {
    fs.copyFileSync(
      path.join(ROOT, '.github', 'workflows', name),
      path.join(dir, '.github', 'workflows', name),
    );
  }
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
  return dir;
}

function editWorkflow(dir: string, name: string, transform: (text: string) => string): void {
  const file = path.join(dir, '.github', 'workflows', name);
  fs.writeFileSync(file, transform(fs.readFileSync(file, 'utf8')));
}

function runCheck(root: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, [CHECK, '--root', root], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

describe('[SPEC-011] actionlint', () => {
  it('validates the real workflows and reports what was actually executed (CA-4)', () => {
    const result = runCheck(ROOT);
    if (commandExists('actionlint')) {
      expect(result.out).toContain('actionlint');
      expect(result.out).toContain('OK');
      expect(result.code, result.out).toBe(0);
    } else {
      // CL-4: no actionlint, no green result and an installation instruction.
      expect(result.code).toBe(1);
      expect(result.out).toContain('actionlint est requis');
      expect(result.out).toContain('github.com/rhysd/actionlint#installation');
    }
    expect(result.out).toContain('aucun run GitHub prétendu');
    expect(result.out).toMatch(/act : (disponible|absent)/);
    expect(result.out).toContain('job quality');
  });

  it('fails on a malformed YAML copy and names the file (CA-4)', () => {
    const dir = fixture();
    editWorkflow(dir, 'ci.yml', (text) => `${text}\nbroken: [unclosed\n`);
    const result = runCheck(dir);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('YAML invalide');
  });

  it('fails when ENABLE_SDD_PAGES is 1 in the workflow (CL-3, CA-2)', () => {
    const dir = fixture();
    editWorkflow(dir, 'ci.yml', (text) =>
      text.replace("ENABLE_SDD_PAGES: 'true'", "ENABLE_SDD_PAGES: '1'"),
    );
    const result = runCheck(dir);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("ENABLE_SDD_PAGES: '1' est refusé");
  });

  it('fails on a pnpm script that does not exist (CA-4)', () => {
    const dir = fixture();
    editWorkflow(dir, 'ci.yml', (text) =>
      text.replace('run: pnpm test:int', 'run: pnpm test:absent'),
    );
    const result = runCheck(dir);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('script pnpm inexistant : test:absent');
  });

  it('fails on continue-on-error over a mandatory validation (CA-2)', () => {
    const dir = fixture();
    editWorkflow(dir, 'ci.yml', (text) =>
      text.replace('- run: pnpm lint\n', '- run: pnpm lint\n        continue-on-error: true\n'),
    );
    const result = runCheck(dir);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('continue-on-error est interdit');
  });

  it('fails with an installation instruction when actionlint is unavailable (CL-4)', () => {
    const dir = fixture();
    const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-path-'));
    FIXTURES.push(emptyPath);
    const result = runCheck(dir, { PATH: emptyPath });
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('actionlint est requis');
    expect(result.out).toContain('CL-4');
  });

  it('leaves the repository and its remotes untouched (ET-6)', () => {
    const before = fs.readdirSync(path.join(ROOT, '.github', 'workflows')).sort();
    runCheck(fixture());
    expect(fs.readdirSync(path.join(ROOT, '.github', 'workflows')).sort()).toEqual(before);
    const after = spawnSync('git', ['remote', '-v'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    expect(after).toBe(originalRemotes);
  });
});
