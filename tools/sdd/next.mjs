#!/usr/bin/env node
// Affiche la prochaine action de la boucle autonome. `--json` pour une sortie machine.
import { loadCatalog, loadState, nextAction } from './lib.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const a = nextAction(catalog, st);
if (process.argv.includes('--json')) {
  const out = { kind: a.kind };
  if (a.spec) Object.assign(out, { id: a.spec.id, title: a.spec.title, path: a.spec.path, dependsOn: a.spec.dependsOn });
  if (a.checkpoint) Object.assign(out, { checkpoint: a.checkpoint, phase: a.phase.id });
  if (a.remaining) out.remaining = a.remaining;
  console.log(JSON.stringify(out));
} else if (a.kind === 'resume') {
  console.log(`REPRENDRE ${a.spec.id} — ${a.spec.title}\n  ${a.spec.path}\n  tentatives : ${st.specs[a.spec.id].attempts}`);
} else if (a.kind === 'start') {
  console.log(`DÉMARRER ${a.spec.id} — ${a.spec.title}\n  ${a.spec.path}\n  node tools/sdd/start.mjs ${a.spec.id}`);
} else if (a.kind === 'checkpoint') {
  console.log(`CHECKPOINT ${a.checkpoint} (${a.phase.title})\n  node tools/sdd/checkpoint.mjs ${a.checkpoint}`);
} else if (a.kind === 'finished') {
  console.log('TERMINÉ — toutes les spécifications et tous les checkpoints sont validés.');
} else {
  console.log(`AUCUNE SPÉCIFICATION EXÉCUTABLE. Restantes :\n  ${a.remaining.join('\n  ')}\nVoir progress/anomalies.md et progress/blockers.md.`);
}
