#!/usr/bin/env node
// Remote Supabase migrations for preview/production (SPEC-013, EF-5, ET-3).
// The script lists pending migrations before applying them, refuses a local database and never
// calls `supabase db reset`. `--dry-run` performs no network call at all (CL-5).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_ENVS,
  EXIT,
  ROOT,
  UNCONFIGURED,
  argValue,
  hasFlag,
  isLocalUrl,
  maskDestination,
  readText,
  redact,
} from './lib.mjs';

export const MIGRATIONS_DIR = 'supabase/migrations';
const MIGRATION_NAME = /^(\d{4,})_([a-z0-9][a-z0-9_-]*)\.sql$/;

export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Reads and orders local migrations; duplicate or unparsable versions are configuration errors. */
export function readLocalMigrations(root = ROOT) {
  const dir = path.join(root, MIGRATIONS_DIR);
  const errors = [];
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return { migrations: [], errors: [`Dossier de migrations absent : ${MIGRATIONS_DIR}.`] };
  }
  const byVersion = new Map();
  for (const file of files.sort()) {
    const match = MIGRATION_NAME.exec(file);
    if (match === null) {
      if (file.endsWith('.sql')) errors.push(`Migration mal nommée : ${file}.`);
      continue;
    }
    const [, version, name] = match;
    if (byVersion.has(version)) {
      const previous = byVersion.get(version);
      errors.push(`Version de migration dupliquée ${version} : ${previous.file} et ${file}.`);
      continue;
    }
    const content = fs.readFileSync(path.join(dir, file));
    byVersion.set(version, {
      version,
      name,
      file,
      sha256: sha256(content),
    });
  }
  const migrations = [...byVersion.values()].sort((a, b) => Number(a.version) - Number(b.version));
  return { migrations, errors };
}

/** Parses the `supabase migration list` table: the remote column is authoritative (ET-3). */
export function parseRemoteMigrations(output) {
  const versions = new Set();
  for (const line of String(output ?? '').split('\n')) {
    if (!line.includes('|')) continue;
    const columns = line.split('|').map((column) => column.trim());
    if (columns.length < 2) continue;
    const remote = columns[1];
    if (!/^\d+$/.test(remote)) continue;
    versions.add(remote);
  }
  return [...versions];
}

/** Applies pending migrations in order, once each; detects modified published migrations. */
export function planMigrations({ migrations, remoteVersions, manifest }) {
  const errors = [];
  const remote = new Set(remoteVersions.map(String));
  const pending = [];
  const skipped = [];
  for (const migration of migrations) {
    const publishedHash = manifest?.[migration.version];
    if (publishedHash !== undefined && publishedHash !== migration.sha256) {
      errors.push(
        `Migration déjà publiée modifiée (${migration.file}) : ajoutez une nouvelle migration.`,
      );
      continue;
    }
    if (remote.has(migration.version)) skipped.push(migration);
    else pending.push(migration);
  }
  return { pending, skipped, errors };
}

export function validateMigrateConfig({ envName, env, backup, dryRun }) {
  const errors = [];
  const warnings = [];
  if (!DEPLOY_ENVS.includes(envName)) {
    errors.push(
      `APP_ENV=preview|production explicite obligatoire, reçu « ${envName ?? '(absent)'} ».`,
    );
  }
  if (env.APP_ENV !== undefined && env.APP_ENV !== envName) {
    errors.push(`APP_ENV=${env.APP_ENV} ne correspond pas à ${envName}.`);
  }
  const databaseUrl = env.SUPABASE_DB_URL ?? env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    const message = 'SUPABASE_DB_URL (ou DATABASE_URL) est absente.';
    if (dryRun) warnings.push(message);
    else errors.push(message);
  } else if (isLocalUrl(databaseUrl)) {
    const message = 'Migration distante refusée : l’URL de base est locale.';
    if (dryRun) warnings.push(message);
    else errors.push(message);
  }
  if (envName === 'production') {
    const reference =
      backup ?? env.PRODUCTION_SUPABASE_BACKUP_REFERENCE ?? env.DEPLOY_BACKUP_REFERENCE;
    if (reference === undefined || reference === '') {
      const message = 'Un point de restauration est exigé avant la migration de production.';
      if (dryRun) warnings.push(`${message} (référence absente).`);
      else errors.push(message);
    }
  }
  return { errors, warnings, databaseUrl };
}

function readManifest(file) {
  if (file === undefined || file === '') return { manifest: {}, error: null };
  const raw = readText(file);
  if (raw === null) return { manifest: {}, error: `Manifeste de migrations absent : ${file}.` };
  try {
    const parsed = JSON.parse(raw);
    return { manifest: parsed, error: null };
  } catch (error) {
    return { manifest: {}, error: `Manifeste de migrations invalide : ${error.message}` };
  }
}

function defaultRunner(args, env) {
  const result = spawnSync(env.SUPABASE_BIN ?? 'supabase', args, {
    encoding: 'utf8',
    shell: false,
    env,
  });
  return {
    code: result.error === undefined ? (result.status ?? 1) : 1,
    missing: result.error?.code === 'ENOENT',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function lastAppliedVersion(output) {
  const matches = [
    ...String(output ?? '').matchAll(/(?:Applying migration|Applying)\s+(\d{4,})/gi),
  ];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

/**
 * Executes the migration plan. `runner` is injectable so integration tests count every call
 * and prove that `--dry-run` performs none (CA-2).
 */
export function runMigrate(options = {}) {
  const root = options.root ?? ROOT;
  const env = options.env ?? {};
  const envName = options.envName ?? env.APP_ENV;
  const dryRun = options.dryRun === true;
  const backup = options.backup;
  const runner = options.runner ?? ((args) => defaultRunner(args, env));
  const log = options.log ?? (() => {});
  const local = readLocalMigrations(root);
  const manifestResult = readManifest(options.manifestPath);
  const validation = validateMigrateConfig({ envName, env, backup, dryRun });
  const errors = [...local.errors, ...validation.errors];
  if (manifestResult.error !== null) errors.push(manifestResult.error);
  const warnings = [...validation.warnings];
  const base = {
    dryRun,
    envName: envName ?? null,
    mode: dryRun ? 'dry-run' : 'apply',
    commit: env.GIT_COMMIT ?? null,
    destination: maskDestination(validation.databaseUrl),
    backup:
      backup ??
      env.PRODUCTION_SUPABASE_BACKUP_REFERENCE ??
      env.DEPLOY_BACKUP_REFERENCE ??
      UNCONFIGURED,
    pending: [],
    skipped: [],
    applied: [],
    failedMigration: null,
  };

  if (errors.length > 0) {
    return {
      code: EXIT.config,
      ok: false,
      report: { ...base, status: 'invalid', errors, warnings },
    };
  }

  if (dryRun) {
    // The remote list is unknown without a network call: every local migration is shown as
    // a candidate, explicitly marked as not verified online (CL-5).
    const pending = local.migrations.map((migration) => migration.version);
    warnings.push('Liste distante non consultée : migrations locales candidates, aucune mutation.');
    log(`Migrations candidates (ordre) : ${pending.join(', ') || 'aucune'}`);
    return {
      code: EXIT.ok,
      ok: true,
      report: {
        ...base,
        status: 'ok',
        pending,
        errors: [],
        warnings,
        note: 'Aucune liste distante ni application en --dry-run.',
      },
    };
  }

  const list = runner(['migration', 'list', '--db-url', validation.databaseUrl]);
  const listOutput = redact(list.output, [validation.databaseUrl]);
  log(listOutput.trim());
  if (list.missing === true) {
    return {
      code: EXIT.external,
      ok: false,
      report: {
        ...base,
        status: 'external',
        errors: ['CLI Supabase introuvable pour lister les migrations.'],
        warnings,
      },
    };
  }
  if (list.code !== 0) {
    return {
      code: EXIT.external,
      ok: false,
      report: {
        ...base,
        status: 'external',
        errors: ['La liste des migrations distantes a échoué (service indisponible).'],
        warnings,
      },
    };
  }

  const remote = parseRemoteMigrations(list.output);
  const plan = planMigrations({
    migrations: local.migrations,
    remoteVersions: remote,
    manifest: manifestResult.manifest,
  });
  const planErrors = [...plan.errors];
  if (planErrors.length > 0) {
    return {
      code: EXIT.config,
      ok: false,
      report: {
        ...base,
        status: 'invalid',
        skipped: plan.skipped.map((migration) => migration.version),
        errors: planErrors,
        warnings,
      },
    };
  }

  if (plan.pending.length === 0) {
    return {
      code: EXIT.ok,
      ok: true,
      report: {
        ...base,
        status: 'ok',
        skipped: plan.skipped.map((migration) => migration.version),
        errors: [],
        warnings: [...warnings, 'Aucune migration en attente : base déjà à jour.'],
        applied: [],
      },
    };
  }

  // No `db reset` can ever run on a remote database (CL-6).
  const pushArgs = ['db', 'push', '--yes', '--db-url', validation.databaseUrl];
  if (pushArgs.some((arg) => arg === 'reset')) {
    return {
      code: EXIT.config,
      ok: false,
      report: { ...base, status: 'invalid', errors: ['db:reset est interdit.'], warnings },
    };
  }
  log(`Migrations en attente : ${plan.pending.map((migration) => migration.version).join(', ')}`);
  const push = runner(pushArgs);
  const pushOutput = redact(push.output, [validation.databaseUrl]);
  log(pushOutput.trim());

  if (push.missing === true || push.code !== 0) {
    const failed = lastAppliedVersion(push.output) ?? plan.pending[0]?.version ?? null;
    return {
      code: EXIT.external,
      ok: false,
      report: {
        ...base,
        status: 'failed',
        skipped: plan.skipped.map((migration) => migration.version),
        pending: plan.pending.map((migration) => migration.version),
        failedMigration: failed,
        errors: [
          `La migration a échoué${failed === null ? '' : ` à la version ${failed}`} ; synchronisation et web non lancés.`,
        ],
        warnings,
      },
    };
  }

  return {
    code: EXIT.ok,
    ok: true,
    report: {
      ...base,
      status: 'ok',
      skipped: plan.skipped.map((migration) => migration.version),
      pending: plan.pending.map((migration) => migration.version),
      applied: plan.pending.map((migration) => migration.version),
      errors: [],
      warnings,
    },
  };
}

export function formatMigrateReport(result) {
  const { report } = result;
  const lines = [
    `Migrations Supabase — ${report.mode}`,
    `Environnement : ${report.envName ?? UNCONFIGURED}`,
    `Destination : ${report.destination}`,
  ];
  if (report.dryRun) lines.push(`Point de restauration : ${report.backup}`);
  if (report.pending.length > 0) lines.push(`En attente : ${report.pending.join(', ')}`);
  if (report.applied.length > 0) lines.push(`Appliquées : ${report.applied.join(', ')}`);
  if (report.skipped.length > 0) lines.push(`Déjà appliquées : ${report.skipped.join(', ')}`);
  if (report.failedMigration !== null) lines.push(`Migration fautive : ${report.failedMigration}`);
  for (const warning of report.warnings) lines.push(`⚠ ${warning}`);
  for (const error of report.errors ?? []) lines.push(`✖ ${error}`);
  if (report.dryRun)
    lines.push('Aucun appel de mutation : db:reset et db push ne sont pas exécutés.');
  return lines.join('\n');
}

const invoked =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invoked) {
  const argv = process.argv.slice(2);
  const envName = argValue(argv, '--env') ?? process.env.APP_ENV;
  const result = runMigrate({
    env: process.env,
    envName,
    dryRun: hasFlag(argv, '--dry-run'),
    backup: argValue(argv, '--backup'),
    manifestPath: argValue(argv, '--manifest'),
    log: (line) => {
      if (line !== '') console.log(line);
    },
  });
  if (hasFlag(argv, '--json')) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(formatMigrateReport(result));
  }
  process.exit(result.code);
}
