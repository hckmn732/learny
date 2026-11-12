#!/usr/bin/env node
// Charge le jeu de démonstration SPEC-115 (package/db/src/seed) en local ou en test uniquement.
// La garde d'environnement et l'horloge figée sont appliquées par la seed elle-même avant toute
// connexion en écriture (ADR-0047, ADR-0250, CL-3).
import { loadEnvFiles, run } from './lib.mjs';

loadEnvFiles();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CLOCK_FIXED_AT = process.env.CLOCK_FIXED_AT ?? '2026-11-11T12:20:00Z';

console.log('→ Chargement du jeu de démonstration SPEC-115');
const code = run('pnpm', ['exec', 'tsx', 'packages/db/src/seed/cli.ts'], {
  env: {
    ...process.env,
    DATABASE_URL,
    CLOCK_FIXED_AT,
    APP_ENV: process.env.APP_ENV ?? 'local',
  },
});
if (code !== 0) {
  console.error('✖ chargement du jeu de démonstration en échec.');
  process.exit(code);
}
