#!/usr/bin/env node
// Fails when supabase/migrations diverges from packages/db/migrations (SPEC-101 EF-3).
// The `drizzle-kit check` journal verification runs before this script in `pnpm db:check`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMigrations, migrationDirectories } from './migrations-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { source, target } = migrationDirectories(here);

try {
  const result = checkMigrations(source, target);
  console.log(
    `✔ ${String(result.checked)} migration(s) source(s) identique(s) dans supabase/migrations.`,
  );
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  console.error('  Corriger avec `pnpm db:generate` (ou supprimer les fichiers orphelins).');
  process.exit(1);
}
