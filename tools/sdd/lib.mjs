// Bibliothèque commune de l'outillage SDD. Aucune dépendance externe (Node.js ≥ 20).
// Racine et horloge injectables (SPEC-003) : SDD_ROOT et SDD_NOW sont réservées aux tests.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexCatalog, normalizeState } from './core.mjs';

export {
  DISPLAY_STATUSES, MAX_ATTEMPTS, STATUSES, displayStatus, emptySpecState, indexCatalog, isBlockedTransitively,
  nextAction, nextActionJson, normalizeState, phaseUnlocked, progressSummary, readySpecs, renderProgressMarkdown,
} from './core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT = process.env.SDD_ROOT ? path.resolve(process.env.SDD_ROOT) : REPO_ROOT;

export function sddPaths(root) {
  return {
    catalog: path.join(root, 'specs', 'catalog.json'),
    checkpoints: path.join(root, 'specs', 'checkpoints.md'),
    state: path.join(root, 'progress', 'state.json'),
    progressMd: path.join(root, 'progress', 'PROGRESS.md'),
    audit: path.join(root, 'progress', 'audit.md'),
    anomalies: path.join(root, 'progress', 'anomalies.md'),
    blockers: path.join(root, 'progress', 'blockers.md'),
    lock: path.join(root, '.sdd', 'lock.json'),
    evidence: path.join(root, 'evidence'),
    businessRules: path.join(root, 'docs', 'product', 'business-rules.md'),
    screens: path.join(root, 'docs', 'product', 'screens.md'),
    adrDir: path.join(root, 'docs', 'adr'),
  };
}
export const P = sddPaths(ROOT);

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Écriture atomique : fichier temporaire dans le même répertoire puis renommage. */
export function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

export function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2) + '\n');
}

/** Horloge de l'outillage : SDD_NOW (date ISO) la fige, sinon horloge système. */
export function nowIso() {
  const fixed = process.env.SDD_NOW;
  if (fixed) {
    const d = new Date(fixed);
    if (Number.isNaN(d.getTime())) die(`SDD_NOW invalide : ${fixed}`);
    return d.toISOString();
  }
  return new Date().toISOString();
}

export function loadCatalog(file = P.catalog) {
  let raw;
  try {
    raw = readJson(file);
  } catch (e) {
    die(`Catalogue illisible (${path.relative(ROOT, file)}) : ${e.message}`);
  }
  return indexCatalog(raw);
}

/** Lit l'état ; un fichier mal formé n'est jamais recréé ni réinitialisé (CL-8). */
export function loadState(catalog = loadCatalog(), file = P.state) {
  let raw = null;
  if (fs.existsSync(file)) {
    try {
      raw = readJson(file);
    } catch (e) {
      die(`progress/state.json illisible : ${e.message}. Corrigez le fichier (git diff) ; il n'est pas recréé.`);
    }
  }
  return normalizeState(catalog, raw);
}

export function saveState(st) {
  st.updatedAt = nowIso();
  writeJsonAtomic(P.state, st);
}

export function readLock() {
  return fs.existsSync(P.lock) ? readJson(P.lock) : null;
}
export function writeLock(data) {
  writeJsonAtomic(P.lock, data);
}
export function clearLock() {
  if (fs.existsSync(P.lock)) fs.rmSync(P.lock);
}

export function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
export function shOk(cmd) {
  try {
    return { ok: true, out: sh(cmd) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
/** Exécute une commande en affichant sa sortie ; renvoie le code de sortie. */
export function run(cmd, env = {}) {
  console.log(`\n$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status ?? 1;
}

export function isGitRepo() {
  return shOk('git rev-parse --is-inside-work-tree').ok;
}
export function hasRemoteOrigin() {
  return shOk('git remote get-url origin').ok;
}
export function currentBranch() {
  return shOk('git rev-parse --abbrev-ref HEAD').out;
}
export function headCommit() {
  return shOk('git rev-parse --short HEAD').out;
}

export function slugOf(spec) {
  return path.basename(spec.path, '.md').replace(`${spec.id}-`, '').slice(0, 40);
}
export function branchOf(spec) {
  return `spec/${spec.id}-${slugOf(spec)}`;
}

export function specFile(spec) {
  return path.join(ROOT, spec.path);
}

export function specCriteria(spec) {
  const f = specFile(spec);
  if (!fs.existsSync(f)) return [];
  const txt = fs.readFileSync(f, 'utf8');
  return [...new Set([...txt.matchAll(/\bCA-\d+\b/g)].map((m) => m[0]))];
}

export function appendMd(file, header, line) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, header, 'utf8');
  fs.appendFileSync(file, line + '\n', 'utf8');
}

export function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

export function argSpec(catalog) {
  const id = process.argv[2];
  if (!id) die('Identifiant de spécification attendu (ex. SPEC-001).');
  const spec = catalog.byId[id];
  if (!spec) die(`Spécification inconnue : ${id}`);
  return spec;
}
