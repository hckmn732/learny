#!/usr/bin/env node
// Crée un nouvel ADR (décision déduite pendant l'implémentation) et met à jour l'index.
// Usage : node tools/sdd/adr.mjs new "Titre" --context "…" --decision "…" [--consequences "…"] [--links "SPEC-xxx"]
import fs from 'node:fs';
import path from 'node:path';
import { die, P } from './lib.mjs';

const [cmd, title] = process.argv.slice(2);
if (cmd !== 'new' || !title) die('Usage : node tools/sdd/adr.mjs new "Titre" --context "…" --decision "…" [--consequences "…"] [--links "…"]');
const opt = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : '';
};
const context = opt('context');
const decision = opt('decision');
if (!context || !decision) die('--context et --decision sont obligatoires.');
const nums = fs.readdirSync(P.adrDir).map((f) => f.match(/^ADR-(\d{4})/)?.[1]).filter(Boolean).map(Number);
const n = Math.max(0, ...nums) + 1;
const id = `ADR-${String(n).padStart(4, '0')}`;
const slug = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const file = `${id}-${slug}.md`;
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(P.adrDir, file), `# ${id} — ${title}\n\n- **Statut** : Acceptée\n- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)\n- **Date** : ${date}\n- **Liens** : ${opt('links') || '—'}\n\n## Contexte\n\n${context}\n\n## Décision\n\n${decision}\n\n## Conséquences\n\n${opt('consequences') || 'Aucune conséquence particulière au-delà de la décision.'}\n`, 'utf8');
const idx = path.join(P.adrDir, 'README.md');
fs.appendFileSync(idx, `| [${id}](${file}) | ${title} | Déduite | ${opt('links') || '—'} |\n`, 'utf8');
console.log(`${id} créé : docs/adr/${file}`);
