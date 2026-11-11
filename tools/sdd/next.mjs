#!/usr/bin/env node
// Affiche la prochaine action de la boucle autonome. `--json` pour une sortie machine.
import { loadCatalog, loadState, nextAction, nextActionJson } from './lib.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const a = nextAction(catalog, st);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(nextActionJson(a)));
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
