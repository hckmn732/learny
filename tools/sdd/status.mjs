#!/usr/bin/env node
// Génère progress/PROGRESS.md (tableau de bord) depuis specs/catalog.json et progress/state.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayStatus, loadCatalog, loadState, nextAction, nowIso, P, saveState } from './lib.mjs';

const ICON = { done: '✅', in_progress: '🔄', ready: '🟢', waiting: '⏳', blocked: '⛔', dependency_blocked: '🚫' };

export function renderProgress(catalog = loadCatalog(), st = loadState(catalog)) {
  const all = catalog.specs;
  const ds = Object.fromEntries(all.map((s) => [s.id, displayStatus(catalog, st, s.id)]));
  const count = (k) => all.filter((s) => ds[s.id] === k).length;
  const done = count('done');
  const pct = ((done / all.length) * 100).toFixed(1);
  const v1 = all.filter((s) => s.priority === 'V1');
  const v1done = v1.filter((s) => ds[s.id] === 'done').length;
  const next = nextAction(catalog, st);
  const nextTxt = next.spec ? `${next.kind} ${next.spec.id} — ${next.spec.title}` : next.checkpoint ? `checkpoint ${next.checkpoint}` : next.kind;

  let md = `# Progression du projet Learny\n\n> Généré par \`node tools/sdd/status.mjs\` le ${nowIso()}. Ne pas éditer à la main.\n\n`;
  md += `## Synthèse\n\n| Indicateur | Valeur |\n|---|---|\n`;
  md += `| Spécifications | ${all.length} (V1 : ${v1.length}, V2 : ${all.length - v1.length}) |\n`;
  md += `| Terminées | ${done} |\n| En cours | ${count('in_progress')} |\n| Prêtes | ${count('ready')} |\n| En attente de dépendances | ${count('waiting')} |\n| Bloquées | ${count('blocked')} |\n| Bloquées par une dépendance | ${count('dependency_blocked')} |\n`;
  md += `| **Avancement global** | **${pct} %** |\n| Avancement V1 | ${((v1done / v1.length) * 100).toFixed(1)} % |\n| Prochaine action | ${nextTxt} |\n\n`;

  md += `## Phases et checkpoints\n\n| Phase | Titre | Terminées | Checkpoint | Statut |\n|---|---|---|---|---|\n`;
  for (const ph of catalog.phases) {
    const sp = all.filter((s) => s.phase === ph.id);
    const d = sp.filter((s) => ds[s.id] === 'done').length;
    const cp = st.checkpoints[ph.checkpoint];
    md += `| ${ph.id} | ${ph.title} | ${d}/${sp.length} | ${ph.checkpoint} | ${cp.status === 'passed' ? `✅ ${cp.at?.slice(0, 10) ?? ''} ${cp.tag ?? ''}` : cp.status === 'failed' ? '❌ échec' : '⏳'} |\n`;
  }

  md += `\n## Détail des spécifications\n\n| Spécification | Titre | Phase | Statut | Tentatives | Validations | Dépendances |\n|---|---|---|---|---|---|---|\n`;
  for (const s of all) {
    const x = st.specs[s.id];
    const v = Object.entries(x.validations ?? {}).map(([k, r]) => `${r.status === 'passed' ? '✓' : '✗'}${k}`).join(' ');
    md += `| [${s.id}](../${s.path}) | ${s.title} | ${s.phase} | ${ICON[ds[s.id]] ?? ''} ${ds[s.id]} | ${x.attempts} | ${v || '—'} | ${s.dependsOn.join(', ') || '—'} |\n`;
  }

  const blocked = all.filter((s) => ['blocked', 'dependency_blocked'].includes(ds[s.id]));
  md += `\n## Anomalies et blocages\n\n`;
  md += blocked.length ? blocked.map((s) => `- ${s.id} (${ds[s.id]}) : ${st.specs[s.id].lastError ?? 'dépendance bloquée'}`).join('\n') + '\n' : 'Aucun.\n';
  md += `\nDétails : [anomalies.md](anomalies.md), [blockers.md](blockers.md).\n`;
  fs.writeFileSync(P.progressMd, md, 'utf8');
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = loadCatalog();
  const st = loadState(catalog);
  saveState(st);
  renderProgress(catalog, st);
  console.log(`progress/PROGRESS.md régénéré.`);
}
