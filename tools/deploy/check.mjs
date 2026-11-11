#!/usr/bin/env node
// Controlled deployment check: regions, variables, ref, SDD pages and workflow rules (SPEC-013).
// `--dry-run` reads the repository only: no provider API, no migration, no publication (EF-4, CL-5).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_ENVS,
  DEPLOY_WORKFLOW,
  EXIT,
  PREVIEW_REQUIRED_KEYS,
  REQUIRED_SECURITY_HEADERS,
  ROOT,
  UNCONFIGURED,
  argValue,
  hasFlag,
  headerValue,
  isEuRegion,
  isLocalUrl,
  maskDestination,
  missingKeys,
  readManagedConfig,
  readVercelConfig,
} from './lib.mjs';
import { readDeployWorkflow, validateDeployWorkflow } from './workflow.mjs';

const TAG = /^v\d+\.\d+\.\d+$/;

function normalizeRef(value) {
  return String(value ?? '')
    .replace(/^refs\/tags\//, '')
    .replace(/^refs\/heads\//, '');
}

function isProduction(envName) {
  return envName === 'production';
}

/** Ref rules: only a tag on main reaches production; a preview never deploys main (CL-3). */
export function validateRef({ envName, ref, branch, event, dryRun }) {
  const errors = [];
  const warnings = [];
  const refName = normalizeRef(ref);
  if (isProduction(envName)) {
    if (refName === '') {
      if (dryRun) warnings.push('Ref absente en --dry-run : fournir un tag v* pour un essai réel.');
      else errors.push('La production exige un tag v* (ref absente).');
    } else if (!TAG.test(refName)) {
      errors.push(`La production exige un tag vX.Y.Z, reçu « ${refName} ».`);
    }
    if (branch === undefined || branch === '') {
      if (dryRun) warnings.push('Branche absente en --dry-run : le tag doit appartenir à main.');
      else errors.push('La production exige la branche main.');
    } else if (branch !== 'main') {
      errors.push(`Un tag de production doit appartenir à main, reçu « ${branch} ».`);
    }
    if (event !== undefined && event !== '' && event !== 'push') {
      errors.push(`La production est déclenchée par un push de tag, reçu « ${event} ».`);
    }
  } else {
    if (branch === 'main' || refName === 'main') {
      errors.push('Une preview ne doit jamais cibler main.');
    }
    if ((ref === undefined || ref === '') && (branch === undefined || branch === '')) {
      warnings.push('Ref de preview absente : contrôle statique seulement.');
    }
  }
  return { errors, warnings };
}

function validateRegions({ envName, env, managed, vercel, dryRun }) {
  const errors = [];
  const warnings = [];
  for (const [service, region] of Object.entries(managed.regions)) {
    if (!isEuRegion(region, managed.euRegions)) {
      errors.push(`La région ${service} déclarée (${region}) n’est pas dans l’Union européenne.`);
    }
  }

  const vercelRegions = Array.isArray(vercel?.regions) ? vercel.regions.map(String) : [];
  if (vercelRegions.length === 0) {
    errors.push('vercel.json doit déclarer la région fra1.');
  } else {
    if (vercelRegions.length !== 1 || vercelRegions[0] !== managed.regions.vercel) {
      errors.push(
        `vercel.json doit cibler uniquement ${managed.regions.vercel}, reçu ${vercelRegions.join(', ')}.`,
      );
    }
    for (const region of vercelRegions) {
      if (!isEuRegion(region, managed.euRegions)) {
        errors.push(`Région Vercel hors UE refusée : ${region} (CL-1).`);
      }
    }
  }

  const serviceRegions = [
    ['supabase', 'SUPABASE_REGION'],
    ['inngest', 'INNGEST_REGION'],
  ];
  for (const [service, key] of serviceRegions) {
    const expected = managed.regions[service];
    const actual = env[key];
    if (actual === undefined || actual === '') {
      const message = `${key} non fourni : région ${service} non vérifiée.`;
      if (dryRun) warnings.push(message);
      else errors.push(message);
      continue;
    }
    if (!isEuRegion(String(actual), managed.euRegions)) {
      errors.push(`${key}=${String(actual)} est hors UE (CL-1).`);
    } else if (String(actual) !== expected) {
      errors.push(`${key}=${String(actual)} ne correspond pas à la région attendue ${expected}.`);
    }
  }

  for (const key of ['DATABASE_URL', 'SUPABASE_DB_URL', 'NEXT_PUBLIC_APP_URL', 'INNGEST_APP_URL']) {
    if (isLocalUrl(env[key])) {
      const message = `${key} pointe vers une adresse locale : refusé pour ${envName}.`;
      if (dryRun) warnings.push(message);
      else errors.push(message);
    }
  }

  return { errors, warnings };
}

function validateHeaders(vercel, vercelRaw) {
  const errors = [];
  const warnings = [];
  for (const header of REQUIRED_SECURITY_HEADERS) {
    if (headerValue(vercel, '/(.*)', header) === null) {
      errors.push(`En-tête de sécurité absent de vercel.json : ${header} (EF-1).`);
    }
  }
  const robots = headerValue(vercel, '/_dev/(.*)', 'X-Robots-Tag');
  if (robots === null || !robots.toLowerCase().includes('noindex')) {
    errors.push('Les pages SDD doivent porter X-Robots-Tag: noindex, nofollow (EF-1).');
  }
  const rawHeaders = Array.isArray(vercel?.headers) ? vercel.headers : [];
  const keys = rawHeaders.flatMap((entry) =>
    (entry.headers ?? []).map((header) => String(header.key ?? '').toLowerCase()),
  );
  if (keys.includes('content-security-policy')) {
    warnings.push(
      'vercel.json ne doit pas figer de CSP : la CSP à nonce est ajoutée par SPEC-805 (ET-5).',
    );
  }
  if (vercel?.env !== undefined || vercel?.build?.env !== undefined) {
    errors.push('vercel.json ne doit contenir aucun secret ni bloc env (ET-5).');
  }
  if (/sk-[A-Za-z0-9]|service_role|eyJhbGci|BEGIN [A-Z ]*PRIVATE KEY/.test(String(vercelRaw))) {
    errors.push('vercel.json semble contenir un secret (ET-5).');
  }
  return { errors, warnings };
}

function validateWorkflow(workflow, workflowError) {
  if (workflowError !== null && workflowError !== undefined)
    return { errors: [workflowError], warnings: [] };
  return validateDeployWorkflow(workflow);
}

/** Pure configuration validation: the environment is injected by the caller (ET-2). */
export function validateDeployment(input) {
  const {
    envName,
    env,
    managed,
    vercel,
    vercelRaw,
    workflow,
    workflowError,
    ref,
    branch,
    event,
    dryRun,
  } = input;
  const errors = [];
  const warnings = [];

  if (!DEPLOY_ENVS.includes(envName)) {
    errors.push(
      `Environnement de déploiement invalide : « ${envName ?? '(absent)'} » (preview|production).`,
    );
  }

  if (env.APP_ENV !== undefined && env.APP_ENV !== envName) {
    errors.push(`APP_ENV=${env.APP_ENV} ne correspond pas à l’environnement ${envName}.`);
  }
  if (!dryRun && env.APP_ENV !== envName) {
    errors.push(`APP_ENV=${envName} explicite est obligatoire pour un déploiement réel.`);
  }

  if (vercel?.error !== undefined && vercel?.error !== null) errors.push(vercel.error);
  const regions = validateRegions({ envName, env, managed, vercel: vercel?.config, dryRun });
  const headers = validateHeaders(vercel?.config, vercelRaw);
  const refResult = validateRef({ envName, ref, branch, event, dryRun });
  const workflowResult = validateWorkflow(workflow, workflowError);

  errors.push(...regions.errors, ...headers.errors, ...refResult.errors, ...workflowResult.errors);
  warnings.push(
    ...regions.warnings,
    ...headers.warnings,
    ...refResult.warnings,
    ...workflowResult.warnings,
  );

  const required = isProduction(envName) ? managed.productionRequiredKeys : PREVIEW_REQUIRED_KEYS;
  const missing = missingKeys(required, env);
  if (missing.length > 0) {
    const message = `Variables obligatoires manquantes : ${missing.join(', ')}.`;
    if (dryRun) warnings.push(`${message} (dépendances externes non configurées, EF-8).`);
    else errors.push(message);
  }

  if (isProduction(envName)) {
    const sdd = env.ENABLE_SDD_PAGES;
    if (sdd === 'true' || sdd === '1') {
      errors.push('Les pages SDD doivent être désactivées en production (CL-8).');
    } else if (sdd === undefined || sdd === '') {
      const message = 'ENABLE_SDD_PAGES=false doit être explicite en production.';
      if (dryRun) warnings.push(`${message} (valeur par défaut false dans packages/config).`);
      else errors.push(message);
    } else if (sdd !== 'false') {
      errors.push(`ENABLE_SDD_PAGES doit valoir false en production, reçu « ${sdd} ».`);
    }
  }

  const forbiddenPrefix = isProduction(envName) ? 'PREVIEW_' : 'PRODUCTION_';
  const leaked = Object.keys(env).filter((name) => name.startsWith(forbiddenPrefix));
  if (leaked.length > 0) {
    errors.push(
      `L’environnement ${envName} ne doit pas recevoir de variables ${forbiddenPrefix}* (${leaked.join(', ')}).`,
    );
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Planned actions, always with masked destinations (EF-4, EF-6). */
export function buildPlan({ envName, env }) {
  const database = maskDestination(env.SUPABASE_DB_URL ?? env.DATABASE_URL);
  const app = maskDestination(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL);
  const inngest = maskDestination(env.INNGEST_APP_URL);
  const backup = maskDestination(
    env.PRODUCTION_SUPABASE_BACKUP_REFERENCE ?? env.DEPLOY_BACKUP_REFERENCE,
  );
  const production = isProduction(envName);
  const actions = [
    {
      id: 'check',
      label: 'Vérifier régions, variables, ref et pages SDD',
      destination: 'dépôt local',
    },
  ];
  if (production) {
    actions.push({
      id: 'backup',
      label: 'Exiger un point de restauration documenté avant migration',
      destination: backup,
    });
  }
  actions.push(
    {
      id: 'migrate',
      label: 'Lister puis appliquer les migrations Supabase en attente',
      destination: database,
    },
    {
      id: 'sync-inngest',
      label: 'Synchroniser les fonctions Inngest de la ref déployée',
      destination: inngest,
    },
    {
      id: 'vercel',
      label: production
        ? 'Déployer Vercel en production (fra1)'
        : 'Déployer la preview Vercel (fra1)',
      destination: production ? app : UNCONFIGURED,
      note: production
        ? undefined
        : 'URL fournie par Vercel après déploiement, jamais construite ici.',
    },
    {
      id: 'smoke',
      label: 'Contrôler la santé /api/v1/health et les parcours critiques',
      destination: app,
    },
  );
  return actions;
}

function failureReport(message, input) {
  return {
    dryRun: input.dryRun === true,
    envName: input.envName ?? null,
    environment: input.envName ?? null,
    commit: input.env?.GIT_COMMIT ?? null,
    checkedAt: input.env?.CLOCK_FIXED_AT ?? null,
    status: 'invalid',
    regions: null,
    actions: [],
    warnings: [],
    errors: [message],
    destinations: { web: UNCONFIGURED, database: UNCONFIGURED, jobs: UNCONFIGURED },
  };
}

/** Reads the repository and produces a report. Never contacts a provider. */
export function runCheck(options = {}) {
  const root = options.root ?? ROOT;
  const env = options.env ?? {};
  const dryRun = options.dryRun === true;
  const envName = options.envName ?? env.APP_ENV ?? (dryRun ? 'preview' : undefined);
  const input = {
    root,
    env,
    dryRun,
    envName,
    ref: options.ref,
    branch: options.branch,
    event: options.event,
  };

  let managed;
  let vercel;
  try {
    managed = readManagedConfig(root);
    vercel = readVercelConfig(root);
  } catch (error) {
    const result = { ok: false, code: EXIT.config, report: failureReport(error.message, input) };
    return result;
  }

  const workflow = readDeployWorkflow(root);
  const validation = validateDeployment({
    envName,
    env,
    managed,
    vercel,
    vercelRaw: vercel.raw,
    workflow: workflow.doc,
    workflowError: workflow.error,
    ref: options.ref,
    branch: options.branch,
    event: options.event,
    dryRun,
  });

  const report = {
    dryRun,
    envName: envName ?? null,
    environment: envName ?? null,
    commit: env.GIT_COMMIT ?? null,
    checkedAt: env.CLOCK_FIXED_AT ?? null,
    workflow: DEPLOY_WORKFLOW,
    status: validation.errors.length === 0 ? 'ok' : 'invalid',
    regions: managed.regions,
    actions: buildPlan({ envName, env }),
    warnings: validation.warnings,
    errors: validation.errors,
    destinations: {
      web: maskDestination(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL),
      database: maskDestination(env.SUPABASE_DB_URL ?? env.DATABASE_URL),
      jobs: maskDestination(env.INNGEST_APP_URL),
    },
  };
  const ok = validation.errors.length === 0;
  return { ok, code: ok ? EXIT.ok : EXIT.config, report };
}

export function formatReport(result) {
  const { report } = result;
  const lines = [
    `Déploiement géré — contrôle ${report.dryRun ? '--dry-run' : 'réel'}`,
    `Environnement : ${report.envName ?? UNCONFIGURED}`,
    `Commit : ${report.commit ?? 'n/a'}`,
    `Contrôle : ${report.checkedAt ?? 'horloge non fournie'}`,
    `Workflow : ${report.workflow}`,
  ];
  if (report.regions !== null) {
    lines.push(
      `Régions : Vercel ${report.regions.vercel} · Supabase ${report.regions.supabase} · Inngest ${report.regions.inngest}`,
    );
  }
  for (const action of report.actions) {
    lines.push(`→ ${action.id} : ${action.label} — ${action.destination}`);
  }
  for (const warning of report.warnings) lines.push(`⚠ ${warning}`);
  for (const error of report.errors) lines.push(`✖ ${error}`);
  if (report.dryRun) {
    lines.push('Aucun appel réseau, aucune migration, aucun déploiement (--dry-run).');
  }
  return lines.join('\n');
}

const invoked =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invoked) {
  const argv = process.argv.slice(2);
  const envName = argValue(argv, '--env');
  const result = runCheck({
    env: process.env,
    envName,
    dryRun: hasFlag(argv, '--dry-run'),
    ref: argValue(argv, '--ref'),
    branch: argValue(argv, '--branch'),
    event: argValue(argv, '--event'),
  });
  if (hasFlag(argv, '--json')) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(formatReport(result));
  }
  process.exit(result.code);
}
