#!/usr/bin/env node
// Mirrors packages/db/migrations/NNNN_name.sql to supabase/migrations/2026111100NNNN_name.sql
// (SPEC-101 ET-8). Idempotent: identical files are not rewritten.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrationDirectories, syncMigrations } from './migrations-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { source, target } = migrationDirectories(here);

try {
  const result = syncMigrations(source, target);
  console.log(
    `✔ Migrations synchronisées : ${String(result.written)} écrite(s), ${String(result.deleted)} supprimée(s), ${String(result.plan.unchanged.length)} inchangée(s).`,
  );
} catch (error) {
  console.error(
    `✖ Synchronisation impossible : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
