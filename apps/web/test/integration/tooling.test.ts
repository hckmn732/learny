import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { HOSTING_REGIONS, isEuRegion } from '@learny/config';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const REQUIRED_SCRIPTS = [
  'dev',
  'build',
  'lint',
  'typecheck',
  'test:unit',
  'test:int',
  'test:e2e',
  'test:visual',
  'format',
  'format:check',
];

function eslint(): ESLint {
  return new ESLint({
    cwd: ROOT,
    // Files are virtual: type-aware rules cannot run on them.
    overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
  });
}

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint().lintText(code, { filePath: path.join(ROOT, filePath) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '');
}

describe('[SPEC-001] tooling', () => {
  it('declares every root script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const name of REQUIRED_SCRIPTS) expect(pkg.scripts[name], name).toBeTruthy();
  });

  it('forbids Date.now() outside packages/core/src/clock.ts', async () => {
    const code = 'export const t = Date.now();\n';
    expect(await ruleIds(code, 'packages/config/src/fixture.ts')).toContain('no-restricted-syntax');
    expect(await ruleIds(code, 'packages/core/src/clock.ts')).not.toContain('no-restricted-syntax');
  });

  it('forbids new Date() without arguments outside the clock', async () => {
    const code = 'export const t = new Date();\n';
    expect(await ruleIds(code, 'packages/config/src/fixture.ts')).toContain('no-restricted-syntax');
  });

  it('forbids importing an application from a package', async () => {
    const code = "import x from '../../../apps/web/lib/sdd-pages';\nexport default x;\n";
    expect(await ruleIds(code, 'packages/core/src/fixture.ts')).toContain(
      'import/no-restricted-paths',
    );
  });

  it.each(Object.entries(HOSTING_REGIONS))('declares %s in an EU region (%s)', (_s, region) => {
    expect(isEuRegion(region)).toBe(true);
  });
});
