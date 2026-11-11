// Validation of the deployment workflow without contacting GitHub (SPEC-013, ET-1).
// The same rules run in `pnpm ci:check`, in the unit/integration tests and in `--dry-run`.
import { parse } from 'yaml';

import { DEPLOY_WORKFLOW, readText } from './lib.mjs';

export const DEPLOY_JOBS = Object.freeze(['preview', 'production']);
export const DEPLOY_SCRIPTS = Object.freeze([
  'tools/deploy/check.mjs',
  'tools/deploy/migrate.mjs',
  'tools/deploy/sync-inngest.mjs',
]);

const ACTION_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?:v\d+|\d+\.\d+\.\d+|[0-9a-f]{40})$/;

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalize(value) {
  return typeof value === 'string' ? value.replaceAll(' ', '') : '';
}

function stepsOf(job) {
  return asArray(job?.steps).filter((step) => step !== null && typeof step === 'object');
}

function envOf(job) {
  const entries = { ...(job?.env ?? {}) };
  for (const step of stepsOf(job)) Object.assign(entries, step.env ?? {});
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, String(value)]));
}

function runsOf(job) {
  return stepsOf(job)
    .map((step) => (typeof step.run === 'string' ? step.run : ''))
    .filter((run) => run !== '');
}

function usesOf(doc) {
  const uses = [];
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    for (const step of stepsOf(job)) {
      if (typeof step.uses === 'string') uses.push({ jobId, uses: step.uses });
    }
  }
  return uses;
}

/** Raw YAML of a job (its secrets are only read, never printed by the caller). */
export function jobRaw(step) {
  return JSON.stringify(step);
}

export function environmentName(job) {
  const environment = job?.environment;
  if (typeof environment === 'string') return environment;
  if (environment !== null && typeof environment === 'object')
    return String(environment.name ?? '');
  return '';
}

function secretNames(job) {
  const raw = jobRaw(job);
  return [...raw.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
}

function indexOfRun(job, needle) {
  return runsOf(job).findIndex((run) => run.includes(needle));
}

export function readDeployWorkflow(root) {
  const file = `${root}/${DEPLOY_WORKFLOW}`;
  const raw = readText(file);
  if (raw === null) return { raw: null, doc: null, error: `${DEPLOY_WORKFLOW} est absent.` };
  try {
    return { raw, doc: parse(raw), error: null };
  } catch (error) {
    return { raw, doc: null, error: `${DEPLOY_WORKFLOW} : YAML invalide — ${error.message}` };
  }
}

/**
 * Structural rules of ET-1/EF-3/CL-3/CL-4. Returns errors; never throws on a mutated fixture.
 */
export function validateDeployWorkflow(doc) {
  const errors = [];
  const warnings = [];
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    return { errors: ['Le workflow de déploiement est illisible.'], warnings };
  }

  // Trigger: only a successful CI run for the exact ref may start a deployment.
  const workflowRun = doc.on?.workflow_run;
  if (workflowRun === undefined) {
    errors.push('deploy.yml doit être déclenché par workflow_run.');
  } else {
    if (!asArray(workflowRun.workflows).map(String).includes('CI')) {
      errors.push('deploy.yml doit attendre le workflow CI.');
    }
    if (!asArray(workflowRun.types).map(String).includes('completed')) {
      errors.push('deploy.yml doit attendre la fin (completed) de la CI.');
    }
  }

  if (doc.permissions?.contents !== 'read') {
    errors.push('deploy.yml doit déclarer permissions: contents: read.');
  }
  for (const value of Object.values(doc.permissions ?? {})) {
    if (String(value) === 'write')
      errors.push('deploy.yml ne doit demander aucun droit d’écriture.');
  }

  const jobs = doc.jobs ?? {};
  for (const id of DEPLOY_JOBS) {
    if (!Object.hasOwn(jobs, id)) errors.push(`Job de déploiement absent : ${id}.`);
  }

  for (const [jobId, job] of Object.entries(jobs)) {
    if ((job?.outputs ?? undefined) !== undefined) {
      const raw = JSON.stringify(job.outputs);
      if (raw.includes('secrets.')) {
        errors.push(`Le job ${jobId} ne doit publier aucun secret en sortie (ET-1).`);
      }
    }
    for (const step of stepsOf(job)) {
      if (step['continue-on-error'] === true) {
        errors.push(`continue-on-error interdit dans deploy.yml (job ${jobId}).`);
      }
      const run = typeof step.run === 'string' ? step.run : '';
      if (run.includes('secrets.')) {
        errors.push(`Aucun secret ne doit être interpolé dans un script (job ${jobId}).`);
      }
      if (/\|\|\s*true/.test(run)) {
        errors.push(`Un contrôle de déploiement ne doit pas être contourné (job ${jobId}).`);
      }
      if (run.includes('set-output')) {
        errors.push(`set-output est interdit (job ${jobId}).`);
      }
    }
    for (const use of usesOf({ jobs: { [jobId]: job } })) {
      if (use.uses.startsWith('docker://') || use.uses.startsWith('./')) continue;
      if (!ACTION_REF.test(use.uses)) {
        errors.push(`Action non épinglée dans deploy.yml : ${use.uses} (job ${jobId}).`);
      }
    }
  }

  const preview = jobs.preview;
  const production = jobs.production;
  if (preview !== undefined) {
    const condition = normalize(preview.if);
    if (!condition.includes("github.event.workflow_run.event=='pull_request'")) {
      errors.push('Le job preview doit répondre à une pull request.');
    }
    if (!condition.includes("github.event.workflow_run.conclusion=='success'")) {
      errors.push('Le job preview exige une CI verte.');
    }
    if (!condition.includes("github.event.workflow_run.head_branch!='main'")) {
      errors.push('Le job preview ne doit jamais déployer main.');
    }
    if (environmentName(preview) !== 'preview') {
      errors.push('Le job preview doit utiliser l’environnement GitHub preview.');
    }
    const env = envOf(preview);
    if (env.ENABLE_SDD_PAGES !== 'true') {
      errors.push('La preview doit activer les pages SDD (ENABLE_SDD_PAGES: true).');
    }
    const secrets = secretNames(preview);
    if (secrets.some((name) => name.startsWith('PRODUCTION_'))) {
      errors.push('La preview ne doit référencer aucun secret PRODUCTION_* (EF-2).');
    }
    checkOrder(preview, errors, 'preview', false);
    checkCheckout(preview, errors, 'preview');
  }

  if (production !== undefined) {
    const condition = normalize(production.if);
    if (!condition.includes("github.event.workflow_run.event=='push'")) {
      errors.push('Le job production doit répondre à un push.');
    }
    if (!condition.includes("github.event.workflow_run.conclusion=='success'")) {
      errors.push('Le job production exige une CI verte.');
    }
    if (!condition.includes("startsWith(github.event.workflow_run.head_branch,'v')")) {
      errors.push('Le job production doit exiger un tag v*.');
    }
    if (environmentName(production) !== 'production') {
      errors.push('Le job production doit utiliser l’environnement GitHub production.');
    }
    const env = envOf(production);
    if (env.ENABLE_SDD_PAGES !== 'false') {
      errors.push('La production doit désactiver les pages SDD (ENABLE_SDD_PAGES: false).');
    }
    const secrets = secretNames(production);
    if (secrets.some((name) => name.startsWith('PREVIEW_'))) {
      errors.push('La production ne doit référencer aucun secret PREVIEW_* (EF-2).');
    }
    const run = runsOf(production).join('\n');
    if (!run.includes('git merge-base --is-ancestor') || !run.includes('origin/main')) {
      errors.push('La production doit vérifier que le tag appartient à main (CL-3).');
    }
    if (!run.includes('--backup')) {
      errors.push('La production doit fournir un point de restauration à la migration (EF-5).');
    }
    if (!run.includes('vercel') || !run.includes('--prod')) {
      errors.push('La production doit déployer Vercel avec --prod.');
    }
    checkOrder(production, errors, 'production', true);
    checkCheckout(production, errors, 'production');
  }

  if (preview !== undefined && production !== undefined) {
    if (environmentName(preview) === environmentName(production)) {
      warnings.push('Les environnements GitHub preview et production doivent rester distincts.');
    }
    const previewSecrets = new Set(secretNames(preview));
    const shared = secretNames(production).filter(
      (name) =>
        previewSecrets.has(name) && !name.startsWith('PREVIEW_') && !name.startsWith('PRODUCTION_'),
    );
    if (shared.length > 0) {
      warnings.push(
        `Secrets non préfixés partagés entre preview et production : ${shared.join(', ')} (vérifier l’isolation).`,
      );
    }
  }

  return { errors, warnings };
}

function checkCheckout(job, errors, id) {
  const checkout = stepsOf(job).find(
    (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'),
  );
  if (checkout === undefined) {
    errors.push(`Le job ${id} doit extraire la ref validée (actions/checkout).`);
    return;
  }
  const withInput = checkout.with ?? {};
  if (!String(withInput.ref ?? '').includes('github.event.workflow_run.head_sha')) {
    errors.push(`Le job ${id} doit extraire exactement github.event.workflow_run.head_sha.`);
  }
  if (!Object.hasOwn(withInput, 'fetch-depth')) {
    errors.push(`Le job ${id} doit récupérer l’historique (fetch-depth explicite).`);
  }
}

function checkOrder(job, errors, id, production) {
  const positions = {
    check: indexOfRun(job, 'tools/deploy/check.mjs'),
    migrate: indexOfRun(job, 'tools/deploy/migrate.mjs'),
    sync: indexOfRun(job, 'tools/deploy/sync-inngest.mjs'),
    vercel: indexOfRun(job, 'vercel'),
    smoke: indexOfRun(job, 'curl --fail'),
  };
  for (const [name, index] of Object.entries(positions)) {
    if (index < 0) errors.push(`Le job ${id} doit exécuter l’étape ${name}.`);
  }
  if (production) {
    const backup = runsOf(job).findIndex((run) => run.includes('BACKUP_REFERENCE'));
    if (backup < 0) errors.push('La production doit vérifier la référence de sauvegarde.');
    else if (backup > positions.migrate && positions.migrate >= 0) {
      errors.push('La sauvegarde doit être vérifiée avant la migration.');
    }
  }
  if (positions.check >= 0 && positions.migrate >= 0 && positions.check > positions.migrate) {
    errors.push('Le contrôle de configuration doit précéder la migration.');
  }
  if (positions.migrate >= 0 && positions.sync >= 0 && positions.migrate > positions.sync) {
    errors.push('La migration doit précéder la synchronisation Inngest.');
  }
  if (positions.sync >= 0 && positions.vercel >= 0 && positions.sync > positions.vercel) {
    errors.push('La synchronisation Inngest doit précéder le déploiement web.');
  }
  if (positions.vercel >= 0 && positions.smoke >= 0 && positions.vercel > positions.smoke) {
    errors.push('Le déploiement web doit précéder le contrôle de fumée.');
  }
  if (positions.smoke >= 0) {
    const smoke = runsOf(job).find((run) => run.includes('curl --fail')) ?? '';
    if (!smoke.includes('/api/v1/health')) {
      errors.push(`Le contrôle de fumée ${id} doit appeler /api/v1/health.`);
    }
  }
}

export const DEPLOY_JOB_STEPS = Object.freeze({
  check: 'Vérifier la configuration',
  backup: 'Point de restauration',
  migrate: 'Migration Supabase',
  sync: 'Synchronisation Inngest',
  web: 'Déploiement Vercel',
  smoke: 'Contrôle de fumée',
});
