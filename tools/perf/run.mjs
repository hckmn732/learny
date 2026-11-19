#!/usr/bin/env node
// Orchestrateur `pnpm test:perf` (SPEC-804 EF-1, ADR-0202) : données, serveur, Lighthouse, INP, k6,
// rapport, arrêt. ADR-0333 : code 0 dès que la mesure est complète (10 pages, 6 scénarios, k6) ;
// un budget dépassé est signalé dans le rapport sans bloquer, sauf avec PERF_STRICT=1.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateLighthouse } from './assert-lighthouse.mjs';
import { buildReport, writeReport, OUT } from './report.mjs';
import { runK6 } from './run-k6.mjs';
import { demoIds } from './urls.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PERF_PORT = 3100;
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const only = onlyArg ? onlyArg.split(',') : null;
const wanted = (step) => only === null || only.includes(step);

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

function capture(cmd, args, env = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  } catch {
    return '';
  }
}

function supabaseEnv() {
  const output = capture('supabase', ['status', '-o', 'env']);
  const values = {};
  for (const line of output.split('\n')) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) values[match[1]] = match[2];
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL ?? 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY ?? '',
    SUPABASE_JWT_SECRET: values.JWT_SECRET ?? '',
  };
}

function prepareData() {
  const clock = { CLOCK_FIXED_AT: '2026-11-11T12:20:00Z' };
  let code = run('pnpm', ['db:reset', '--yes'], clock);
  if (code !== 0) {
    console.error('→ Base locale arrêtée, tentative pnpm dev:up');
    run('pnpm', ['dev:up']);
    code = run('pnpm', ['db:reset', '--yes'], clock);
    if (code !== 0) {
      console.error('✖ Base locale indisponible');
      process.exit(2);
    }
  }
  if (run('pnpm', ['db:seed:demo'], clock) !== 0) process.exit(2);
  if (run('pnpm', ['perf:seed'], clock) !== 0) process.exit(2);
}

function lighthouse(cookie) {
  const ids = demoIds();
  const formation = ids.formationId;
  const anonymous = ['/connexion'];
  const authenticated = [
    '/accueil',
    '/agenda?vue=semaine&date=2026-11-11',
    `/formations/${formation}/programme`,
    `/formations/${formation}/modules/${ids.moduleId}`,
    `/formations/${formation}/modules/${ids.moduleId}/cours?chapitre=${ids.chapterId}`,
    `/formations/${formation}/quiz-global`,
    `/formations/${formation}/carte`,
    `/formations/${formation}/lacunes`,
    '/parametres',
  ];
  const base = `http://127.0.0.1:${String(PERF_PORT)}`;
  const outAnon = path.join(OUT, 'lhci-anon');
  const outAuth = path.join(OUT, 'lhci-auth');
  fs.rmSync(outAnon, { recursive: true, force: true });
  fs.rmSync(outAuth, { recursive: true, force: true });

  const chrome = capture('node', [
    '-e',
    "process.stdout.write(require('@playwright/test').chromium.executablePath())",
  ]).trim();
  for (const [dir, urls, withCookie] of [
    [outAnon, anonymous, false],
    [outAuth, authenticated, true],
  ]) {
    run('pnpm', ['exec', 'lhci', 'autorun', '--config=tools/perf/lighthouserc.cjs'], {
      PERF_URLS: urls.join(','),
      PERF_LHCI_OUT: path.relative(ROOT, dir),
      PERF_BASE_URL: base,
      ...(chrome === '' ? {} : { CHROME_PATH: chrome }),
      ...(withCookie ? { PERF_COOKIE: cookie } : {}),
    });
  }
  const anon = evaluateLighthouse(outAnon);
  const auth = evaluateLighthouse(outAuth);
  return {
    ok: anon.ok && auth.ok,
    anonymous: anon,
    authenticated: auth,
    lcpReport: path.join(outAuth, '..'),
  };
}

function inp() {
  fs.rmSync(path.join(OUT, 'inp.json'), { force: true });
  const code = run(
    'pnpm',
    ['exec', 'playwright', 'test', '-c', 'apps/web/playwright.config.ts', '--project=perf'],
    {
      PW_PERF: '1',
      PLAYWRIGHT_REUSE_SERVER: '1',
      PLAYWRIGHT_PORT: String(PERF_PORT),
      E2E_SKIP_BUILD: '1',
      PERF_SKIP_DB: '1',
    },
  );
  const file = path.join(OUT, 'inp.json');
  const parsed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  return { ok: code === 0 && parsed !== null, code, ...(parsed ?? {}) };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (wanted('seed')) prepareData();
  const env = supabaseEnv();
  const { startServer } = await import('./server.mjs');
  const server = await startServer({
    ...env,
    NODE_ENV: 'production',
    APP_ENV: 'test',
    CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
    // The perf clock is frozen; a production token bucket cannot refill in this benchmark.
    RATE_LIMIT_MODE: 'off',
    LLM_MODE: 'mock',
    EMAIL_MODE: 'memory',
    STRIPE_MODE: 'mock',
    ENABLE_SDD_PAGES: 'false',
    TRUST_PROXY: 'true',
    APP_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
  });
  const results = {};
  try {
    const { demoCookie } = await import('./auth.mjs');
    const cookie = demoCookie();
    results.lighthouse = wanted('lighthouse') ? lighthouse(cookie) : { ok: false, pages: [] };
    results.inp = wanted('inp') ? inp() : { ok: false, scenarios: [] };
    const ids = demoIds();
    const k6 = wanted('k6')
      ? runK6({ formationId: ids.formationId, cookie })
      : { ok: false, summary: null };
    const k6Version = fs
      .readFileSync(path.join(ROOT, 'tools', 'perf', 'k6-version.txt'), 'utf8')
      .trim();
    const report = buildReport({ ...results, k6, k6Version });
    const files = writeReport(report);
    fs.mkdirSync(path.join(ROOT, 'evidence', 'SPEC-804'), { recursive: true });
    fs.copyFileSync(files.json, path.join(ROOT, 'evidence', 'SPEC-804', 'perf-report.json'));
    fs.copyFileSync(files.md, path.join(ROOT, 'evidence', 'SPEC-804', 'perf-report.md'));
    const k6Summary = path.join(ROOT, 'tools', 'perf', 'k6', 'out', 'summary.json');
    if (fs.existsSync(k6Summary)) {
      fs.copyFileSync(k6Summary, path.join(ROOT, 'evidence', 'SPEC-804', 'k6-summary.json'));
    }
    console.log(`\nRapport : ${path.relative(ROOT, files.md)}`);
    const ok =
      (!wanted('lighthouse') || report.lighthouse.ok) &&
      (!wanted('inp') || report.inp.ok) &&
      (!wanted('k6') || report.k6.ok);
    const complete =
      (!wanted('lighthouse') || (report.lighthouse.pages?.length ?? 0) > 0) &&
      (!wanted('inp') ||
        ((report.inp.scenarios?.length ?? 0) === 6 &&
          report.inp.scenarios.every(
            (scenario) => scenario.values?.length === 5 && scenario.p75 !== null,
          ))) &&
      (!wanted('k6') || report.k6.p95 !== null);
    if (ok) console.log('✔ budgets tenus');
    else console.log('⚠ budget dépassé (non bloquant, ADR-0333) : voir le rapport');
    if (!complete) console.log('✖ mesure incomplète');
    const strict = process.env.PERF_STRICT === '1';
    process.exitCode = complete && (ok || !strict) ? 0 : 1;
  } finally {
    await server.stop();
  }
}

await main();
