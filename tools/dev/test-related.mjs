#!/usr/bin/env node
// Fast feedback loop: run only the tests related to the files changed since a base revision.
//
// By default the base is `origin/main`; override it with TEST_BASE. Unit tests always run, the
// integration project runs when TEST_INTEGRATION=1. The full suites remain the checkpoint gate.
import { execFileSync } from 'node:child_process';

const base = process.env.TEST_BASE ?? 'origin/main';
const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', base], {
  encoding: 'utf8',
})
  .split('\n')
  .map((file) => file.trim())
  .filter(
    (file) =>
      file !== '' &&
      /\.(?:[cm]?[jt]sx?)$/.test(file) &&
      !file.startsWith('design/') &&
      !file.startsWith('docs/'),
  );

if (files.length === 0) {
  console.log(`Aucun fichier source modifié depuis ${base}.`);
  process.exit(0);
}

const projects = ['--project', 'unit'];
if (process.env.TEST_INTEGRATION === '1') projects.push('--project', 'integration');

console.log(`Tests liés à ${String(files.length)} fichier(s) depuis ${base}.`);
execFileSync('pnpm', ['exec', 'vitest', 'related', '--run', ...projects, ...files], {
  stdio: 'inherit',
});
