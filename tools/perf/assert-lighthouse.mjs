// Lecture des rapports Lighthouse, calcul des p75 et comparaison aux budgets (SPEC-804 EF-2, CL-6).
import fs from 'node:fs';
import path from 'node:path';

// Même calcul que p75.ts (le script d'outillage reste exécutable par Node sans transpileur).
function percentileNearestRank(values, fraction) {
  if (values.length === 0) throw new Error('aucune valeur');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1];
}

export const PAGE_BUDGETS = {
  lcp: 2500,
  cls: 0.1,
  tbt: 300,
  score: 85,
  js: 200 * 1024,
  jsAnonymous: 130 * 1024,
  css: 50 * 1024,
  fontsBytes: 120 * 1024,
  fontsCount: 2,
  images: 300 * 1024,
  requests: 60,
};

export function readLhr(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^lhr-.*\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function metricsOf(lhr) {
  const audit = (id) => lhr.audits?.[id]?.numericValue ?? 0;
  return {
    lcp: audit('largest-contentful-paint'),
    cls: audit('cumulative-layout-shift'),
    tbt: audit('total-blocking-time'),
    score: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
  };
}

function resourcesOf(lhr) {
  const items = lhr.audits?.['resource-summary']?.details?.items ?? [];
  const byType = (type) => items.find((item) => item.resourceType === type) ?? {};
  return {
    js: Number(byType('script').transferSize ?? 0),
    css: Number(byType('stylesheet').transferSize ?? 0),
    fontsBytes: Number(byType('font').transferSize ?? 0),
    fontsCount: Number(byType('font').requestCount ?? 0),
    images: Number(byType('image').transferSize ?? 0),
    requests: Number(byType('total').requestCount ?? 0),
  };
}

function isAnonymous(url) {
  return new URL(url).pathname.startsWith('/connexion');
}

function p75(values) {
  return percentileNearestRank(values, 0.75);
}

export function evaluateLighthouse(dir, budgets = PAGE_BUDGETS) {
  const reports = readLhr(dir);
  const byUrl = new Map();
  for (const lhr of reports) {
    const url = lhr.requestedUrl ?? lhr.finalDisplayedUrl;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(lhr);
  }
  const pages = [];
  for (const [url, runs] of byUrl) {
    const reasons = [];
    if (!isAnonymous(url)) {
      const lost = runs.some((lhr) => (lhr.finalDisplayedUrl ?? '').includes('/connexion'));
      if (lost) reasons.push('session perdue (redirection vers /connexion)');
    }
    const metrics = {};
    for (const key of ['lcp', 'cls', 'tbt', 'score']) {
      const values = runs.map((lhr) => metricsOf(lhr)[key]);
      const value = p75(values);
      metrics[key] = { values, p75: value };
    }
    const resources = resourcesOf(runs[runs.length - 1]);
    const jsBudget = isAnonymous(url) ? budgets.jsAnonymous : budgets.js;
    if (metrics.lcp.p75 >= budgets.lcp)
      reasons.push(`LCP p75 ${metrics.lcp.p75} ms ≥ ${budgets.lcp}`);
    if (metrics.cls.p75 >= budgets.cls) reasons.push(`CLS p75 ${metrics.cls.p75} ≥ ${budgets.cls}`);
    if (metrics.tbt.p75 >= budgets.tbt)
      reasons.push(`TBT p75 ${metrics.tbt.p75} ms ≥ ${budgets.tbt}`);
    if (metrics.score.p75 < budgets.score)
      reasons.push(`score ${metrics.score.p75} < ${budgets.score}`);
    if (resources.js > jsBudget) reasons.push(`JS ${resources.js} > ${jsBudget}`);
    if (resources.css > budgets.css) reasons.push(`CSS ${resources.css} > ${budgets.css}`);
    if (resources.fontsCount > budgets.fontsCount)
      reasons.push(`polices ${resources.fontsCount} > ${budgets.fontsCount}`);
    if (resources.fontsBytes > budgets.fontsBytes)
      reasons.push(`polices ${resources.fontsBytes} octets > ${budgets.fontsBytes}`);
    if (resources.images > budgets.images)
      reasons.push(`images ${resources.images} > ${budgets.images}`);
    if (resources.requests > budgets.requests)
      reasons.push(`requêtes ${resources.requests} > ${budgets.requests}`);
    pages.push({ url, runs: runs.length, metrics, resources, ok: reasons.length === 0, reasons });
  }
  return { pages, ok: pages.length > 0 && pages.every((page) => page.ok) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'test-results/perf/lhci';
  const result = evaluateLighthouse(dir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
