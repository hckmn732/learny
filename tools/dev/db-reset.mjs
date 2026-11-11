#!/usr/bin/env node
// Applies migrations and the minimal seed after an explicit guard (SPEC-008, EF-3, ET-4).
import { databaseResetGuard, loadEnvFiles, run } from './lib.mjs';

loadEnvFiles();

const guard = databaseResetGuard();
if (!guard.ok) {
  console.error(`✖ Remise à zéro refusée : ${guard.reason}.`);
  process.exit(1);
}

if (!process.env.CI && !process.argv.includes('--yes')) {
  console.error('⚠ La remise à zéro supprime les données locales de la base.');
  console.error('  Relancez avec --yes pour confirmer, ou utilisez pnpm dev:up sans reset.');
  process.exit(1);
}

console.log(`→ Remise à zéro de la base locale (${guard.reason})`);
const code = run('supabase', ['db', 'reset', '--yes']);
if (code !== 0) {
  console.error('✖ supabase db reset a échoué.');
  process.exit(code);
}
console.log('✔ Migrations appliquées et seed minimale chargée.');
