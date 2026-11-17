import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { breakpoints, breakpointsRem } from './breakpoints';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const SOURCES = ['apps/web', 'packages/ui/src', 'packages/bricks/src'];
const EXCLUDED = [
  'components/sdd-demos',
  'app/%5Fdev',
  'src/styles/theme.css',
  'src/tokens/breakpoints.test.ts',
  'src/tokens/breakpoints.ts',
];

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).replaceAll('\\', '/');
      if (EXCLUDED.some((excluded) => rel.includes(excluded))) continue;
      if (entry.isDirectory()) {
        if (['node_modules', '.next', 'dist', 'coverage'].includes(entry.name)) continue;
        walk(full);
      } else if (/\.(tsx?|css)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  for (const source of SOURCES) walk(path.join(ROOT, source));
  return files;
}

describe('[SPEC-802] points de rupture', () => {
  it('déclare uniquement sm, nav, lg, xl et 2xl (ET-1)', () => {
    expect(breakpoints).toEqual({ sm: 768, nav: 900, lg: 1024, xl: 1280, '2xl': 1440 });
    expect(breakpointsRem).toEqual({ sm: 48, nav: 56.25, lg: 64, xl: 80, '2xl': 90 });
    const theme = fs.readFileSync(path.join(ROOT, 'packages/ui/src/styles/theme.css'), 'utf8');
    for (const [name, rem] of Object.entries(breakpointsRem)) {
      expect(theme, name).toContain(`--breakpoint-${name}: ${String(rem)}rem;`);
    }
    expect(theme).toContain('--breakpoint-*: initial;');
  });

  it('interdit tout autre point de rupture dans les sources (ET-1)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (/(?:min|max)-\[[0-9.]+(?:px|rem)\]/.test(line)) {
          offenders.push(`${rel}:${String(index + 1)} valeur arbitraire`);
        }
        if (/@media\s*\([^)]*(?:min|max)-width/.test(line)) {
          offenders.push(`${rel}:${String(index + 1)} requête média codée en dur`);
        }
        if (/\bmd:[a-z[]/.test(line)) {
          offenders.push(`${rel}:${String(index + 1)} point de rupture md`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
