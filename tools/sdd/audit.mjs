#!/usr/bin/env node
// Audit de cohérence et d'exhaustivité du référentiel. Code de sortie 1 en cas d'erreur.
// Usage : node tools/sdd/audit.mjs [--write]   (--write : enregistre progress/audit.md)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, nowIso, ROOT, sddPaths, writeFileAtomic } from './lib.mjs';

const REQUIRED_HEADINGS = [
  '## 1. Objectif', '## 2. Contexte', '## 3. Dépendances', '## 4. Règles métier couvertes',
  '## 5. Exigences fonctionnelles', '## 6. Exigences techniques', '## 7. Comportements attendus et cas limites',
  '## 8. Instructions d\'implémentation', '## 9. Fichiers et composants concernés', '## 10. Interface et conformité visuelle',
  '## 11. Critères d\'acceptation', '## 12. Plan de tests', '## 13. Preuves attendues', '## 14. Définition de terminé',
  '## 15. Décisions et hypothèses',
];

/** Audite le référentiel situé à `root` ; n'écrit rien. */
export function auditRepository(root = ROOT) {
  const P = sddPaths(root);
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const catalog = loadCatalog(P.catalog);
  const ids = new Set();
  for (const s of catalog.specs) {
    if (ids.has(s.id)) err(`Identifiant en double : ${s.id}`);
    ids.add(s.id);
  }
  const phaseOrder = catalog.phases.map((p) => p.id);
  for (const s of catalog.specs) {
    for (const d of s.dependsOn) {
      if (!ids.has(d)) err(`${s.id} dépend de ${d}, inconnue`);
      else if (phaseOrder.indexOf(catalog.byId[d].phase) > phaseOrder.indexOf(s.phase)) err(`${s.id} (${s.phase}) dépend de ${d} d'une phase ultérieure`);
    }
  }
  const visiting = new Map();
  const visit = (id, stack) => {
    if (visiting.get(id) === 1) { err(`Cycle de dépendances : ${[...stack, id].join(' → ')}`); return; }
    if (visiting.get(id) === 2) return;
    visiting.set(id, 1);
    for (const d of catalog.byId[id]?.dependsOn ?? []) visit(d, [...stack, id]);
    visiting.set(id, 2);
  };
  for (const s of catalog.specs) visit(s.id, []);

  const brText = fs.readFileSync(P.businessRules, 'utf8');
  const brDefined = new Set([...brText.matchAll(/^\| (BR-[A-Z]+-\d+) \|/gm)].map((m) => m[1]));
  const adrDefined = new Set(fs.readdirSync(P.adrDir).filter((f) => /^ADR-\d{4}/.test(f)).map((f) => f.slice(0, 8)));
  const screensText = fs.readFileSync(P.screens, 'utf8');
  const scrDefined = new Set([...screensText.matchAll(/^\| (SCR-\d+) \|/gm)].map((m) => m[1]));
  const checkpointsText = fs.existsSync(P.checkpoints) ? fs.readFileSync(P.checkpoints, 'utf8') : '';
  for (const ph of catalog.phases) if (!checkpointsText.includes(`## ${ph.checkpoint}`)) err(`Checkpoint ${ph.checkpoint} non défini dans specs/checkpoints.md`);

  const brCitedAnywhere = new Set();
  let filesOk = 0;
  for (const s of catalog.specs) {
    for (const b of s.businessRules) if (!brDefined.has(b)) err(`${s.id} : règle inconnue dans le catalogue ${b}`);
    for (const a of s.adrs) if (!adrDefined.has(a)) err(`${s.id} : ADR inconnu dans le catalogue ${a}`);
    for (const sc of s.screens) if (!scrDefined.has(sc)) err(`${s.id} : écran inconnu ${sc}`);
    const f = path.join(root, s.path);
    if (!fs.existsSync(f)) { err(`${s.id} : fichier absent ${s.path}`); continue; }
    const txt = fs.readFileSync(f, 'utf8');
    filesOk += 1;
    const fm = txt.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) err(`${s.id} : en-tête YAML absent`);
    else {
      if (!new RegExp(`^id: ${s.id}$`, 'm').test(fm[1])) err(`${s.id} : id d'en-tête incorrect`);
      const dep = fm[1].match(/^depends_on: \[(.*)\]$/m);
      const depList = dep ? dep[1].split(',').map((x) => x.trim()).filter(Boolean) : null;
      if (!depList || depList.sort().join() !== [...s.dependsOn].sort().join()) err(`${s.id} : depends_on de l'en-tête ≠ catalogue`);
    }
    for (const h of REQUIRED_HEADINGS) if (!txt.includes(h)) err(`${s.id} : section manquante « ${h} »`);
    for (const b of s.businessRules) if (!txt.includes(b)) err(`${s.id} : règle ${b} non citée dans le texte`);
    for (const m of txt.matchAll(/\bBR-[A-Z]+-\d+\b/g)) { brCitedAnywhere.add(m[0]); if (!brDefined.has(m[0])) err(`${s.id} : règle citée inexistante ${m[0]}`); }
    for (const m of txt.matchAll(/\bADR-\d{4}\b/g)) if (!adrDefined.has(m[0])) err(`${s.id} : ADR cité inexistant ${m[0]}`);
    for (const m of txt.matchAll(/\bSPEC-\d{3}\b/g)) if (!ids.has(m[0])) err(`${s.id} : spécification citée inexistante ${m[0]}`);
    const ca = new Set([...txt.matchAll(/\bCA-\d+\b/g)].map((m) => m[0]));
    if (ca.size < 3) err(`${s.id} : moins de 3 critères d'acceptation`);
    const plan = txt.split('## 12. Plan de tests')[1]?.split('## 13.')[0] ?? '';
    if (!plan.includes(`@${s.id}`)) err(`${s.id} : le plan de tests ne référence pas l'étiquette @${s.id}`);
    if (!plan.includes(`[${s.id}]`)) err(`${s.id} : le plan de tests ne référence pas l'étiquette Vitest [${s.id}]`);
    if (!/@visual/.test(plan)) err(`${s.id} : aucun test @visual prévu`);
    for (const c of ca) if (!plan.includes(c)) warn(`${s.id} : ${c} n'est relié à aucun test du plan`);
    const words = txt.split(/\s+/).length;
    if (words < 600) warn(`${s.id} : spécification courte (${words} mots)`);
  }
  for (const b of brDefined) if (!brCitedAnywhere.has(b)) err(`Règle métier non couverte par une spécification : ${b}`);

  const report = `# Audit du référentiel\n\n- Date : ${nowIso()}\n- Spécifications : ${catalog.specs.length} (fichiers présents : ${filesOk})\n- Règles métier : ${brDefined.size} (citées : ${[...brDefined].filter((b) => brCitedAnywhere.has(b)).length})\n- ADR : ${adrDefined.size}\n- Erreurs : ${errors.length}\n- Avertissements : ${warnings.length}\n\n## Erreurs\n\n${errors.map((e) => `- ${e}`).join('\n') || 'Aucune.'}\n\n## Avertissements\n\n${warnings.map((w) => `- ${w}`).join('\n') || 'Aucun.'}\n`;
  return { errors, warnings, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, report } = auditRepository(ROOT);
  if (process.argv.includes('--write')) writeFileAtomic(sddPaths(ROOT).audit, report);
  console.log(report);
  process.exit(errors.length ? 1 : 0);
}
