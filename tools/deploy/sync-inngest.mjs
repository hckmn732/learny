#!/usr/bin/env node
// Synchronises the Inngest functions of the deployed ref and checks the result (SPEC-013, ET-4).
// The provider is never contacted by `--dry-run`; an absent function or a non-EU region fails.
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
  isEuRegion,
  isLocalUrl,
  maskDestination,
  readManagedConfig,
} from './lib.mjs';

/** Function identifiers of the build: exported `*_ID` constants of packages/jobs (ET-4). */
export function readExpectedFunctions(root = ROOT) {
  const dir = path.join(root, 'packages/jobs/src/functions');
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const ids = new Set();
  for (const file of files.sort()) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(/export const [A-Z0-9_]+_ID\s*=\s*'([^']+)'/g)) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

function endpoint(appUrl) {
  const base = String(appUrl ?? '').replace(/\/+$/, '');
  return base.endsWith('/api/inngest') ? base : `${base}/api/inngest`;
}

function inspection(payload) {
  const functions = Array.isArray(payload?.functions)
    ? payload.functions.map((entry) =>
        typeof entry === 'string' ? entry : String(entry?.id ?? entry?.slug ?? entry?.name ?? ''),
      )
    : null;
  const count = Number(
    payload?.functionsFound ?? payload?.functionCount ?? payload?.functions?.length ?? Number.NaN,
  );
  return { functions, count };
}

export function validateSyncConfig({ envName, env, appUrl, region, expectedFunctions, dryRun }) {
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
  if (region === undefined || region === '') {
    const message = 'INNGEST_REGION est absente : région du fournisseur non vérifiée.';
    if (dryRun) warnings.push(message);
    else errors.push(message);
  }
  if (appUrl === undefined || appUrl === '') {
    const message = 'INNGEST_APP_URL est absente : URL fournie par le fournisseur attendue.';
    if (dryRun) warnings.push(message);
    else errors.push(message);
  } else if (isLocalUrl(appUrl)) {
    errors.push('Une synchronisation distante refuse une URL locale.');
  } else if (!/^https:\/\//.test(String(appUrl))) {
    errors.push('INNGEST_APP_URL doit être une URL HTTPS.');
  }
  if (!Array.isArray(expectedFunctions) || expectedFunctions.length === 0) {
    errors.push('Aucune fonction Inngest attendue n’a été trouvée dans le build.');
  }
  return { errors, warnings };
}

/**
 * Calls the Inngest endpoint (GET introspection, then PUT sync) and verifies function presence.
 * `fetchImpl` is injectable: the integration test proves that `--dry-run` never calls it.
 */
export async function runSync(options = {}) {
  const root = options.root ?? ROOT;
  const env = options.env ?? {};
  const envName = options.envName ?? env.APP_ENV;
  const dryRun = options.dryRun === true;
  const managed = (() => {
    try {
      return readManagedConfig(root);
    } catch {
      return null;
    }
  })();
  const expectedFunctions = options.functions ?? readExpectedFunctions(root);
  const region = options.region ?? env.INNGEST_REGION;
  const appUrl = options.appUrl ?? env.INNGEST_APP_URL;
  const commit = options.commit ?? env.GIT_COMMIT ?? null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = {
    dryRun,
    envName: envName ?? null,
    mode: dryRun ? 'dry-run' : 'sync',
    commit,
    region: region ?? UNCONFIGURED,
    app: maskDestination(appUrl),
    functions: expectedFunctions,
    synced: false,
    inspected: false,
  };

  if (managed === null) {
    return {
      code: EXIT.config,
      ok: false,
      report: {
        ...base,
        status: 'invalid',
        errors: ['HOSTING_REGIONS est illisible.'],
        warnings: [],
      },
    };
  }
  const expectedRegion = managed.regions.inngest;
  const validation = validateSyncConfig({
    envName,
    env,
    appUrl,
    region,
    expectedFunctions,
    dryRun,
  });
  if (region !== undefined && region !== '') {
    if (!isEuRegion(String(region), managed.euRegions)) {
      validation.errors.push(`Région Inngest hors UE refusée : ${String(region)} (CL-1).`);
    } else if (String(region) !== expectedRegion) {
      validation.errors.push(
        `Région Inngest inattendue (${String(region)}) : ${expectedRegion} attendue.`,
      );
    }
  }

  if (validation.errors.length > 0) {
    return {
      code: EXIT.config,
      ok: false,
      report: {
        ...base,
        status: 'invalid',
        errors: validation.errors,
        warnings: validation.warnings,
      },
    };
  }

  if (dryRun) {
    return {
      code: EXIT.ok,
      ok: true,
      report: {
        ...base,
        status: 'ok',
        errors: [],
        warnings: [
          ...validation.warnings,
          'Synchronisation non exécutée : introspection et PUT seraient envoyés en mode réel.',
        ],
      },
    };
  }

  const url = endpoint(appUrl);
  const headers = { 'content-type': 'application/json' };
  if (env.INNGEST_SIGNING_KEY !== undefined && env.INNGEST_SIGNING_KEY !== '') {
    headers['x-inngest-signing-key'] = env.INNGEST_SIGNING_KEY;
  }

  let before;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers });
    if (!response.ok) {
      return {
        code: EXIT.external,
        ok: false,
        report: {
          ...base,
          status: 'external',
          errors: [`Introspection Inngest en échec (HTTP ${String(response.status)}).`],
          warnings: validation.warnings,
        },
      };
    }
    before = inspection(await response.json());
  } catch (error) {
    return {
      code: EXIT.external,
      ok: false,
      report: {
        ...base,
        status: 'external',
        errors: [
          `Service Inngest indisponible : ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: validation.warnings,
      },
    };
  }

  const beforeErrors = compareFunctions(before, expectedFunctions);
  if (beforeErrors.length > 0) {
    return {
      code: EXIT.config,
      ok: false,
      report: {
        ...base,
        status: 'failed',
        inspected: true,
        errors: beforeErrors,
        warnings: validation.warnings,
      },
    };
  }

  try {
    const response = await fetchImpl(url, { method: 'PUT', headers, body: '{}' });
    if (!response.ok) {
      return {
        code: EXIT.external,
        ok: false,
        report: {
          ...base,
          status: 'external',
          inspected: true,
          errors: [`Synchronisation Inngest en échec (HTTP ${String(response.status)}).`],
          warnings: validation.warnings,
        },
      };
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.error !== undefined) {
      return {
        code: EXIT.config,
        ok: false,
        report: {
          ...base,
          status: 'failed',
          inspected: true,
          errors: [`Inngest a refusé la synchronisation : ${String(payload.error)}`],
          warnings: validation.warnings,
        },
      };
    }
    const after = inspection(payload);
    const afterErrors = compareFunctions(after, expectedFunctions);
    if (afterErrors.length > 0) {
      return {
        code: EXIT.config,
        ok: false,
        report: {
          ...base,
          status: 'failed',
          inspected: true,
          errors: afterErrors,
          warnings: validation.warnings,
        },
      };
    }
  } catch (error) {
    return {
      code: EXIT.external,
      ok: false,
      report: {
        ...base,
        status: 'external',
        inspected: true,
        errors: [
          `Synchronisation Inngest indisponible : ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: validation.warnings,
      },
    };
  }

  return {
    code: EXIT.ok,
    ok: true,
    report: {
      ...base,
      status: 'ok',
      inspected: true,
      synced: true,
      errors: [],
      warnings: validation.warnings,
    },
  };
}

function compareFunctions(result, expectedFunctions) {
  const errors = [];
  if (result.functions !== null) {
    const missing = expectedFunctions.filter((id) => !result.functions.includes(id));
    if (missing.length > 0)
      errors.push(`Fonctions Inngest absentes : ${missing.join(', ')} (CL-7).`);
    return errors;
  }
  if (Number.isFinite(result.count)) {
    if (result.count < expectedFunctions.length) {
      errors.push(
        `Fonctions Inngest synchronisées insuffisantes : ${String(result.count)} < ${String(expectedFunctions.length)} (CL-7).`,
      );
    }
    return errors;
  }
  errors.push('Réponse d’introspection Inngest sans liste ni nombre de fonctions (CL-7).');
  return errors;
}

export function formatSyncReport(result) {
  const { report } = result;
  const lines = [
    `Synchronisation Inngest — ${report.mode}`,
    `Environnement : ${report.envName ?? UNCONFIGURED}`,
    `Commit : ${report.commit ?? 'n/a'}`,
    `Région : ${report.region}`,
    `Endpoint : ${report.app}`,
    `Fonctions attendues : ${report.functions.join(', ') || 'aucune'}`,
    `Résultat : ${report.synced ? 'synchronisées et vérifiées' : 'aucune synchronisation'}`,
  ];
  for (const warning of report.warnings) lines.push(`⚠ ${warning}`);
  for (const error of report.errors) lines.push(`✖ ${error}`);
  if (report.dryRun) lines.push('Aucun appel réseau (--dry-run).');
  return lines.join('\n');
}

const invoked =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invoked) {
  const argv = process.argv.slice(2);
  const functions = argValue(argv, '--functions');
  const result = await runSync({
    env: process.env,
    envName: argValue(argv, '--env') ?? process.env.APP_ENV,
    dryRun: hasFlag(argv, '--dry-run'),
    appUrl: argValue(argv, '--app-url'),
    region: argValue(argv, '--region'),
    commit: argValue(argv, '--commit'),
    functions:
      functions === undefined || functions === ''
        ? undefined
        : functions
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
  });
  if (hasFlag(argv, '--json')) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(formatSyncReport(result));
  }
  process.exit(result.code);
}
