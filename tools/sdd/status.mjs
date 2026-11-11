#!/usr/bin/env node
// Génère progress/PROGRESS.md (tableau de bord) depuis specs/catalog.json et progress/state.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, loadState, nowIso, P, renderProgressMarkdown, saveState, writeFileAtomic } from './lib.mjs';

export function renderProgress(catalog = loadCatalog(), st = loadState(catalog)) {
  const md = renderProgressMarkdown(catalog, st, nowIso());
  writeFileAtomic(P.progressMd, md);
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = loadCatalog();
  const st = loadState(catalog);
  saveState(st);
  renderProgress(catalog, st);
  console.log(`progress/PROGRESS.md régénéré.`);
}
