// URLs mesurées par Lighthouse (SPEC-804 EF-2, ADR-0202). Les identifiants du jeu de
// démonstration sont déterministes : un petit script tsx les expose sans dépendre de la base.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

let cached;
export function demoIds() {
  if (cached !== undefined) return cached;
  const out = execFileSync('pnpm', ['exec', 'tsx', path.join('tools', 'perf', 'demo-ids.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  cached = JSON.parse(out);
  return cached;
}

export function resolveUrls() {
  const { formationId, moduleId, chapterId } = demoIds();
  return {
    anonymous: ['/connexion'],
    authenticated: [
      '/accueil',
      '/agenda?vue=semaine&date=2026-11-11',
      `/formations/${formationId}/programme`,
      `/formations/${formationId}/modules/${moduleId}`,
      `/formations/${formationId}/modules/${moduleId}/cours?chapitre=${chapterId}`,
      `/formations/${formationId}/quiz-global`,
      `/formations/${formationId}/carte`,
      `/formations/${formationId}/lacunes`,
      '/parametres',
    ],
  };
}

export function allPaths() {
  const { anonymous, authenticated } = resolveUrls();
  return [...anonymous, ...authenticated];
}

if (process.argv.includes('--json')) {
  const { anonymous, authenticated } = resolveUrls();
  process.stdout.write(JSON.stringify({ anonymous, authenticated }));
}
