#!/usr/bin/env node
// Génère `store/licenses.json` (écran Profil → À propos, SPEC-3502 EF-6).
//
// Usage : node --experimental-strip-types apps/mobile/store/licenses.ts > apps/mobile/store/licenses.json
//         node --experimental-strip-types apps/mobile/scripts/generate-licenses.mjs [--check]
//
// `--check` n'écrit rien et sort en erreur si le fichier versionné est périmé (même contrôle que
// `store/metadata.test.ts`, exécutable à la main après une montée de version).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeLicenses } from '../store/licenses.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.dirname(HERE);
const TARGET = path.join(APP_DIR, 'store', 'licenses.json');
const check = process.argv.includes('--check');

const content = serializeLicenses(APP_DIR);
const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;

if (check) {
  if (current !== content) {
    console.error('✖ store/licenses.json est périmé : le régénérer.');
    process.exit(1);
  }
  console.log('✔ store/licenses.json à jour');
} else {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, content);
  const parsed = JSON.parse(content);
  console.log(
    `✔ store/licenses.json (${String(parsed.packages.length)} bibliothèques, ` +
      `${String(parsed.fonts.length)} familles de polices)`,
  );
}
