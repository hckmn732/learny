// Validation locale des workflows GitHub Actions (SPEC-011, EF-9 et ET-3).
// Le module est importé par `pnpm ci:check` (CLI), par les tests et par la page SDD : il ne
// contacte jamais l'API GitHub et n'écrit aucun fichier.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const PR_TITLE_WORKFLOW = '.github/workflows/pr-title.yml';
export const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';

/** Modes simulés et horloge imposés (EF-8, ADR-0047, ADR-0048). */
export const REQUIRED_ENV = Object.freeze({
  CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
  LLM_MODE: 'mock',
  STRIPE_MODE: 'mock',
  EMAIL_MODE: 'memory',
  PUSH_MODE: 'mock',
  ENABLE_SDD_PAGES: 'true',
});

/** Scripts pnpm que le workflow doit référencer ou que le dépôt doit fournir. */
export const REQUIRED_SCRIPTS = Object.freeze([
  'lint',
  'typecheck',
  'build',
  'test:unit',
  'test:int',
  'test:e2e',
  'db:reset',
  'db:seed:demo',
  'ci:check',
]);

export const REQUIRED_JOBS = Object.freeze(['audit', 'secrets', 'quality', 'integration', 'e2e']);
export const APP_JOBS = Object.freeze(['quality', 'integration', 'e2e']);
export const REQUIRED_ARTIFACTS = Object.freeze([
  'audit-reports',
  'security-reports',
  'unit-reports',
  'integration-reports',
  'e2e-reports',
]);
export const AUDIT_LEVELS = Object.freeze(['low', 'moderate', 'high', 'critical']);

// pnpm subcommands that are not package scripts.
const PNPM_BUILTINS = new Set([
  'add',
  'audit',
  'config',
  'dedupe',
  'dlx',
  'env',
  'exec',
  'fetch',
  'import',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'prune',
  'publish',
  'rebuild',
  'recursive',
  'remove',
  'root',
  'run',
  'setup',
  'store',
  'unlink',
  'update',
  'why',
]);

const ACTION_REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?:v\d+|\d+\.\d+\.\d+|[0-9a-f]{40})$/;

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function parseWorkflow(root, relative) {
  const file = path.join(root, relative);
  const raw = readText(file);
  if (raw === null) return { raw: null, doc: null, error: `${relative} est absent.` };
  try {
    return { raw, doc: parse(raw), error: null };
  } catch (error) {
    return { raw, doc: null, error: `${relative} : YAML invalide — ${error.message}` };
  }
}

/** Lit et analyse les deux workflows ; les erreurs de syntaxe sont retournées, jamais levées. */
export function readWorkflows(root = ROOT) {
  const ci = parseWorkflow(root, CI_WORKFLOW);
  const prTitle = parseWorkflow(root, PR_TITLE_WORKFLOW);
  const parseErrors = [ci.error, prTitle.error].filter(Boolean);
  return {
    root,
    ci: ci.doc,
    ciRaw: ci.raw,
    prTitle: prTitle.doc,
    prTitleRaw: prTitle.raw,
    parseErrors,
  };
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function stepsOf(job) {
  return asArray(job?.steps).filter((step) => step !== null && typeof step === 'object');
}

export function runsOf(job) {
  return stepsOf(job)
    .map((step) => (typeof step.run === 'string' ? step.run : null))
    .filter((run) => run !== null);
}

function normalized(value) {
  return typeof value === 'string' ? value.replaceAll(' ', '') : '';
}

function asStringMap(mapping) {
  const out = {};
  if (mapping === null || typeof mapping !== 'object') return out;
  for (const [key, value] of Object.entries(mapping)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/** Artefacts publiés par un job (upload-artifact), avec leur conservation explicite. */
function resolveRetention(value, env) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  const expression = /^\$\{\{\s*env\.([A-Z0-9_]+)\s*\}\}$/.exec(text);
  if (expression) return Number(asStringMap(env)[expression[1]] ?? 0);
  return Number(text);
}

export function artifactsOf(job, env = {}) {
  return stepsOf(job)
    .filter(
      (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/upload-artifact@'),
    )
    .map((step) => {
      const withInput = step.with ?? {};
      return {
        name: String(withInput.name ?? ''),
        paths: String(withInput.path ?? ''),
        retentionDays: resolveRetention(withInput['retention-days'], env),
        always: normalized(step.if).includes('always()'),
        ifNoFilesFound: String(withInput['if-no-files-found'] ?? ''),
      };
    });
}

/** Vue normalisée de la configuration, utilisée par la page SDD (aucun résultat inventé). */
export function describeCi(workflows) {
  const ci = workflows.ci ?? {};
  const jobs = ci.jobs ?? {};
  const described = REQUIRED_JOBS.filter((id) => Object.hasOwn(jobs, id)).map((id) => ({
    id,
    name: String(jobs[id]?.name ?? id),
    needs: asArray(jobs[id]?.needs).map(String),
    condition: String(jobs[id]?.if ?? ''),
    artifacts: artifactsOf(jobs[id], ci.env),
  }));

  const securityJob = jobs.secrets;
  const secretSteps = stepsOf(securityJob);
  const securityRuns = runsOf(securityJob).join('\n');
  const auditRun = securityRuns.match(/pnpm audit[^\n]*/)?.[0] ?? null;
  const auditLevel = /--audit-level="?\$\{?AUDIT_LEVEL\}?"?/.test(auditRun ?? '')
    ? String(asStringMap(ci.env).AUDIT_LEVEL ?? '')
    : (/-{1,2}audit-level[= ]([a-z]+)/.exec(auditRun ?? '')?.[1] ?? null);

  const prTitleJob = workflows.prTitle?.jobs?.title;
  const prTitleRuns = runsOf(prTitleJob).join('\n');

  return {
    triggers: {
      push: asArray(ci.on?.push?.branches).map(String),
      pullRequest: ci.on !== null && typeof ci.on === 'object' && 'pull_request' in ci.on,
      workflowDispatch: ci.on !== null && typeof ci.on === 'object' && 'workflow_dispatch' in ci.on,
    },
    permissions: asStringMap(ci.permissions),
    env: asStringMap(ci.env),
    jobs: described,
    artifacts: described.flatMap((job) =>
      job.artifacts.map((artifact) => ({ ...artifact, job: job.id })),
    ),
    security: {
      gitleaks: secretSteps.some(
        (step) =>
          typeof step.uses === 'string' && step.uses.startsWith('gitleaks/gitleaks-action@'),
      ),
      builtinScanner: securityRuns.includes('tools/security/check-secrets.ts --all'),
      auditLevel,
      prTitle: {
        configured: prTitleJob !== undefined,
        trigger: asArray(workflows.prTitle?.on?.pull_request?.types).map(String),
        commitlint: prTitleRuns.includes('commitlint'),
      },
    },
  };
}

function pushIncludes(push, branch) {
  return asArray(push?.branches).map(String).includes(branch);
}

function collectUses(doc) {
  const uses = [];
  const jobs = doc?.jobs ?? {};
  for (const [jobId, job] of Object.entries(jobs)) {
    for (const step of stepsOf(job)) {
      if (typeof step.uses === 'string') uses.push({ jobId, uses: step.uses });
    }
  }
  return uses;
}

function hasWritePermission(permissions) {
  if (permissions === null || typeof permissions !== 'object') return false;
  return Object.values(permissions).some((value) => String(value) === 'write');
}

function isCacheStep(step) {
  const uses = typeof step.uses === 'string' ? step.uses : '';
  const name = typeof step.name === 'string' ? step.name.toLowerCase() : '';
  return uses.startsWith('actions/cache@') || name.includes('cache');
}

function referencedScripts(doc) {
  const found = new Set();
  const jobs = doc?.jobs ?? {};
  for (const job of Object.values(jobs)) {
    for (const run of runsOf(job)) {
      for (const match of run.matchAll(/pnpm\s+((?:-[^\s]+\s+)*)([A-Za-z][\w:.-]*)/g)) {
        const token = match[2];
        if (PNPM_BUILTINS.has(token)) continue;
        found.add(token);
      }
    }
  }
  return [...found];
}

/**
 * Règles de structure, testables sur des documents en mémoire (CA-1 à CA-4, CL-3, CL-4).
 * `actionlint` : { available, code, output } ; `act` : booléen.
 */
export function validateWorkflows({ workflows, scripts, actionlint, act }) {
  const errors = [];
  const warnings = [];
  for (const message of workflows.parseErrors ?? []) errors.push(message);

  const ci = workflows.ci;
  const prTitle = workflows.prTitle;
  const ciJobs = ci?.jobs ?? {};
  const prTitleJobs = prTitle?.jobs ?? {};

  if (ci !== null && ci !== undefined) {
    // EF-1 : déclencheurs complets.
    if (!pushIncludes(ci.on?.push, 'main')) errors.push('Déclencheur push absent pour main.');
    for (const branch of ['spec/**', 'fix/**', 'release/**']) {
      if (!pushIncludes(ci.on?.push, branch))
        errors.push(`Déclencheur push absent pour ${branch}.`);
    }
    if (!(ci.on !== null && typeof ci.on === 'object' && 'pull_request' in ci.on)) {
      errors.push('Déclencheur pull_request absent.');
    }
    if (!(ci.on !== null && typeof ci.on === 'object' && 'workflow_dispatch' in ci.on)) {
      errors.push('Déclencheur workflow_dispatch absent.');
    }

    // ET-1 : permissions minimales.
    if (ci.permissions?.contents !== 'read') {
      errors.push('permissions: contents: read est obligatoire au niveau du workflow.');
    }
    if (hasWritePermission(ci.permissions)) {
      errors.push('Le workflow ne doit demander aucun droit d’écriture (contents: read).');
    }
    for (const [jobId, job] of Object.entries(ciJobs)) {
      if (hasWritePermission(job?.permissions)) {
        errors.push(`Le job ${jobId} demande un droit d’écriture non justifié.`);
      }
    }

    // EF-8 : modes et horloge.
    const env = asStringMap(ci.env);
    for (const [name, expected] of Object.entries(REQUIRED_ENV)) {
      const actual = env[name];
      if (actual === expected) continue;
      if (name === 'ENABLE_SDD_PAGES' && actual === '1') {
        errors.push(
          "ENABLE_SDD_PAGES: '1' est refusé : le garde de SPEC-001/006 exige la valeur exacte 'true' (CL-3).",
        );
      } else {
        errors.push(
          `Variable ${name} : « ${actual ?? '(absente)'} » au lieu de « ${expected} » (EF-8).`,
        );
      }
    }

    // EF-1 / CL-1 : les jobs applicatifs dépendent de la détection du lockfile.
    for (const id of REQUIRED_JOBS) {
      if (!Object.hasOwn(ciJobs, id)) errors.push(`Job obligatoire absent : ${id}.`);
    }
    const auditJob = ciJobs.audit;
    if (auditJob !== undefined) {
      const detect = stepsOf(auditJob).find((step) => step.id === 'detect');
      const detectRun = typeof detect?.run === 'string' ? detect.run : '';
      if (!detectRun.includes('-f pnpm-lock.yaml')) {
        errors.push('Le job audit doit détecter pnpm-lock.yaml (CL-1).');
      }
      if (!detectRun.includes('has_app=')) {
        errors.push('La détection du lockfile doit produire la sortie has_app.');
      }
      if (!String(auditJob.outputs?.has_app ?? '').includes('steps.detect.outputs.has_app')) {
        errors.push('Le job audit doit exposer outputs.has_app.');
      }
    }

    for (const id of APP_JOBS) {
      const job = ciJobs[id];
      if (job === undefined) continue;
      if (!asArray(job.needs).map(String).includes('audit')) {
        errors.push(`Le job ${id} doit dépendre du job audit (needs: audit).`);
      }
      if (!normalized(job.if).includes("needs.audit.outputs.has_app=='true'")) {
        errors.push(
          `Le job ${id} doit être conditionné par needs.audit.outputs.has_app == 'true'.`,
        );
      }
      if (!runsOf(job).some((run) => run.includes('pnpm install --frozen-lockfile'))) {
        errors.push(`Le job ${id} doit relancer pnpm install --frozen-lockfile (ET-2).`);
      }
    }

    const allRuns = (id) => runsOf(ciJobs[id]).join('\n');

    // EF-2 : commandes réellement exécutées.
    const quality = allRuns('quality');
    for (const command of ['pnpm lint', 'pnpm typecheck', 'pnpm build']) {
      if (!quality.includes(command)) errors.push(`Le job quality doit exécuter « ${command} ».`);
    }
    if (!/pnpm test:unit[^\n]*--coverage/.test(quality)) {
      errors.push('Le job quality doit exécuter les tests unitaires avec --coverage.');
    }

    const integration = allRuns('integration');
    for (const command of ['supabase start', 'pnpm db:reset', 'pnpm test:int']) {
      if (!integration.includes(command)) {
        errors.push(`Le job integration doit exécuter « ${command} ».`);
      }
    }

    const e2e = allRuns('e2e');
    for (const command of [
      'playwright install --with-deps chromium',
      'supabase start',
      'pnpm db:reset',
      'pnpm db:seed:demo',
      'pnpm build',
      'pnpm test:e2e',
    ]) {
      if (!e2e.includes(command)) errors.push(`Le job e2e doit exécuter « ${command} ».`);
    }
    if (!e2e.includes('locale-gen fr_FR.UTF-8')) {
      errors.push('Le job e2e doit installer la locale française (ET-2).');
    }
    if (!/apt-get install[^\n]*fonts-/.test(e2e)) {
      errors.push('Le job e2e doit installer les polices requises (ET-2).');
    }

    // EF-4 / EF-5 : secrets et dépendances.
    const securityJob = ciJobs.secrets;
    if (securityJob !== undefined) {
      const steps = stepsOf(securityJob);
      if (
        !steps.some(
          (step) =>
            typeof step.uses === 'string' && step.uses.startsWith('gitleaks/gitleaks-action@'),
        )
      ) {
        errors.push('Le job secrets doit exécuter gitleaks (EF-4).');
      }
      if (!allRuns('secrets').includes('tools/security/check-secrets.ts --all')) {
        errors.push('Le job secrets doit exécuter l’analyseur intégré (EF-4).');
      }
      const auditRun = allRuns('secrets').match(/pnpm audit[^\n]*/)?.[0] ?? '';
      if (!auditRun.includes('--audit-level')) {
        errors.push('pnpm audit doit fixer explicitement --audit-level (EF-5).');
      }
      const level = /audit-level[= ]"?([a-z]+)/.exec(auditRun)?.[1];
      const resolvedLevel =
        level === '${audit_level}' || auditRun.includes('${AUDIT_LEVEL}') ? env.AUDIT_LEVEL : level;
      if (resolvedLevel === undefined || !AUDIT_LEVELS.includes(resolvedLevel)) {
        errors.push(
          `Seuil de pnpm audit inconnu : « ${resolvedLevel ?? '(absent)'} » (valeurs : ${AUDIT_LEVELS.join(', ')}).`,
        );
      }
      if (/\|\|\s*true|continue-on-error/.test(auditRun)) {
        errors.push('pnpm audit ne doit pas être contourné (pas de || true ni continue-on-error).');
      }
    }

    // EF-3 : artefacts complets, conservés et publiés même en échec.
    const artifacts = Object.values(ciJobs).flatMap((job) => artifactsOf(job, ci.env));
    for (const name of REQUIRED_ARTIFACTS) {
      // A sharded job suffixes its artifact with the shard number (`integration-reports-1`).
      const artifact = artifacts.find(
        (candidate) => candidate.name === name || candidate.name.startsWith(`${name}-`),
      );
      if (artifact === undefined) {
        errors.push(`Artefact obligatoire absent : ${name} (EF-3).`);
        continue;
      }
      if (!artifact.always) errors.push(`L’artefact ${name} doit être publié avec if: always().`);
      if (!(artifact.retentionDays > 0)) {
        errors.push(`L’artefact ${name} doit fixer retention-days explicitement (EF-3).`);
      }
      if (artifact.paths.trim() === '') errors.push(`L’artefact ${name} doit définir un chemin.`);
    }
    const e2eArtifact = artifacts.find(
      (candidate) => candidate.name === 'e2e-reports' || candidate.name.startsWith('e2e-reports-'),
    );
    if (e2eArtifact !== undefined && !e2eArtifact.paths.includes('test-results/')) {
      errors.push('L’artefact e2e-reports doit inclure test-results/ (traces, captures, vidéos).');
    }

    // CA-2 / ET-3 : aucun contournement silencieux d’un contrôle obligatoire.
    for (const [jobId, job] of Object.entries(ciJobs)) {
      for (const step of stepsOf(job)) {
        if (step['continue-on-error'] === true && !isCacheStep(step)) {
          const label = typeof step.name === 'string' ? step.name : (step.uses ?? step.run ?? '?');
          errors.push(
            `continue-on-error est interdit sur une validation obligatoire (job ${jobId}, étape ${label}).`,
          );
        }
      }
    }

    // EF-7 : les caches ne contiennent ni secret ni preuve.
    for (const [jobId, job] of Object.entries(ciJobs)) {
      for (const step of stepsOf(job)) {
        if (!isCacheStep(step)) continue;
        const withInput = step.with ?? {};
        const target =
          `${String(withInput.path ?? '')} ${String(withInput.key ?? '')}`.toLowerCase();
        if (
          /(^|[\s/])\.env|token|secret|evidence\/|test-results|coverage\/|security-reports|audit-reports/.test(
            target,
          )
        ) {
          errors.push(`Le cache du job ${jobId} ne doit contenir ni secret ni preuve (EF-7).`);
        }
      }
    }

    // CA-4 : les scripts pnpm référencés doivent exister.
    if (scripts !== null && typeof scripts === 'object') {
      for (const name of REQUIRED_SCRIPTS) {
        if (!Object.hasOwn(scripts, name)) {
          errors.push(`Script pnpm manquant dans package.json : ${name}.`);
        }
      }
      for (const name of referencedScripts(ci)) {
        if (!Object.hasOwn(scripts, name)) {
          errors.push(`Le workflow appelle un script pnpm inexistant : ${name} (CA-4).`);
        }
      }
    }

    // ET-1 : actions épinglées.
    for (const use of collectUses(ci)) {
      if (use.uses.startsWith('docker://') || use.uses.startsWith('./')) continue;
      if (!ACTION_REF.test(use.uses)) {
        errors.push(
          `Action non épinglée sur une version majeure ou une empreinte : ${use.uses} (job ${use.jobId}).`,
        );
      }
    }
  }

  // ET-4 / EF-6 : contrôle du titre de PR.
  if (prTitle !== null && prTitle !== undefined) {
    if (!(prTitle.on !== null && typeof prTitle.on === 'object' && 'pull_request' in prTitle.on)) {
      errors.push('pr-title.yml doit répondre à pull_request.');
    }
    if (hasWritePermission(prTitle.permissions)) {
      errors.push('pr-title.yml ne doit demander aucun droit d’écriture.');
    }
    for (const [jobId, job] of Object.entries(prTitleJobs)) {
      if (hasWritePermission(job?.permissions)) {
        errors.push(`pr-title.yml : droits d’écriture interdits (job ${jobId}).`);
      }
    }
    if (String(workflows.prTitleRaw ?? '').includes('secrets.')) {
      errors.push('pr-title.yml ne doit consommer aucun secret.');
    }
    const titleRun = runsOf(prTitleJobs.title).join('\n');
    if (!titleRun.includes('commitlint')) {
      errors.push('pr-title.yml doit valider le titre avec commitlint (ET-4).');
    }
    if (!titleRun.includes('--config commitlint.config.ts')) {
      errors.push('pr-title.yml doit réutiliser la configuration commitlint commune (ET-4).');
    }
    if (/github\.event\.pull_request\.title/.test(titleRun)) {
      errors.push(
        'Le titre de PR ne doit pas être interpolé directement dans un script (injection, ET-4).',
      );
    }
    const titleStep = stepsOf(prTitleJobs.title).find((step) =>
      typeof step.run === 'string' ? step.run.includes('commitlint') : false,
    );
    if (String(titleStep?.env?.PR_TITLE ?? '') !== '${{ github.event.pull_request.title }}') {
      errors.push('Le titre doit être transmis par la variable d’environnement PR_TITLE (ET-4).');
    }
    for (const use of collectUses(prTitle)) {
      if (use.uses.startsWith('docker://') || use.uses.startsWith('./')) continue;
      if (!ACTION_REF.test(use.uses)) {
        errors.push(`Action non épinglée dans pr-title.yml : ${use.uses} (ET-1).`);
      }
    }
  }

  // EF-9 / CL-4 : actionlint est obligatoire pour la validation locale.
  if (actionlint !== undefined) {
    if (!actionlint.available) {
      errors.push(
        'actionlint est requis par pnpm ci:check (CL-4). Installation : https://github.com/rhysd/actionlint#installation (brew install actionlint, ou télécharger la version 1.7.7).',
      );
    } else if (actionlint.code !== 0) {
      errors.push(
        `actionlint a signalé ${String(actionlint.errors ?? 'des')} erreur(s) :\n${String(actionlint.output ?? '').trim()}`,
      );
    }
  }
  if (act === false) {
    warnings.push('act absent : aucun essai local du workflow, validation syntaxique seulement.');
  }

  return { errors, warnings };
}

function readScripts(root) {
  const raw = readText(path.join(root, 'package.json'));
  if (raw === null) return null;
  try {
    return JSON.parse(raw).scripts ?? {};
  } catch {
    return null;
  }
}

function spawnQuiet(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

/** Indique si une commande est disponible sur le PATH. */
export function commandExists(command, versionArg = '--version') {
  const result = spawnQuiet(command, [versionArg]);
  return !result.error && result.status === 0;
}

export function runActionlint(root = ROOT) {
  const files = [CI_WORKFLOW, PR_TITLE_WORKFLOW, DEPLOY_WORKFLOW].map((relative) =>
    path.join(root, relative),
  );
  const result = spawnQuiet('actionlint', ['-no-color', ...files], { cwd: root });
  if (result.error && result.error.code === 'ENOENT')
    return { available: false, code: 1, output: '' };
  const version = spawnQuiet('actionlint', ['--version']).stdout?.split('\n')[0]?.trim() ?? '';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    available: true,
    code: result.status ?? 1,
    output,
    version,
    errors: output.trim() === '' ? 0 : output.trim().split('\n').length,
  };
}

/** Exécute toutes les vérifications ; utilisable sur un dépôt temporaire (ET-6). */
export function checkRepository(root = ROOT, options = {}) {
  const workflows = readWorkflows(root);
  const scripts = readScripts(root);
  const actionlint = options.actionlint ?? runActionlint(root);
  const act = options.act ?? commandExists('act');
  const { errors, warnings } = validateWorkflows({ workflows, scripts, actionlint, act });
  return { ok: errors.length === 0, errors, warnings, workflows, actionlint, act };
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rootIndex = process.argv.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1] ?? ROOT) : ROOT;
  const report = checkRepository(root);
  const described = describeCi(report.workflows);
  console.log(
    `Validation locale des workflows GitHub Actions (${path.relative(process.cwd(), root) || '.'})`,
  );
  for (const job of described.jobs) {
    const condition = job.condition === '' ? '' : ` — condition : ${job.condition}`;
    console.log(`  job ${job.id} : ${job.name}${condition}`);
  }
  console.log(
    `  artefacts : ${described.artifacts.map((a) => `${a.name} (${String(a.retentionDays)} j)`).join(', ')}`,
  );
  console.log(
    report.actionlint.available
      ? `actionlint ${report.actionlint.version ?? ''} : ${report.actionlint.code === 0 ? 'OK' : 'ERREURS'}`
      : 'actionlint : absent',
  );
  console.log(`act : ${report.act ? 'disponible (essai local possible)' : 'absent (non exécuté)'}`);
  for (const warning of report.warnings) console.log(`⚠ ${warning}`);
  for (const error of report.errors) console.log(`✖ ${error}`);
  console.log(
    report.ok
      ? '✔ ci:check : workflows conformes (validation YAML et actionlint locales, aucun run GitHub prétendu).'
      : `✖ ci:check : ${String(report.errors.length)} erreur(s).`,
  );
  process.exit(report.ok ? 0 : 1);
}
