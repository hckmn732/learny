#!/usr/bin/env node
// Creates an empty custom migration for SQL that Drizzle cannot express (functions, triggers,
// policies, expression indexes), then mirrors it to Supabase (SPEC-101 EF-2, ADR-0111).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrationDirectories, syncMigrations } from './migrations-lib.mjs';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage : pnpm db:migration:custom <nom_en_snake_case>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const { source, target } = migrationDirectories(here);
const result = spawnSync(
  'pnpm',
  ['exec', 'drizzle-kit', 'generate', '--custom', `--name=${name}`],
  {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

try {
  const sync = syncMigrations(source, target);
  console.log(
    `✔ Migration personnalisée ${name} synchronisée (${String(sync.written)} écrite(s)).`,
  );
} catch (error) {
  console.error(
    `✖ Synchronisation impossible : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
