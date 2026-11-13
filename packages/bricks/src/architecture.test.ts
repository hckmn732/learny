import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AUTO_GRADED_TYPES } from './grade-types';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') return [];
      return walk(full);
    }
    return [full];
  });
}

function correctionFiles(): string[] {
  return walk(SRC).filter((file) => {
    const relative = path.relative(SRC, file).split(path.sep).join('/');
    return (
      relative === 'grade.ts' ||
      relative === 'grade-support.ts' ||
      relative.endsWith('/grade.ts') ||
      relative.endsWith('/response.ts') ||
      relative === 'types/instruction/table-checks.ts' ||
      relative === 'types/scoring/compute.ts' ||
      relative === 'types/timer/state.ts'
    );
  });
}

const FORBIDDEN = [
  /from\s+['"]ai(?:\/[^'"]*)?['"]/u,
  /from\s+['"]@ai-sdk\/[^'"]+['"]/u,
  /from\s+['"]@learny\/llm(?:\/[^'"]*)?['"]/u,
  /from\s+['"]@learny\/tutor(?:\/|['"])/u,
  /from\s+['"]@learny\/db(?:\/|['"])/u,
  /from\s+['"]node:/u,
  /\bfetch\s*\(/u,
  /Math\.random\s*\(/u,
  /Date\.now\s*\(/u,
  /new\s+Date\s*\(\s*\)/u,
];

describe('[SPEC-502] architecture de la correction', () => {
  it('n’importe aucun SDK d’IA ni aucune I/O dans les fichiers de correction (CA-7)', () => {
    const files = correctionFiles();
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const relative = path.relative(SRC, file);
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${relative} contient ${String(pattern)}`).toBe(false);
      }
    }
  });

  it('fournit un module de correction par type auto-corrigé (BR-BRI-08)', () => {
    for (const type of AUTO_GRADED_TYPES) {
      const file = path.join(SRC, 'types', type.replaceAll('_', '-'), 'grade.ts');
      expect(readFileSync(file, 'utf8')).toContain('export function grade');
    }
  });
});
