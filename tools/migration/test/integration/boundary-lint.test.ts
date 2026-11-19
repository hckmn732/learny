// CA-2 (volet intégration, SPEC-1001 §12) : un fichier de apps/web hors liste de référence qui
// importe un paquet serveur fait échouer ESLint ; les fichiers de la liste de référence passent.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TEMP_FILE = path.join(ROOT, 'apps/web/lib/tmp-spec-1001-lint-check.ts');

afterEach(() => {
  if (fs.existsSync(TEMP_FILE)) fs.rmSync(TEMP_FILE);
});

function runEslint(file: string): { code: number; out: string } {
  const result = spawnSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', file], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

describe('[SPEC-1001] frontière ESLint de apps/web', () => {
  it('refuse un nouvel import serveur hors liste de référence (CA-2, CL-1)', () => {
    fs.writeFileSync(
      TEMP_FILE,
      "import { derive } from '@learny/services/home/derive';\nexport const tmp = derive;\n",
    );
    const result = runEslint(TEMP_FILE);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("apps/web est un client de l'API (ADR-1003)");
  });

  it('laisse passer un fichier de la liste de référence (CA-2)', () => {
    const result = runEslint('apps/web/lib/home-page.ts');
    expect(result.code, result.out).toBe(0);
  });
});
