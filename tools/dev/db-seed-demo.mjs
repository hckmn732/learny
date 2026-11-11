#!/usr/bin/env node
// Loads the SPEC-115 demo dataset when it exists; fails explicitly before that (SPEC-008, CL-6).
import fs from 'node:fs';
import path from 'node:path';

import { ROOT, loadEnvFiles, run } from './lib.mjs';

loadEnvFiles();

const candidates = [
  path.join(ROOT, 'supabase', 'seed-demo.sql'),
  path.join(ROOT, 'supabase', 'seeds', 'demo.sql'),
];
const seed = candidates.find((candidate) => fs.existsSync(candidate));
if (!seed) {
  console.error('✖ seed de démonstration non disponible (livrée par SPEC-115).');
  process.exit(1);
}

const relative = path.relative(ROOT, seed);
console.log(`→ Chargement du jeu de démonstration ${relative}`);
const code = run(
  'docker',
  [
    'exec',
    '-i',
    'supabase_db_learny',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '-',
  ],
  { input: fs.readFileSync(seed) },
);
if (code !== 0) {
  console.error('✖ chargement du jeu de démonstration en échec.');
  process.exit(code);
}
console.log('✔ Jeu de démonstration chargé.');
