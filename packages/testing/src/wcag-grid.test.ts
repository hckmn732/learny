import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WCAG22_CRITERIA } from './wcag22';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const GRID = path.join(ROOT, 'docs/accessibility/wcag-2-2-grille.md');

interface Row {
  criterion: string;
  level: string;
  status: string;
  implementation: string;
  tests: string;
}

function parseGrid(): Row[] {
  const text = fs.readFileSync(GRID, 'utf8');
  const rows: Row[] = [];
  for (const line of text.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    if (!/^\d+\.\d+\.\d+$/.test(cells[0] ?? '')) continue;
    rows.push({
      criterion: cells[0] ?? '',
      level: cells[1] ?? '',
      status: cells[2] ?? '',
      implementation: cells[3] ?? '',
      tests: cells[4] ?? '',
    });
  }
  return rows;
}

function referencedPaths(tests: string): string[] {
  return [...tests.matchAll(/`([^`]+\.(?:ts|tsx|mts))`/g)].map((match) => match[1] ?? '');
}

describe('[SPEC-803] grille WCAG 2.2 AA', () => {
  it('couvre exactement les 55 critères A/AA du catalogue', () => {
    const rows = parseGrid();
    expect(rows).toHaveLength(55);
    expect(rows.map((row) => row.criterion)).toEqual(WCAG22_CRITERIA.map((c) => c.id));
  });

  it('déclare 49 critères conformes et 6 non applicables', () => {
    const rows = parseGrid();
    expect(rows.filter((row) => row.status === 'conforme')).toHaveLength(49);
    expect(rows.filter((row) => row.status === 'non applicable')).toHaveLength(6);
    for (const row of rows) expect(['conforme', 'non applicable']).toContain(row.status);
  });

  it('référence au moins un test existant pour chaque critère conforme', () => {
    for (const row of parseGrid().filter((entry) => entry.status === 'conforme')) {
      const paths = referencedPaths(row.tests);
      expect(paths.length, `critère ${row.criterion}`).toBeGreaterThan(0);
      for (const relative of paths) {
        expect(fs.existsSync(path.join(ROOT, relative)), `${row.criterion} : ${relative}`).toBe(
          true,
        );
      }
    }
  });

  it('justifie chaque critère non applicable', () => {
    for (const row of parseGrid().filter((entry) => entry.status === 'non applicable')) {
      expect(row.implementation.length, row.criterion).toBeGreaterThan(20);
    }
  });
});
