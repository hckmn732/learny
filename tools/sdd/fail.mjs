#!/usr/bin/env node
// Enregistre l'échec d'une tentative. Après MAX_ATTEMPTS échecs, la spécification est bloquée et consignée.
// Usage : node tools/sdd/fail.mjs SPEC-xxx "raison" [--external]   (--external : dépendance externe inaccessible → blocage immédiat)
import { appendMd, argSpec, clearLock, die, loadCatalog, loadState, MAX_ATTEMPTS, nowIso, P, saveState } from './lib.mjs';
import { renderProgress } from './status.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const spec = argSpec(catalog);
const reason = process.argv[3];
if (!reason) die('Raison de l\'échec attendue entre guillemets.');
const external = process.argv.includes('--external');
const s = st.specs[spec.id];
s.attempts += 1;
s.lastError = reason;

if (external || s.attempts >= MAX_ATTEMPTS) {
  s.status = 'blocked';
  const entry = { spec: spec.id, at: nowIso(), attempts: s.attempts, reason, external };
  st.anomalies.push(entry);
  const file = external ? P.blockers : P.anomalies;
  appendMd(file, external ? '# Blocages externes\n\nDépendances externes inaccessibles. Rien n\'est inventé ; les tâches indépendantes continuent.\n\n' : '# Anomalies\n\nSpécifications bloquées après échecs répétés.\n\n',
    `- **${spec.id}** (${nowIso()}, ${s.attempts} tentative(s)) — ${reason}`);
  clearLock();
  console.log(`⛔ ${spec.id} bloquée. Les spécifications indépendantes restent exécutables (node tools/sdd/next.mjs).`);
} else {
  console.log(`↻ ${spec.id} : tentative ${s.attempts}/${MAX_ATTEMPTS} en échec — ${reason}. Corriger puis relancer validate.mjs.`);
}
saveState(st);
renderProgress(catalog, st);
