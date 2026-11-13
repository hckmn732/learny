import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import conventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import { describe, expect, it } from 'vitest';

import { commitlintPlugin, commitlintRules } from '../../packages/config/src/commit-rules';

import {
  APP_JOBS,
  REQUIRED_ARTIFACTS,
  REQUIRED_ENV,
  REQUIRED_JOBS,
  describeCi,
  readWorkflows,
  validateWorkflows,
  type ActionlintResult,
  type ReadWorkflowsResult,
  type WorkflowJob,
} from './check-workflows.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const scripts = (
  JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

const ACTIONLINT_OK: ActionlintResult = { available: true, code: 0, output: '' };

function realWorkflows(): ReadWorkflowsResult {
  return readWorkflows(ROOT);
}

/** Deep copy so each test mutates its own workflows. */
function copy(source: ReadWorkflowsResult = realWorkflows()): ReadWorkflowsResult {
  return structuredClone(source);
}

function check(
  workflows: ReadWorkflowsResult,
  options: {
    actionlint?: ActionlintResult;
    act?: boolean;
    pnpmScripts?: Record<string, string>;
  } = {},
) {
  return validateWorkflows({
    workflows,
    scripts: options.pnpmScripts ?? scripts,
    actionlint: options.actionlint ?? ACTIONLINT_OK,
    act: options.act ?? true,
  });
}

function job(workflows: ReadWorkflowsResult, id: string): WorkflowJob {
  const found = workflows.ci?.jobs?.[id];
  if (found === undefined) throw new Error(`job ${id} absent du fixture`);
  return found;
}

function stepsOfJob(workflows: ReadWorkflowsResult, id: string) {
  return job(workflows, id).steps ?? [];
}

async function checkTitle(message: string) {
  return lint(
    message,
    { ...conventional.rules, ...commitlintRules },
    {
      plugins: { learny: commitlintPlugin },
      defaultIgnores: true,
    },
  );
}

describe('[SPEC-011] workflow rules', () => {
  it('accepts the real workflows and exposes the whole matrix (CA-1)', () => {
    const workflows = realWorkflows();
    expect(workflows.parseErrors).toEqual([]);
    expect(check(workflows).errors).toEqual([]);

    const described = describeCi(workflows);
    expect(described.jobs.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining([...REQUIRED_JOBS]),
    );
    for (const id of APP_JOBS) {
      const appJob = described.jobs.find((candidate) => candidate.id === id);
      expect(appJob?.needs).toContain('audit');
      expect(appJob?.condition).toContain("needs.audit.outputs.has_app == 'true'");
    }
    expect(described.triggers.push).toEqual(
      expect.arrayContaining(['main', 'spec/**', 'fix/**', 'release/**']),
    );
    expect(described.triggers.pullRequest).toBe(true);
    expect(described.triggers.workflowDispatch).toBe(true);
  });

  it('publishes every required artifact with always() and explicit retention (CA-1, EF-3)', () => {
    const described = describeCi(realWorkflows());
    for (const name of REQUIRED_ARTIFACTS) {
      const artifact = described.artifacts.find(
        (candidate) => candidate.name === name || candidate.name.startsWith(`${name}-`),
      );
      expect(artifact, name).toBeDefined();
      expect(artifact?.always, name).toBe(true);
      expect(artifact?.retentionDays, name).toBeGreaterThan(0);
    }
    expect(
      described.artifacts.find((a) => a.name === 'e2e-reports' || a.name.startsWith('e2e-reports-'))
        ?.paths,
    ).toContain('test-results/');
  });

  it('fixes the simulated modes and the frozen clock, and rejects ENABLE_SDD_PAGES=1 (EF-8, CA-2, CL-3)', () => {
    const workflows = copy();
    expect(workflows.ci?.env).toMatchObject(REQUIRED_ENV);

    workflows.ci = {
      ...(workflows.ci ?? {}),
      env: { ...workflows.ci?.env, ENABLE_SDD_PAGES: '1' },
    };
    const report = check(workflows);
    expect(report.errors.join('\n')).toContain("ENABLE_SDD_PAGES: '1' est refusé");
  });

  it('rejects a clock or a mode that differs from the frozen values (EF-8)', () => {
    const workflows = copy();
    workflows.ci = {
      ...(workflows.ci ?? {}),
      env: { ...workflows.ci?.env, CLOCK_FIXED_AT: '2026-01-01T00:00:00Z' },
    };
    expect(check(workflows).errors.join('\n')).toContain('CLOCK_FIXED_AT');
  });

  it('rejects continue-on-error on a mandatory step but allows it on a cache (CA-2, EF-7)', () => {
    const workflows = copy();
    const quality = stepsOfJob(workflows, 'quality');
    const lintStep = quality.find((step) => step.run === 'pnpm lint');
    expect(lintStep).toBeDefined();
    if (lintStep !== undefined) lintStep['continue-on-error'] = true;
    expect(check(workflows).errors.join('\n')).toContain('continue-on-error est interdit');

    const cacheOnly = copy();
    const cache = stepsOfJob(cacheOnly, 'quality').find((step) =>
      (step.uses ?? '').startsWith('actions/cache@'),
    );
    expect(cache?.['continue-on-error']).toBe(true);
    expect(check(cacheOnly).errors).toEqual([]);
  });

  it('omits nothing silently: the lockfile detection and the condition are mandatory (CL-1)', () => {
    const noCondition = copy();
    delete job(noCondition, 'integration').if;
    expect(check(noCondition).errors.join('\n')).toContain('needs.audit.outputs.has_app');

    const noDetection = copy();
    const detect = stepsOfJob(noDetection, 'audit').find((step) => step.id === 'detect');
    if (detect !== undefined) detect.run = 'echo "has_app=true"';
    expect(check(noDetection).errors.join('\n')).toContain('détecter pnpm-lock.yaml');
  });

  it('requires each app job to reinstall from the frozen lockfile (ET-2)', () => {
    const workflows = copy();
    job(workflows, 'quality').steps = stepsOfJob(workflows, 'quality').filter(
      (step) => step.run !== 'pnpm install --frozen-lockfile',
    );
    expect(check(workflows).errors.join('\n')).toContain('pnpm install --frozen-lockfile');
  });

  it('runs lint, typecheck, build, covered unit tests, Supabase and the demo seed (EF-2)', () => {
    const workflows = copy();
    job(workflows, 'quality').steps = stepsOfJob(workflows, 'quality').filter(
      (step) => step.run !== 'pnpm build',
    );
    job(workflows, 'e2e').steps = stepsOfJob(workflows, 'e2e').filter(
      (step) => step.run !== 'pnpm db:seed:demo',
    );
    const report = check(workflows).errors.join('\n');
    expect(report).toContain('job quality doit exécuter « pnpm build »');
    expect(report).toContain('job e2e doit exécuter « pnpm db:seed:demo »');
  });

  it('fails when an artifact is not published on failure or lacks retention (EF-3)', () => {
    const workflows = copy();
    const upload = stepsOfJob(workflows, 'integration').find(
      (step) => step.uses === 'actions/upload-artifact@v4',
    );
    if (upload !== undefined) {
      delete upload.if;
      upload.with = { ...upload.with, 'retention-days': 0 };
    }
    const report = check(workflows).errors.join('\n');
    expect(report).toContain('if: always()');
    expect(report).toContain('retention-days');
  });

  it('configures both gitleaks and the built-in scanner with a blocking audit level (CA-3, EF-4, EF-5)', () => {
    const described = describeCi(realWorkflows());
    expect(described.security.gitleaks).toBe(true);
    expect(described.security.builtinScanner).toBe(true);
    expect(described.security.auditLevel).toBe('high');
    expect(check(realWorkflows()).errors).toEqual([]);

    const noGitleaks = copy();
    job(noGitleaks, 'secrets').steps = stepsOfJob(noGitleaks, 'secrets').filter(
      (step) => !(step.uses ?? '').startsWith('gitleaks/gitleaks-action@'),
    );
    expect(check(noGitleaks).errors.join('\n')).toContain('gitleaks');

    const noBuiltin = copy();
    for (const step of stepsOfJob(noBuiltin, 'secrets')) {
      if (typeof step.run === 'string') step.run = step.run.replace('check-secrets.ts --all', '');
    }
    expect(check(noBuiltin).errors.join('\n')).toContain('analyseur intégré');
  });

  it('refuses an audit without an explicit threshold or with a silent escape (EF-5, CA-2)', () => {
    const workflows = copy();
    for (const step of stepsOfJob(workflows, 'secrets')) {
      if (typeof step.run === 'string' && step.run.includes('pnpm audit')) {
        step.run = 'pnpm audit || true';
      }
    }
    const report = check(workflows).errors.join('\n');
    expect(report).toContain('--audit-level');
    expect(report).toContain('ne doit pas être contourné');
  });

  it('detects a pnpm script that does not exist and a missing ci:check (CA-4)', () => {
    const workflows = copy();
    const quality = stepsOfJob(workflows, 'quality');
    const typecheck = quality.find((step) => step.run === 'pnpm typecheck');
    if (typecheck !== undefined) typecheck.run = 'pnpm typecheck:absent';
    expect(check(workflows).errors.join('\n')).toContain(
      'script pnpm inexistant : typecheck:absent',
    );

    const withoutCiCheck = { ...scripts } as Record<string, string>;
    delete withoutCiCheck['ci:check'];
    expect(check(realWorkflows(), { pnpmScripts: withoutCiCheck }).errors.join('\n')).toContain(
      'Script pnpm manquant dans package.json : ci:check',
    );
  });

  it('keeps permissions read-only and pins third-party actions (ET-1)', () => {
    const workflows = copy();
    workflows.ci = { ...(workflows.ci ?? {}), permissions: { contents: 'write' } };
    expect(check(workflows).errors.join('\n')).toContain('contents: read');

    const unpinned = copy();
    for (const step of stepsOfJob(unpinned, 'quality')) {
      if (step.uses === 'actions/checkout@v4') step.uses = 'actions/checkout@main';
    }
    expect(check(unpinned).errors.join('\n')).toContain('Action non épinglée');
  });

  it('validates the PR title with the shared commitlint configuration (CA-3, EF-6, ET-4)', async () => {
    const described = describeCi(realWorkflows());
    expect(described.security.prTitle.commitlint).toBe(true);
    expect(described.security.prTitle.configured).toBe(true);

    for (const title of [
      'feat(SPEC-011): complète les jobs de qualité',
      'merge(SPEC-011): Intégration continue',
      'ci(SPEC-011): valide les workflows et titres de PR',
    ]) {
      expect((await checkTitle(title)).valid, title).toBe(true);
    }
    for (const title of ['Ajoute la CI', 'feat: sans portée', 'feat(web): mauvais périmètre']) {
      expect((await checkTitle(title)).valid, title).toBe(false);
    }

    const interpolated = copy();
    for (const step of interpolated.prTitle?.jobs?.title?.steps ?? []) {
      if (typeof step.run === 'string') {
        step.run = `${step.run} && echo "` + '${{ github.event.pull_request.title }}"';
      }
    }
    expect(check(interpolated).errors.join('\n')).toContain('interpolé');
  });

  it('refuses write permissions or secrets inside pr-title.yml (ET-4)', () => {
    const workflows = copy();
    workflows.prTitle = { ...(workflows.prTitle ?? {}), permissions: { contents: 'write' } };
    expect(check(workflows).errors.join('\n')).toContain('pr-title.yml');

    const withSecret = copy();
    withSecret.prTitleRaw = `${withSecret.prTitleRaw ?? ''}\n# ` + '${{ secrets.TOKEN }}\n';
    expect(check(withSecret).errors.join('\n')).toContain('aucun secret');
  });

  it('keeps secrets and proofs out of the caches (EF-7)', () => {
    const workflows = copy();
    const cache = stepsOfJob(workflows, 'quality').find((step) =>
      (step.uses ?? '').startsWith('actions/cache@'),
    );
    if (cache !== undefined) cache.with = { ...cache.with, path: 'test-results/' };
    expect(check(workflows).errors.join('\n')).toContain('ni secret ni preuve');
  });

  it('fails without actionlint and names the installation command (CL-4)', () => {
    const report = check(realWorkflows(), {
      actionlint: { available: false, code: 1, output: '' },
    });
    expect(report.errors.join('\n')).toContain('actionlint est requis');
    expect(report.errors.join('\n')).toContain('github.com/rhysd/actionlint#installation');
  });

  it('only warns when act is absent (CL-4)', () => {
    const report = check(realWorkflows(), { act: false });
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toContain('act absent');
  });

  it('reports a YAML syntax error instead of throwing (CA-4)', () => {
    const workflows = realWorkflows();
    workflows.parseErrors = ['ci.yml : YAML invalide — mapping values are not allowed here'];
    workflows.ci = null;
    expect(check(workflows).errors.join('\n')).toContain('YAML invalide');
  });
});
