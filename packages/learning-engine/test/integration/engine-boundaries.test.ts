import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SRC = path.join(ROOT, 'packages/learning-engine/src');
const PROBE = path.join(SRC, '__probe__.ts');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('[SPEC-401] frontières du moteur', () => {
  let eslint: ESLint;

  beforeAll(() => {
    eslint = new ESLint({ cwd: ROOT });
    fs.writeFileSync(
      PROBE,
      [
        "import '../../db/src/index';",
        "import '@learny/db';",
        '',
        'export const probe = true;',
        '',
      ].join('\n'),
      'utf8',
    );
  });

  afterAll(() => {
    fs.rmSync(PROBE, { force: true });
  });

  it('interdit un import de paquet extérieur dans src (CA-5)', async () => {
    const [result] = await eslint.lintFiles([PROBE]);
    const errors = result?.messages.filter((message) => message.severity === 2) ?? [];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((message) => message.ruleId === 'import/no-restricted-paths')).toBe(true);
    expect(errors.some((message) => message.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('accepte le point d’entrée réel sans erreur (CA-5)', async () => {
    const [result] = await eslint.lintFiles([path.join(SRC, 'index.ts')]);
    const errors = result?.messages.filter((message) => message.severity === 2) ?? [];
    expect(errors).toEqual([]);
  });

  it('ne lit ni l’horloge, ni le réseau, ni l’environnement (EF-3)', () => {
    const files = sourceFiles(SRC).filter((file) => file !== PROBE && file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toContain('Date.now(');
      expect(source, file).not.toContain('fetch(');
      expect(source, file).not.toContain('process.env');
    }
  });
});
