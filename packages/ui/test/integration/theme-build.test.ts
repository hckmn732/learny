import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { compile } from '@tailwindcss/node';
import { describe, expect, it } from 'vitest';

import { buildThemeCss } from '../../scripts/build-theme';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const UI_ROOT = path.join(ROOT, 'packages', 'ui');
const THEME_FILE = path.join(UI_ROOT, 'src', 'styles', 'theme.css');

const CANDIDATES = [
  'bg-lime',
  'p-14',
  'rounded-24',
  'text-34',
  'bg-red-500',
  'text-sm',
  'leading-1.1',
  'font-600',
  'tracking-title',
  'text-11.5',
];

describe('[SPEC-301] thème Tailwind', () => {
  it('le theme.css commité est identique à la sortie du générateur', () => {
    expect(fs.existsSync(THEME_FILE), 'theme.css absent').toBe(true);
    expect(fs.readFileSync(THEME_FILE, 'utf8')).toBe(buildThemeCss());
  });

  it('compile les jetons et ne génère aucune classe hors jetons (CL-3)', async () => {
    const theme = fs.readFileSync(THEME_FILE, 'utf8');
    const compiler = await compile(`@import 'tailwindcss';\n${theme}\n`, {
      base: UI_ROOT,
      onDependency() {
        // No imported source file needs watching in this test.
      },
    });
    const css = compiler.build(CANDIDATES);

    expect(css).toContain('background-color: var(--color-lime)');
    expect(css).toContain('padding: calc(var(--spacing) * 14)');
    expect(css).toContain('border-radius: var(--radius-24)');
    expect(css).toContain('font-size: var(--text-34)');
    expect(css).toContain('line-height: var(--leading-1\\.1)');
    expect(css).toContain('--tw-font-weight: var(--font-weight-600)');
    expect(css).toContain('letter-spacing: var(--tracking-title)');
    expect(css).toContain('font-size: var(--text-11\\.5)');
    expect(css).not.toContain('red-500');
    expect(css).not.toMatch(/\.text-sm\b/);
  });

  it('ne contient ni zoom ni thème sombre et reste léger (EF-10, CL-7, ET-8)', () => {
    const theme = fs.readFileSync(THEME_FILE, 'utf8');
    const globals = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'app', 'globals.css'), 'utf8');
    expect(`${theme}\n${globals}`).not.toMatch(/\bzoom\s*:/);
    expect(globals).toContain('font-size: 90%');
    expect(globals).toContain('color-scheme: light');
    expect(globals).not.toContain('prefers-color-scheme');
    expect(gzipSync(Buffer.from(theme, 'utf8')).byteLength).toBeLessThan(12 * 1024);
  });
});
