// Playwright global setup: every end-to-end run starts from an empty, migrated local database
// (docs/engineering/testing.md §3, SPEC-101 §12). No simulated database is allowed: when Docker or
// the Supabase CLI is unavailable, `pnpm db:reset` fails the run explicitly.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export default function globalSetup(): void {
  const result = spawnSync('pnpm', ['db:reset', '--yes'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Base locale injoignable : lancer pnpm dev:up (pnpm db:reset → ${String(result.status)})`,
    );
  }
}
