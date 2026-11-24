#!/usr/bin/env node
// Découpe les captures Maestro en visuels de fiche Google Play (SPEC-3502 EF-4).
//
// Usage : node apps/mobile/store/crop-screenshots.mjs [--source <dir>]
//   source par défaut : test-results/sdd/SPEC-3502/artifacts/spec-3502-captures-store/takeScreenshot
//
// Play exige des captures téléphone de 320 à 3840 px et d'un ratio ≤ 2:1. L'émulateur produit du
// 1080 × 2400 (ratio 2,22) : chaque capture est **découpée** en 1080 × 2160 (2:1) en retirant les
// 240 px du bas (barre de navigation), jamais redimensionnée — le contenu affiché reste celui de
// l'application. Les fichiers produits sont versionnés dans `store/screenshots/android-phone/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.dirname(HERE);
const ROOT = path.resolve(APP_DIR, '..', '..');
const SOURCE = path.join(
  ROOT,
  'test-results',
  'sdd',
  'SPEC-3502',
  'artifacts',
  'spec-3502-captures-store',
);
const TARGET = path.join(HERE, 'screenshots', 'android-phone');
const WIDTH = 1080;
const HEIGHT = 2160;

const sourceArg = process.argv.indexOf('--source');
const source = sourceArg > 0 ? path.resolve(process.argv[sourceArg + 1] ?? '') : SOURCE;

if (!fs.existsSync(source)) {
  console.error(`✖ captures absentes : ${path.relative(ROOT, source)} (lancer la campagne SPEC-3502).`);
  process.exit(2);
}

/** Recadre une PNG à `WIDTH × HEIGHT` depuis le coin supérieur gauche. */
function crop(input, output) {
  const png = PNG.sync.read(fs.readFileSync(input));
  if (png.width < WIDTH || png.height < HEIGHT) {
    throw new Error(`${path.basename(input)} : ${png.width}×${png.height} < ${WIDTH}×${HEIGHT}`);
  }
  const out = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y += 1) {
    const from = (png.width * y) << 2;
    const to = (WIDTH * y) << 2;
    png.data.copy(out.data, to, from, from + WIDTH * 4);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(out));
  return `${WIDTH}×${HEIGHT}`;
}

const files = fs
  .readdirSync(source)
  .filter((file) => file.startsWith('SPEC-3502-store-') && file.endsWith('.png'))
  .sort();
if (files.length === 0) {
  console.error('✖ aucune capture `SPEC-3502-store-*` dans le dossier source.');
  process.exit(2);
}
for (const file of files) {
  const name = file.replace('SPEC-3502-store-', '');
  const size = crop(path.join(source, file), path.join(TARGET, name));
  console.log(`✔ ${name} (${size})`);
}
