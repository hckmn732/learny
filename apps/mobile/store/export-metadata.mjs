#!/usr/bin/env node
// Exporte les fiches de stores depuis `store/metadata.ts` (SPEC-3502 EF-4).
//
// Usage : node --experimental-strip-types apps/mobile/store/export-metadata.mjs [--check]
//
// Node 22 retire les types à la volée : ce script n'a besoin ni de `tsc` ni de `tsx`. `--check`
// n'écrit rien et sort en erreur si un fichier versionné diverge de la source (utilisé par
// `store/metadata.test.ts`, qui partage la même projection).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storeFiles } from './export-fields.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');

const drift = [];
for (const file of storeFiles()) {
  const target = path.join(HERE, file.path);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (check) {
    if (current !== file.content) drift.push(file.path);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.content);
  console.log(`✔ ${file.path} (${String(Array.from(file.content).length)} caractères)`);
}

if (drift.length > 0) {
  console.error(`✖ fiches désynchronisées de store/metadata.ts : ${drift.join(', ')}`);
  console.error('  Régénérer : node --experimental-strip-types apps/mobile/store/export-metadata.mjs');
  process.exit(1);
}
if (check) console.log('✔ fiches des stores à jour');
