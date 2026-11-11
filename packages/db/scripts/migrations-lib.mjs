// Pure planning and verification of the Drizzle → Supabase migration mirror (SPEC-101 ET-8,
// ADR-0111). `packages/db/migrations/NNNN_name.sql` is the source of truth; Supabase requires
// `supabase/migrations/2026111100NNNN_name.sql`.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MIGRATION_PREFIX = '2026111100';
export const SOURCE_NAME = /^(\d{4})_([a-z0-9_-]+)\.sql$/i;
export const TARGET_NAME = /^2026111100(\d{4})_([a-z0-9_-]+)\.sql$/i;

/** Migrations are committed with LF, whatever the workstation line endings (ET-8). */
export function normalizeSql(content) {
  return content.replace(/\r\n?/g, '\n');
}

function targetNameFor(sourceName) {
  const match = SOURCE_NAME.exec(sourceName);
  if (!match) throw new Error(`Nom de migration source invalide : ${sourceName}`);
  return `${MIGRATION_PREFIX}${match[1]}_${match[2]}.sql`;
}

function readEntries(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => ({
      name,
      content: normalizeSql(fs.readFileSync(path.join(dir, name), 'utf8')),
    }));
}

function assertEntries(entries) {
  for (const entry of entries) {
    if (typeof entry?.name !== 'string' || typeof entry?.content !== 'string') {
      throw new Error('Entrée de migration invalide : { name, content } attendu.');
    }
  }
}

/**
 * Compares source and target files (*entries* are `{ name, content }`).
 * Returns the writes (new or changed), the orphan target files to delete and the unchanged ones.
 */
export function planSync(sourceFiles, targetFiles) {
  assertEntries(sourceFiles);
  assertEntries(targetFiles);
  const targets = new Map();
  for (const file of targetFiles) {
    if (!TARGET_NAME.test(file.name)) continue;
    if (targets.has(file.name)) throw new Error(`Cible dupliquée : ${file.name}`);
    targets.set(file.name, file);
  }
  const writes = [];
  const unchanged = [];
  const expected = new Set();
  for (const source of sourceFiles) {
    const name = targetNameFor(source.name);
    if (expected.has(name)) throw new Error(`Deux migrations produisent ${name}`);
    expected.add(name);
    const target = targets.get(name);
    const content = normalizeSql(source.content);
    if (target === undefined) {
      writes.push({ name, content, reason: 'missing' });
    } else if (target.content !== content) {
      writes.push({ name, content, reason: 'changed' });
    } else {
      unchanged.push(name);
    }
  }
  const deletes = [...targets.keys()].filter((name) => !expected.has(name)).sort();
  return { writes, deletes, unchanged };
}

/** Applies a plan: writes only changed files, removes orphans, never touches unrelated files. */
export function applyPlan(targetDir, plan) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of plan.writes) {
    fs.writeFileSync(path.join(targetDir, file.name), file.content, 'utf8');
  }
  for (const name of plan.deletes) fs.rmSync(path.join(targetDir, name), { force: true });
  return { written: plan.writes.length, deleted: plan.deletes.length };
}

export function planDirectories(sourceDir, targetDir) {
  return planSync(readEntries(sourceDir, SOURCE_NAME), readEntries(targetDir, TARGET_NAME));
}

export function syncMigrations(sourceDir, targetDir) {
  const plan = planDirectories(sourceDir, targetDir);
  const result = applyPlan(targetDir, plan);
  return { plan, ...result };
}

export class MigrationCheckError extends Error {
  constructor(errors) {
    super(`Migrations désynchronisées :\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'MigrationCheckError';
    this.errors = errors;
  }
}

/** Throws a `MigrationCheckError` when a target file is missing, different or orphaned (EF-3). */
export function checkMigrations(sourceDir, targetDir) {
  const plan = planDirectories(sourceDir, targetDir);
  const errors = [];
  for (const file of plan.writes) {
    errors.push(
      file.reason === 'missing'
        ? `absente : supabase/migrations/${file.name}`
        : `contenu différent : supabase/migrations/${file.name}`,
    );
  }
  for (const name of plan.deletes) {
    errors.push(`orpheline (aucune source packages/db/migrations) : supabase/migrations/${name}`);
  }
  if (errors.length > 0) throw new MigrationCheckError(errors);
  return { ok: true, checked: plan.unchanged.length };
}

/** SHA-256 of a file content, used by the evidence and the check output. */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function migrationDirectories(scriptDir) {
  const source = path.resolve(scriptDir, '..', 'migrations');
  const target = path.resolve(scriptDir, '..', '..', '..', 'supabase', 'migrations');
  return { source, target };
}
