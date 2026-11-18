// Playwright global setup: every end-to-end run starts from an empty, migrated local database
// (docs/engineering/testing.md §3, SPEC-101 §12). No simulated database is allowed: when Docker or
// the Supabase CLI is unavailable, `pnpm db:reset` fails the run explicitly.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export default function globalSetup(): void {
  // SPEC-804 : `pnpm test:perf` prépare lui-même ses données de démonstration et de charge.
  if (process.env.PERF_SKIP_DB === '1' || process.env.E2E_SKIP_GLOBAL_SETUP_DB === '1') return;
  const reset = spawnSync('pnpm', ['db:reset', '--yes'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((reset.status ?? 1) !== 0) {
    throw new Error(
      `Base locale injoignable : lancer pnpm dev:up (pnpm db:reset → ${String(reset.status)})`,
    );
  }
  // Every end-to-end run starts from the same SPEC-115 demonstration dataset (docs/testing.md §3).
  const seed = spawnSync('pnpm', ['db:seed:demo'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((seed.status ?? 1) !== 0) {
    throw new Error(
      `Jeu de démonstration indisponible (pnpm db:seed:demo → ${String(seed.status)})`,
    );
  }
}
