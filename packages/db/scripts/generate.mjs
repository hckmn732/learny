#!/usr/bin/env node
// Runs `drizzle-kit generate` with the forwarded arguments, then mirrors the migrations to
// Supabase (SPEC-101 EF-1, ET-8). With no schema change drizzle-kit creates nothing and exits 0.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrationDirectories, syncMigrations } from './migrations-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { source, target } = migrationDirectories(here);
const args = process.argv.slice(2).filter((arg) => arg !== '--');

const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate', ...args], {
  cwd: path.resolve(here, '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

try {
  const sync = syncMigrations(source, target);
  console.log(
    `✔ Migrations synchronisées : ${String(sync.written)} écrite(s), ${String(sync.deleted)} supprimée(s), ${String(sync.plan.unchanged.length)} inchangée(s).`,
  );
} catch (error) {
  console.error(
    `✖ Synchronisation impossible : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
