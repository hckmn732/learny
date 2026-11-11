// Bibliothèque commune de l'outillage SDD. Aucune dépendance externe (Node.js ≥ 20).
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = {
  catalog: path.join(ROOT, 'specs', 'catalog.json'),
  checkpoints: path.join(ROOT, 'specs', 'checkpoints.md'),
  state: path.join(ROOT, 'progress', 'state.json'),
  progressMd: path.join(ROOT, 'progress', 'PROGRESS.md'),
  anomalies: path.join(ROOT, 'progress', 'anomalies.md'),
  blockers: path.join(ROOT, 'progress', 'blockers.md'),
  lock: path.join(ROOT, '.sdd', 'lock.json'),
  evidence: path.join(ROOT, 'evidence'),
  businessRules: path.join(ROOT, 'docs', 'product', 'business-rules.md'),
  screens: path.join(ROOT, 'docs', 'product', 'screens.md'),
  adrDir: path.join(ROOT, 'docs', 'adr'),
};

export const MAX_ATTEMPTS = 5;
export const STATUSES = ['pending', 'in_progress', 'done', 'blocked'];

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function nowIso() {
  return new Date().toISOString();
}

export function loadCatalog() {
  const c = readJson(P.catalog);
  c.byId = Object.fromEntries(c.specs.map((s) => [s.id, s]));
  return c;
}

export function emptySpecState() {
  return {
    status: 'pending',
    attempts: 0,
    startedAt: null,
    completedAt: null,
    branch: null,
    commit: null,
    lastError: null,
    validations: {},
  };
}

export function loadState(catalog = loadCatalog()) {
  let st;
  if (fs.existsSync(P.state)) st = readJson(P.state);
  else st = { version: 1, updatedAt: null, specs: {}, checkpoints: {}, anomalies: [] };
  for (const s of catalog.specs) if (!st.specs[s.id]) st.specs[s.id] = emptySpecState();
  for (const ph of catalog.phases) if (!st.checkpoints[ph.checkpoint]) st.checkpoints[ph.checkpoint] = { status: 'pending', at: null, tag: null, report: null };
  st.anomalies ??= [];
  return st;
}

export function saveState(st) {
  st.updatedAt = nowIso();
  writeJsonAtomic(P.state, st);
}

/** Statut affiché : pending devient waiting (dépendances non terminées) ou dependency_blocked. */
export function displayStatus(catalog, st, id) {
  const s = st.specs[id];
  if (s.status !== 'pending') return s.status;
  const deps = catalog.byId[id].dependsOn;
  if (deps.some((d) => isBlockedTransitively(catalog, st, d))) return 'dependency_blocked';
  if (deps.every((d) => st.specs[d].status === 'done') && phaseUnlocked(catalog, st, catalog.byId[id].phase)) return 'ready';
  return 'waiting';
}

export function isBlockedTransitively(catalog, st, id, seen = new Set()) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (st.specs[id].status === 'blocked') return true;
  return catalog.byId[id].dependsOn.some((d) => isBlockedTransitively(catalog, st, d, seen));
}

/** Une phase est débloquée quand le checkpoint de la phase précédente est réussi. */
export function phaseUnlocked(catalog, st, phaseId) {
  const idx = catalog.phases.findIndex((p) => p.id === phaseId);
  if (idx <= 0) return true;
  const prev = catalog.phases[idx - 1];
  return st.checkpoints[prev.checkpoint]?.status === 'passed';
}

export function readySpecs(catalog, st) {
  return catalog.specs.filter((s) => displayStatus(catalog, st, s.id) === 'ready');
}

/** Prochaine action : reprendre une spécification en cours, sinon checkpoint dû, sinon première spécification prête. */
export function nextAction(catalog, st) {
  const inProgress = catalog.specs.find((s) => st.specs[s.id].status === 'in_progress');
  if (inProgress) return { kind: 'resume', spec: inProgress };
  for (const ph of catalog.phases) {
    const specs = catalog.specs.filter((s) => s.phase === ph.id);
    const cp = st.checkpoints[ph.checkpoint];
    if (cp.status === 'passed') continue;
    const allDone = specs.every((s) => st.specs[s.id].status === 'done');
    if (allDone && phaseUnlocked(catalog, st, ph.id)) return { kind: 'checkpoint', checkpoint: ph.checkpoint, phase: ph };
    break;
  }
  const ready = readySpecs(catalog, st);
  if (ready.length) return { kind: 'start', spec: ready[0] };
  const pending = catalog.specs.filter((s) => st.specs[s.id].status !== 'done');
  if (pending.length === 0) return { kind: 'finished' };
  return { kind: 'stuck', remaining: pending.map((s) => `${s.id}:${displayStatus(catalog, st, s.id)}`) };
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
