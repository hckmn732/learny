// Exécute k6 (binaire local ou image Docker figée) et écrit le résumé (SPEC-804 EF-4, ET-1).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const K6_DIR = path.join(ROOT, 'tools', 'perf', 'k6');
const OUT_DIR = path.join(K6_DIR, 'out');

function hasK6() {
  return spawnSync('k6', ['version'], { encoding: 'utf8' }).status === 0;
}

export function runK6({ formationId, cookie, base = 'http://127.0.0.1:3100' }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = path.join(OUT_DIR, 'summary.json');
  fs.rmSync(summary, { force: true });
  const version = fs
    .readFileSync(path.join(ROOT, 'tools', 'perf', 'k6-version.txt'), 'utf8')
    .trim();

  let result;
  if (hasK6()) {
    result = spawnSync(
      'k6',
      ['run', '--summary-export', summary, path.join(K6_DIR, 'api-load.js')],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, BASE_URL: base, FORMATION_ID: formationId, PERF_COOKIE: cookie },
      },
    );
  } else {
    const dockerArgs = [
      'run',
      '--rm',
      '-i',
      '--add-host=host.docker.internal:host-gateway',
      '-e',
      'BASE_URL=http://host.docker.internal:3100',
      '-e',
      `FORMATION_ID=${formationId}`,
      '-e',
      `PERF_COOKIE=${cookie}`,
      '-v',
      `${K6_DIR}:/scripts`,
      `grafana/k6:${version}`,
      'run',
      '--summary-export=/scripts/out/summary.json',
      '/scripts/api-load.js',
    ];
    result = spawnSync('docker', dockerArgs, { cwd: ROOT, stdio: 'inherit' });
  }

  const available = fs.existsSync(summary);
  const parsed = available ? JSON.parse(fs.readFileSync(summary, 'utf8')) : null;
  return {
    ok: result.status === 0 && available,
    code: result.status,
    summary: parsed,
    path: available ? path.relative(ROOT, summary) : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = runK6({
    formationId: process.env.FORMATION_ID ?? '',
    cookie: process.env.PERF_COOKIE ?? '',
    base: process.env.BASE_URL ?? 'http://127.0.0.1:3100',
  });
  process.exit(out.ok ? 0 : 1);
}
