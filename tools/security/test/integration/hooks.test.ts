import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const BIN = path.join(ROOT, 'node_modules', '.bin');
const CHECK_SECRETS = path.join(ROOT, 'tools', 'security', 'check-secrets.ts');

// Fake key assembled at runtime: this file never holds a secret-like literal.
const FAKE_KEY = ['sk-ant-', 'api03-', 'Z'.repeat(30)].join('');

function run(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '' } });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

let repo: string;

function git(...args: string[]) {
  return run('git', args, repo);
}

function checkSecrets() {
  return run(path.join(BIN, 'tsx'), [CHECK_SECRETS, '--staged'], repo);
}

function resetIndex() {
  git('reset', '-q');
}

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-hooks-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Learny SDD Agent');
  git('config', 'user.email', 'sdd-agent@learny.invalid');
  git('config', 'commit.gpgsign', 'false');

  // Copy of the real .husky/ where `pnpm exec` runs the real repository binaries.
  const hooks = path.join(repo, '.hooks');
  fs.cpSync(path.join(ROOT, '.husky'), hooks, { recursive: true });
  const replacements: Record<string, string> = {
    'commit-msg': `${path.join(BIN, 'commitlint')} --config ${path.join(ROOT, 'commitlint.config.ts')} --edit "$1"\n`,
    'pre-commit': `${path.join(BIN, 'tsx')} ${CHECK_SECRETS} --staged\n`,
  };
  for (const [hook, body] of Object.entries(replacements)) {
    const original = fs.readFileSync(path.join(ROOT, '.husky', hook), 'utf8');
    expect(original).toContain('pnpm exec');
    fs.writeFileSync(path.join(hooks, hook), body);
  }
  git('config', 'core.hooksPath', path.join(hooks, '_'));
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('[SPEC-002] git hooks', () => {
  it('refuses a non-conventional commit and accepts a conventional one (CA-2)', () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    git('add', 'a.txt');

    const refused = git('commit', '-m', 'feat: ajoute X');
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('scope-empty');

    const accepted = git('commit', '-m', 'feat(SPEC-002): ajoute X');
    expect(accepted.code, accepted.out).toBe(0);
    expect(git('log', '--format=%s').out.trim()).toBe('feat(SPEC-002): ajoute X');
  });

  it('refuses a staged secret and masks it (CA-3)', () => {
    fs.writeFileSync(path.join(repo, 'config.ts'), `export const key = '${FAKE_KEY}';\n`);
    git('add', 'config.ts');
    const r = checkSecrets();
    expect(r.code).toBe(1);
    expect(r.out).toContain('config.ts:1 anthropic-key sk-a…');
    expect(r.out).toContain('Commit refusé : secret détecté.');
    expect(r.out).not.toContain(FAKE_KEY);
    resetIndex();
    fs.rmSync(path.join(repo, 'config.ts'));
  });

  it('refuses a staged .env file even when empty (CA-3, CL-4)', () => {
    fs.writeFileSync(path.join(repo, '.env'), '');
    git('add', '-f', '.env');
    expect(checkSecrets().code).toBe(1);
    resetIndex();
    fs.rmSync(path.join(repo, '.env'));
  });

  it('accepts a value holding the learny-test-only marker (CA-3)', () => {
    fs.writeFileSync(
      path.join(repo, 'fixture.ts'),
      "export const k = 'sk-ant-learny-test-only-0000000000000000';\n",
    );
    git('add', 'fixture.ts');
    const r = checkSecrets();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('Aucun secret détecté.');
    resetIndex();
  });

  it('skips the content of deletions (CL-7)', () => {
    git('rm', '-q', 'a.txt');
    expect(checkSecrets().code).toBe(0);
    resetIndex();
  });

  it('activates the hooks in the real repository (CA-4)', () => {
    expect(run('git', ['config', 'core.hooksPath'], ROOT).out.trim()).toBe('.husky/_');
    const read = (hook: string) => fs.readFileSync(path.join(ROOT, '.husky', hook), 'utf8');
    expect(read('pre-commit')).toBe(
      'pnpm exec lint-staged\npnpm exec tsx tools/security/check-secrets.ts --staged\n',
    );
    expect(read('commit-msg')).toBe('pnpm exec commitlint --edit "$1"\n');
    expect(read('pre-push')).toBe('pnpm -s typecheck && pnpm -s test:unit\n');
  });
});
