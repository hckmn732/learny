// SPEC-805 CA-5, EF-8 — the ASVS level 1 grid is complete and every verified control links to a
// real file of the repository. The check runs in the normal unit suite, so a broken link fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const GRID = path.join(ROOT, 'docs/security/asvs-v1-l1.md');

interface Row {
  reference: string;
  control: string;
  status: string;
  evidence: string;
}

function rows(): Row[] {
  const text = fs.readFileSync(GRID, 'utf8');
  const result: Row[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('| V')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    const [reference, control, status, evidence] = cells;
    if (
      reference === undefined ||
      control === undefined ||
      status === undefined ||
      evidence === undefined
    ) {
      continue;
    }
    result.push({ reference, control, status, evidence });
  }
  return result;
}

function links(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined && !value.startsWith('http'));
}

describe('[SPEC-805] grille ASVS', () => {
  it('CA-5 — chaque contrôle est classé et aucun applicable ne reste non vérifié', () => {
    const inventory = rows();
    expect(inventory.length).toBeGreaterThanOrEqual(30);
    for (const row of inventory) {
      expect(row.reference, row.control).toMatch(/^V\d+\.\d+\.\d+$/);
      expect(['Vérifié', 'Non applicable']).toContain(row.status);
    }
    expect(inventory.filter((row) => row.status === 'Non applicable').length).toBeGreaterThan(0);
  });

  it('CA-5 — chaque contrôle vérifié pointe vers une preuve existante', () => {
    for (const row of rows().filter((item) => item.status === 'Vérifié')) {
      const targets = links(row.evidence);
      expect(targets.length, `${row.reference} sans lien`).toBeGreaterThan(0);
      for (const target of targets) {
        const resolved = path.resolve(path.dirname(GRID), target);
        expect(fs.existsSync(resolved), `${row.reference} → ${target}`).toBe(true);
      }
    }
  });

  it('CA-5 — les non-applicables sont justifiés', () => {
    for (const row of rows().filter((item) => item.status === 'Non applicable')) {
      expect(row.evidence.length, row.reference).toBeGreaterThan(20);
      expect(links(row.evidence)).toHaveLength(0);
    }
  });
});
