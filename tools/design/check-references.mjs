#!/usr/bin/env node
// Vérifie design/references/ contre son manifeste, sans rien écrire (SPEC-005, EF-6, CL-4).
// Usage : node tools/design/check-references.mjs [dossier-racine]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pngSize, REFERENCES_DIR, sha256, sourceFile } from './manifest.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Renvoie la liste des écarts entre le manifeste et les fichiers de `root`. */
export function checkReferences(root = REPO, referencesDir = REFERENCES_DIR) {
  const errors = [];
  const manifestPath = path.join(root, referencesDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [`Manifeste absent : ${referencesDir}/manifest.json`];
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return [`Manifeste illisible : ${e.message}`];
  }
  const listed = new Set();
  for (const r of manifest.references ?? []) {
    const file = path.join(root, r.file.replace(REFERENCES_DIR, referencesDir));
    listed.add(path.basename(file));
    const src = path.join(root, sourceFile(r.source));
    if (!fs.existsSync(src)) errors.push(`${r.file} : source absente ${sourceFile(r.source)}`);
    if (!fs.existsSync(file)) { errors.push(`${r.file} : référence absente`); continue; }
    const png = fs.readFileSync(file);
    let size;
    try { size = pngSize(png); } catch { errors.push(`${r.file} : PNG invalide`); continue; }
    if (size.width !== r.width || size.height !== r.height) errors.push(`${r.file} : dimensions ${size.width}×${size.height}, manifeste ${r.width}×${r.height}`);
    const hash = sha256(png);
    if (hash !== r.sha256) errors.push(`${r.file} : empreinte ${hash.slice(0, 12)}… ≠ manifeste ${String(r.sha256).slice(0, 12)}…`);
  }
  const dir = path.join(root, referencesDir);
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png') && !listed.has(f)) errors.push(`${referencesDir}/${f} : PNG absent du manifeste`);
  if (!fs.existsSync(path.join(dir, 'tokens.json'))) errors.push(`${referencesDir}/tokens.json absent`);
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : REPO;
  const errors = checkReferences(root);
  if (errors.length) {
    console.error(errors.map((e) => `✖ ${e}`).join('\n'));
    process.exit(1);
  }
  const n = JSON.parse(fs.readFileSync(path.join(root, REFERENCES_DIR, 'manifest.json'), 'utf8')).references.length;
  console.log(`✔ ${n} référence(s) conformes au manifeste.`);
}
