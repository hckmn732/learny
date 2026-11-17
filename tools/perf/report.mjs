// Rapport de performances `test-results/perf/report.{json,md}` (SPEC-804 EF-5).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = path.join(ROOT, 'test-results', 'perf');

function commit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'inconnu';
  }
}

function environment(k6Version) {
  return {
    node: process.version,
    chromium: process.env.CHROMIUM_VERSION ?? 'Playwright Chromium',
    k6: k6Version,
    cpu: os.cpus()[0]?.model ?? 'inconnu',
    cores: os.cpus().length,
    memoryBytes: os.totalmem(),
    platform: process.platform,
  };
}

export function buildReport({ lighthouse, inp, k6, k6Version = 'inconnu' }) {
  const pages = [
    ...(lighthouse?.anonymous?.pages ?? []),
    ...(lighthouse?.authenticated?.pages ?? []),
  ];
  const scenarios = inp?.scenarios ?? [];
  const k6Metrics = k6?.summary?.metrics ?? {};
  const routes = Object.entries(k6Metrics)
    .filter(([name]) => name.startsWith('route_'))
    .map(([name, metric]) => ({
      name,
      p50: metric.values?.['p(50)'] ?? metric.p50 ?? null,
      p95: metric.values?.['p(95)'] ?? metric.p95 ?? null,
      p99: metric.values?.['p(99)'] ?? metric.p99 ?? null,
      ok: (metric.values?.['p(95)'] ?? Infinity) < 300,
    }));
  const httpDuration = k6Metrics.http_req_duration ?? {};
  const failed = k6Metrics.http_req_failed ?? {};
  const notFound = k6Metrics.status_429 ?? {};
  return {
    generatedAt: process.env.CLOCK_FIXED_AT ?? '2026-11-11T12:20:00Z',
    commit: commit(),
    environment: environment(k6Version),
    lighthouse: { ok: lighthouse?.ok ?? false, pages },
    inp: { ok: inp?.ok ?? false, scenarios },
    k6: {
      ok: k6?.ok ?? false,
      p50: httpDuration.values?.['p(50)'] ?? httpDuration.p50 ?? null,
      p95: httpDuration.values?.['p(95)'] ?? httpDuration.p95 ?? null,
      p99: httpDuration.values?.['p(99)'] ?? httpDuration.p99 ?? null,
      failureRate: failed.values?.rate ?? failed.rate ?? null,
      status429: notFound.count ?? notFound.values?.count ?? 0,
      routes,
    },
  };
}

export function writeReport(report) {
  fs.mkdirSync(OUT, { recursive: true });
  const json = path.join(OUT, 'report.json');
  fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    '# Rapport de performances',
    '',
    `- Date : ${report.generatedAt}`,
    `- Commit : ${report.commit}`,
    `- Environnement : Node ${report.environment.node}, k6 ${report.environment.k6}, CPU ${report.environment.cpu} ×${String(report.environment.cores)}`,
    '',
    '## Lighthouse (p75 de 5 passages, profil mobile)',
    '',
    '| Page | LCP p75 (ms) | CLS p75 | TBT p75 (ms) | Score | JS (Ko) | CSS (Ko) | Polices | Images (Ko) | Requêtes | Statut |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...report.lighthouse.pages.map((page) => {
      const m = page.metrics;
      const r = page.resources;
      return `| ${new URL(page.url).pathname} | ${String(Math.round(m.lcp.p75))} | ${String(m.cls.p75)} | ${String(Math.round(m.tbt.p75))} | ${String(m.score.p75)} | ${String(Math.round(r.js / 1024))} | ${String(Math.round(r.css / 1024))} | ${String(r.fontsCount)} | ${String(Math.round(r.images / 1024))} | ${String(r.requests)} | ${page.ok ? 'ok' : 'ko'} |`;
    }),
    '',
    '## INP (p75 de 5 passages)',
    '',
    '| Scénario | p75 (ms) | Statut |',
    '|---|---|---|',
    ...report.inp.scenarios.map(
      (scenario) =>
        `| ${scenario.name} | ${scenario.p75 === null ? '—' : String(Math.round(scenario.p75))} | ${scenario.ok ? 'ok' : 'ko'} |`,
    ),
    '',
    '## k6 (50 utilisateurs virtuels)',
    '',
    `- p50 ${String(report.k6.p50 ?? '—')} ms, p95 ${String(report.k6.p95 ?? '—')} ms, p99 ${String(report.k6.p99 ?? '—')} ms`,
    `- Échecs : ${report.k6.failureRate === null ? '—' : String(report.k6.failureRate)} ; 429 : ${String(report.k6.status429)}`,
    '',
    '| Route | p50 (ms) | p95 (ms) | p99 (ms) | Statut |',
    '|---|---|---|---|---|',
    ...report.k6.routes.map(
      (route) =>
        `| ${route.name} | ${String(route.p50 ?? '—')} | ${String(route.p95 ?? '—')} | ${String(route.p99 ?? '—')} | ${route.ok ? 'ok' : 'ko'} |`,
    ),
    '',
  ];
  const md = path.join(OUT, 'report.md');
  fs.writeFileSync(md, lines.join('\n'));
  return { json, md };
}

export { OUT };
