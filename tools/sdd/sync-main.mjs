#!/usr/bin/env node
// Synchronise main dans la branche courante de la piste (ADR-1006 §4) : git merge --no-ff main.
// Conflits limités au suivi (progress/state.json, progress/PROGRESS.md) : résolus par piste via
// mergeTrackStates, PROGRESS.md régénéré, commit « merge(sdd): synchronise main dans … ».
// Tout autre conflit : arrêt code 2 avec la liste des fichiers, aucun commit (CL-4) ;
// branche main locale absente : sortie 1 (CL-3). La piste ne déploie jamais (EF-2, ADR-1006).
import { mergeTrackStates, normalizeState } from './core.mjs';
import {
  currentBranch, currentTrack, DEFAULT_TRACK, die, isGitRepo, loadCatalog, loadState, P,
  shOk, trackConfig, writeJsonAtomic,
} from './lib.mjs';
import { renderProgress } from './status.mjs';

// Seuls ces deux fichiers de suivi sont résolus automatiquement (ADR-1006 §4).
const TRACKING = ['progress/state.json', 'progress/PROGRESS.md'];

/** Version « ours » (:2:) ou « theirs » (:3:) de progress/state.json pendant le conflit. */
function stageState(stage) {
  const side = stage === ':2:' ? 'ours' : 'theirs';
  const r = shOk(`git show ${stage}progress/state.json`);
  if (!r.ok) die(`Version ${side} de progress/state.json introuvable dans l'index : ${r.out}`);
  try {
    return JSON.parse(r.out);
  } catch (e) {
    die(`progress/state.json (${side}) illisible : ${e.message}`);
  }
}

if (!isGitRepo()) die('La synchronisation exige un dépôt Git.');
// Fichiers suivis modifiés seulement : les non suivis (preuves, rapports) ne gênent pas la fusion.
const dirty = shOk('git status --porcelain').out.split('\n').filter((l) => l.trim() && !l.startsWith('??'));
if (dirty.length) die(`Arbre de travail non propre :\n${dirty.join('\n')}\nCommittez ou annulez avant de synchroniser main.`);

const catalog = loadCatalog(); // arbre propre : le catalogue ne porte aucun marqueur de conflit.
const base = trackConfig(catalog, DEFAULT_TRACK).baseBranch;
if (!shOk(`git rev-parse --verify --quiet refs/heads/${base}`).ok)
  die(`Branche ${base} introuvable en local (CL-3). Créez-la depuis le dépôt distant : git fetch origin ${base} && git branch ${base} origin/${base}.`);

const branch = currentBranch();
const message = `merge(sdd): synchronise ${base} dans ${branch}`;
// -m obligatoire dès le merge : sans lui git écrirait « Merge branch 'main' into … », refusé par commitlint.
const merge = shOk(`git merge --no-ff ${base} -m "${message}"`);
if (merge.ok) {
  console.log(
    /already up to date|déjà à jour/i.test(merge.out)
      ? `✔ ${base} est déjà synchronisé dans ${branch}.`
      : `✔ ${base} synchronisé dans ${branch} (fusion --no-ff).`,
  );
  process.exit(0);
}

const conflicts = shOk('git diff --name-only --diff-filter=U').out.split('\n').map((l) => l.trim()).filter(Boolean);
if (conflicts.length === 0) die(`Fusion impossible : ${merge.out.split('\n')[0] ?? 'échec git'}`);

const tracking = conflicts.filter((f) => TRACKING.includes(f));
const code = conflicts.filter((f) => !TRACKING.includes(f));

if (tracking.length > 0) {
  // ADR-1006 §4 : le suivi se fusionne par piste ; ours = branche courante (:2:), theirs = main (:3:).
  const merged = conflicts.includes('progress/state.json')
    ? normalizeState(catalog, mergeTrackStates(catalog, stageState(':2:'), stageState(':3:'), currentTrack(catalog)))
    : loadState(catalog); // state.json a fusionné proprement : seule la régénération de PROGRESS.md manque.
  writeJsonAtomic(P.state, merged); // pas saveState : updatedAt reste le plus récent des deux états.
  renderProgress(catalog, merged);
  shOk(`git add ${TRACKING.join(' ')}`);
  console.log(`Suivi fusionné par piste (ADR-1006 §4) : ${tracking.join(', ')}.`);
}

if (code.length > 0) {
  // CL-4 : le suivi est résolu et indexé, la fusion reste en cours, aucun commit (sortie 2).
  console.error(`✖ Conflits hors suivi — résolution manuelle requise, aucun commit (code 2) :\n${code.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(2);
}

const commit = shOk(`git commit -m "${message}"`);
if (!commit.ok) die(`Commit de la synchronisation impossible : ${commit.out}`);
console.log(`✔ Conflits de suivi résolus ; ${base} synchronisé dans ${branch}.`);
