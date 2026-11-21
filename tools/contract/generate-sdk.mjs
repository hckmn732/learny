// SPEC-2002 — generates the TypeScript SDK from `api/openapi.yaml` (EF-2, ET-2).
//
// The generated types are committed and checked fresh in CI (`--check`), like the contract itself.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(ROOT, 'api', 'openapi.yaml');
export const TARGET = join(ROOT, 'packages', 'api-sdk', 'src', 'schema.d.ts');

function generate(output) {
  execFileSync('pnpm', ['exec', 'openapi-typescript', SOURCE, '-o', output], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--check')) {
    if (!existsSync(TARGET)) {
      console.error('✖ SDK absent : lancer pnpm sdk:generate');
      process.exitCode = 1;
      return;
    }
    const directory = mkdtempSync(join(tmpdir(), 'learny-sdk-'));
    const candidate = join(directory, 'schema.d.ts');
    try {
      generate(candidate);
      if (readFileSync(candidate, 'utf8') !== readFileSync(TARGET, 'utf8')) {
        console.error('✖ SDK périmé : lancer pnpm sdk:generate');
        process.exitCode = 1;
        return;
      }
      console.log('✔ SDK à jour');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    return;
  }
  generate(TARGET);
  console.log(`✔ ${TARGET}`);
}

main();
