#!/usr/bin/env node
// Déclare une spécification terminée (si toutes ses validations sont réussies), commite preuves et suivi,
// fusionne la branche dans main (--no-ff) et pousse si un remote origin existe.
// Usage : node tools/sdd/complete.mjs SPEC-xxx [--no-merge] [--no-push]
import fs from 'node:fs';
import path from 'node:path';
import {
  argSpec, clearLock, currentBranch, die, hasRemoteOrigin, headCommit, isGitRepo, loadCatalog,
  loadState, nowIso, P, saveState, shOk,
} from './lib.mjs';
import { renderProgress } from './status.mjs';

const catalog = loadCatalog();
const st = loadState(catalog);
const spec = argSpec(catalog);
const s = st.specs[spec.id];
if (s.status !== 'in_progress') die(`${spec.id} n'est pas en cours.`);

const required = ['lint', 'typecheck', 'unit', 'integration', 'e2e', 'visual', 'acceptance'];
const missing = required.filter((k) => s.validations?.[k]?.status !== 'passed');
if (missing.length) die(`Validations non réussies : ${missing.join(', ')}. Lancez node tools/sdd/validate.mjs ${spec.id}.`);
const ev = path.join(P.evidence, spec.id);
for (const f of ['summary.md', 'acceptance.md', 'checks.json']) if (!fs.existsSync(path.join(ev, f))) die(`Preuve manquante : evidence/${spec.id}/${f}`);
if (!fs.existsSync(path.join(ev, 'video')) || !fs.readdirSync(path.join(ev, 'video')).some((f) => f.endsWith('.webm'))) die(`Aucune vidéo dans evidence/${spec.id}/video`);

const git = isGitRepo();
if (git) {
  const dirty = shOk('git status --porcelain').out.split('\n').filter(Boolean)
    .filter((l) => !/\s(evidence|progress|test-results)\//.test(l) && !/\.sdd\//.test(l));
  if (dirty.length) die(`Modifications non commitées hors preuves/suivi :\n${dirty.join('\n')}\nCommittez l'implémentation par commits atomiques (docs/engineering/git.md) avant de terminer.`);
  shOk(`git add -A evidence/${spec.id}`);
  shOk(`git commit -m "evidence(${spec.id}): preuves de validation" -m "Refs: ${spec.id}"`);
}

s.status = 'done';
s.completedAt = nowIso();
s.lastError = null;
s.commit = git ? headCommit() : null;
saveState(st);
renderProgress(catalog, st);

if (git) {
  shOk('git add -A progress');
  const c = shOk(`git commit -m "chore(${spec.id}): marque la spécification terminée" -m "Refs: ${spec.id}"`);
  if (!c.ok && !/nothing to commit|rien à valider/i.test(c.out)) die(`Commit du suivi impossible : ${c.out}`);
  const branch = currentBranch();
  if (!process.argv.includes('--no-merge') && branch !== 'main') {
    const co = shOk('git checkout main');
    if (!co.ok) die(`Bascule sur main impossible : ${co.out}`);
    const m = shOk(`git merge --no-ff ${branch} -m "merge(${spec.id}): ${spec.title.replaceAll('"', "'")}"`);
    if (!m.ok) die(`Fusion impossible : ${m.out}. Résoudre le conflit sur main, committer, puis relancer.`);
    shOk(`git branch -d ${branch}`);
  }
  if (!process.argv.includes('--no-push') && hasRemoteOrigin() && process.env.SDD_PUSH !== '0') {
    const p = shOk('git push origin main');
    console.log(p.ok ? '↑ main poussé sur origin' : `⚠ push impossible, poursuite en local : ${p.out.split('\n')[0]}`);
  }
}
clearLock();
console.log(`✔ ${spec.id} terminée. Prochaine étape : node tools/sdd/next.mjs`);
