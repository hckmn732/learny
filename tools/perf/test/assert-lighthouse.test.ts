import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface PageResult {
  metrics: { lcp: { p75: number } };
  runs: number;
  reasons: string[];
}
interface LhResult {
  ok: boolean;
  pages: PageResult[];
}

import { evaluateLighthouse } from '../assert-lighthouse.mjs';

function lhr(url: string, overrides: Record<string, number> = {}, finalUrl = url) {
  const metrics = {
    'largest-contentful-paint': 1800,
    'cumulative-layout-shift': 0.02,
    'total-blocking-time': 120,
    ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, value])),
  };
  return {
    requestedUrl: url,
    finalDisplayedUrl: finalUrl,
    categories: { performance: { score: 0.95 } },
    audits: {
      'largest-contentful-paint': { numericValue: metrics['largest-contentful-paint'] },
      'cumulative-layout-shift': { numericValue: metrics['cumulative-layout-shift'] },
      'total-blocking-time': { numericValue: metrics['total-blocking-time'] },
      'resource-summary': {
        details: {
          items: [
            { resourceType: 'script', transferSize: 150_000, requestCount: 10 },
            { resourceType: 'stylesheet', transferSize: 20_000, requestCount: 1 },
            { resourceType: 'font', transferSize: 80_000, requestCount: 2 },
            { resourceType: 'image', transferSize: 100_000, requestCount: 3 },
            { resourceType: 'total', transferSize: 350_000, requestCount: 20 },
          ],
        },
      },
    },
  };
}

function dirWith(
  reports: unknown[],
  name = (index: number) => `lhr-${String(index)}.json`,
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-lhci-'));
  reports.forEach((report, index) => {
    fs.writeFileSync(path.join(dir, name(index)), JSON.stringify(report));
  });
  return dir;
}

describe('[SPEC-804] assert-lighthouse', () => {
  it('calcule le p75 de 5 passages et accepte une page conforme', () => {
    const dir = dirWith(Array.from({ length: 5 }, () => lhr('http://127.0.0.1:3100/accueil')));
    const result = evaluateLighthouse(dir) as unknown as LhResult;
    expect(result.ok).toBe(true);
    expect(result.pages[0]?.metrics.lcp.p75).toBe(1800);
    expect(result.pages[0]?.runs).toBe(5);
  });

  it('détecte un dépassement de LCP au p75', () => {
    const reports = [
      lhr('http://127.0.0.1:3100/accueil', { 'largest-contentful-paint': 2600 }),
      lhr('http://127.0.0.1:3100/accueil', { 'largest-contentful-paint': 2600 }),
      lhr('http://127.0.0.1:3100/accueil', { 'largest-contentful-paint': 2600 }),
      lhr('http://127.0.0.1:3100/accueil', { 'largest-contentful-paint': 2600 }),
      lhr('http://127.0.0.1:3100/accueil', { 'largest-contentful-paint': 1000 }),
    ];
    const result = evaluateLighthouse(dirWith(reports)) as unknown as LhResult;
    expect(result.ok).toBe(false);
    expect(result.pages[0]?.reasons.join(' ')).toContain('LCP');
  });

  it('lit aussi les rapports `*.report.json` écrits par l’upload filesystem de LHCI', () => {
    const dir = dirWith(
      Array.from({ length: 5 }, () => lhr('http://127.0.0.1:3100/accueil')),
      (index) => `127_0_0_1-accueil-2026_11_17_08_2${String(index)}_00.report.json`,
    );
    const result = evaluateLighthouse(dir) as unknown as LhResult;
    expect(result.ok).toBe(true);
    expect(result.pages[0]?.runs).toBe(5);
  });

  it('détecte un budget JavaScript dépassé et une session perdue', () => {
    const report = lhr('http://127.0.0.1:3100/parametres', {}, 'http://127.0.0.1:3100/connexion');
    report.audits['resource-summary'].details.items[0] = {
      resourceType: 'script',
      transferSize: 250_000,
      requestCount: 10,
    };
    const result = evaluateLighthouse(dirWith([report])) as unknown as LhResult;
    expect(result.ok).toBe(false);
    const reasons = result.pages[0]?.reasons.join(' ') ?? '';
    expect(reasons).toContain('session perdue');
    expect(reasons).toContain('JS');
  });
});
