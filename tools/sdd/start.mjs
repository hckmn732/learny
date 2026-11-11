#!/usr/bin/env node
// Démarre (ou reprend) une spécification : contrôle des dépendances, verrou, branche Git.
import fs from 'node:fs';
import {
  argSpec, branchOf, currentBranch, die, displayStatus, isGitRepo, loadCatalog, loadState,
  nowIso, readLock, saveState, shOk, writeLock, MAX_ATTEMPTS, specFile,
} from './lib.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const spec = argSpec(catalog);
const s = st.specs[spec.id];

if (s.status === 'done') die(`${spec.id} est déjà terminée.`);
if (s.status === 'blocked') die(`${spec.id} est bloquée (${s.lastError}). Voir progress/anomalies.md.`);
const lock = readLock();
if (lock && lock.spec !== spec.id) die(`Verrou actif sur ${lock.spec}. Terminez-la ou marquez-la en échec avant d'en démarrer une autre.`);

const resuming = s.status === 'in_progress';
if (!resuming) {
  const ds = displayStatus(catalog, st, spec.id);
  if (ds !== 'ready') die(`${spec.id} n'est pas exécutable (statut : ${ds}). Dépendances : ${spec.dependsOn.join(', ') || 'aucune'}.`);
}
if (!fs.existsSync(specFile(spec))) die(`Fichier de spécification absent : ${spec.path}`);
if (s.attempts >= MAX_ATTEMPTS) die(`${spec.id} a atteint ${MAX_ATTEMPTS} tentatives ; utilisez fail.mjs pour la bloquer.`);

const branch = branchOf(spec);
if (isGitRepo()) {
  const cur = currentBranch();
  if (cur !== branch) {
    const exists = shOk(`git rev-parse --verify --quiet refs/heads/${branch}`).ok;
    const dirty = shOk('git status --porcelain').out;
    if (dirty && !resuming) die(`Arbre de travail non propre sur ${cur}. Committez ou annulez avant de démarrer ${spec.id}.`);
    const r = exists ? shOk(`git checkout ${branch}`) : shOk(`git checkout -b ${branch} main`);
    if (!r.ok) die(`Impossible de basculer sur ${branch} : ${r.out}`);
  }
}

s.status = 'in_progress';
s.startedAt ??= nowIso();
s.branch = branch;
saveState(st);
writeLock({ spec: spec.id, branch, since: nowIso(), attempt: s.attempts + 1 });

console.log(`${resuming ? 'REPRISE' : 'DÉMARRAGE'} ${spec.id} — ${spec.title}`);
console.log(`Branche : ${branch}`);
console.log(`À lire : ${spec.path}, puis les documents référencés (règles ${spec.businessRules.join(', ') || '—'} ; ADR ${spec.adrs.join(', ') || '—'} ; écrans ${spec.screens.join(', ') || '—'}).`);
console.log(`Ensuite : implémenter → node tools/sdd/validate.mjs ${spec.id} → node tools/sdd/complete.mjs ${spec.id}`);
