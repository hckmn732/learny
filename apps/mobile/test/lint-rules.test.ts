// Vitest (Node) — SPEC-3002 CA-5, ET-1: a colour literal outside `src/theme` fails the lint.
//
// The proof runs the real ESLint configuration on a real file: the typed-linting project service
// refuses a virtual path, so the probe is written, linted and removed in the same test.
import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const eslint = new ESLint({ cwd: ROOT });
const PROBE = "export const probe = { color: '#FF0000' };\n";

const probes = new Set<string>();

/** Writes the probe at `relative`, lints it and returns the colour errors it produced. */
async function colourErrors(relative: string): Promise<readonly string[]> {
  const file = path.join(ROOT, relative);
  writeFileSync(file, PROBE);
  probes.add(file);
  const results = await eslint.lintFiles([file]);
  const result = results[0];
  if (result === undefined) throw new Error(`ESLint n'a rien renvoyé pour ${relative}`);
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

afterEach(() => {
  for (const file of probes) {
    try {
      unlinkSync(file);
    } catch {
      // Already removed by the test itself.
    }
  }
  probes.clear();
});

describe('[SPEC-3002] règles ESLint des jetons', () => {
  it('refuse un littéral de couleur dans src/features (CA-5)', async () => {
    const messages = await colourErrors('apps/mobile/src/features/__lint_probe__.ts');
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain('Couleur hors du thème');
  });

  it('refuse un littéral de couleur dans app/', async () => {
    const messages = await colourErrors('apps/mobile/app/__lint_probe__.tsx');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('autorise le thème, seul endroit où une couleur est écrite', async () => {
    const messages = await colourErrors('apps/mobile/src/theme/__lint_probe__.ts');
    expect(messages).toEqual([]);
  });
});
