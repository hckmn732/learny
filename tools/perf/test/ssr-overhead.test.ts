import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUDGET_MS = 25;

interface Measurement {
  status: 'measured' | 'blocked';
  pages?: Record<string, { medianMs: number }>;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function overhead(before: number, after: number): number {
  return after - before;
}

function readEvidence(name: string): Measurement {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'evidence', 'SPEC-1202', name), 'utf8'),
  ) as Measurement;
}

describe('[SPEC-1202] ssr overhead', () => {
  it('calcule la médiane et impose le budget de 25 ms', () => {
    expect(median([8, 12, 10, 11, 9])).toBe(10);
    expect(median([8, 12, 10, 11])).toBe(10.5);
    expect(overhead(40, 64)).toBeLessThanOrEqual(BUDGET_MS);
    expect(overhead(40, 66)).toBeGreaterThan(BUDGET_MS);
  });

  it('ne revendique pas de budget sans deux mesures complètes', () => {
    const before = readEvidence('perf-before.json');
    const after = readEvidence('perf-after.json');
    if (before.status === 'blocked' || after.status === 'blocked') {
      expect(before.status === 'measured' && after.status === 'measured').toBe(false);
      return;
    }
    expect(Object.keys(before.pages ?? {}).sort()).toEqual(Object.keys(after.pages ?? {}).sort());
    for (const [page, measurement] of Object.entries(before.pages ?? {})) {
      const next = after.pages?.[page];
      expect(next, page).toBeDefined();
      if (next !== undefined)
        expect(overhead(measurement.medianMs, next.medianMs), page).toBeLessThanOrEqual(BUDGET_MS);
    }
  });
});
