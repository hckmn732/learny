// Architecture boundaries of SPEC-504 CA-6 / BR-IA-09: no provider SDK and no hard-coded model
// identifier outside packages/llm; learning-engine and bricks cannot import @learny/llm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PACKAGES = path.join(ROOT, 'packages');
const PROVIDERS = [
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@ai-sdk/mistral',
  '@ai-sdk/deepseek',
  '@ai-sdk/openai-compatible',
  "from 'ai'",
  'from "ai"',
];

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function readFiles(dir: string): { path: string; content: string }[] {
  return sourceFiles(dir).map((file) => ({
    path: path.relative(ROOT, file),
    content: fs.readFileSync(file, 'utf8'),
  }));
}

describe('[SPEC-504] frontières des fournisseurs', () => {
  it('CA-6 — aucun paquet hors llm n’importe un SDK de fournisseur ni le module ai', () => {
    const offenders: string[] = [];
    for (const pkg of fs.readdirSync(PACKAGES, { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === 'llm') continue;
      for (const file of readFiles(path.join(PACKAGES, pkg.name, 'src'))) {
        if (PROVIDERS.some((pattern) => file.content.includes(pattern))) {
          offenders.push(file.path);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('CA-6 — aucun identifiant claude- en dur hors de @learny/config et de llm', () => {
    const offenders: string[] = [];
    for (const pkg of fs.readdirSync(PACKAGES, { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === 'llm' || pkg.name === 'config') continue;
      for (const file of readFiles(path.join(PACKAGES, pkg.name))) {
        // Seed and demo fixtures of SPEC-110 predate the centralised catalogue; product code is
        // covered below and by the ESLint rule.
        if (file.path.includes('/seed/')) continue;
        if (/\bclaude-[a-z0-9-]+\b/.test(file.content)) offenders.push(file.path);
      }
    }
    for (const app of ['apps/web', 'apps/worker']) {
      for (const file of readFiles(path.join(ROOT, app))) {
        // `_dev` pages of earlier specifications display historical identifiers; they are not
        // reachable in production (ADR-0049).
        if (
          file.path.includes('/_dev/') ||
          file.path.includes('%5Fdev') ||
          file.path.includes('/e2e/')
        ) {
          continue;
        }
        if (/\bclaude-[a-z0-9-]+\b/.test(file.content) && !file.path.includes('__tests__')) {
          offenders.push(file.path);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('CA-6 — learning-engine et bricks n’importent pas @learny/llm', () => {
    for (const pkg of ['learning-engine', 'bricks']) {
      const imports = readFiles(path.join(PACKAGES, pkg)).filter((file) =>
        file.content.includes('@learny/llm'),
      );
      expect(imports.map((file) => file.path)).toEqual([]);
    }
  });
});
