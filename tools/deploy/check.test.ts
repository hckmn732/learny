import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRODUCTION_REQUIRED_KEYS } from '../../packages/config/src/env';
import { EU_REGIONS, HOSTING_REGIONS, isEuRegion } from '../../packages/config/src/platform';

import { runCheck, validateDeployment, validateRef } from './check.mjs';
import { maskDestination, readManagedConfig, readVercelConfig } from './lib.mjs';
import type { DeployJob, DeployStep, DeployWorkflowDoc } from './workflow.mjs';
import { readDeployWorkflow, validateDeployWorkflow } from './workflow.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PREVIEW_REF = 'refs/pull/1/head';

function workflowJob(doc: DeployWorkflowDoc | null, id: string): DeployJob {
  const job = doc?.jobs?.[id];
  if (job === undefined) throw new Error(`job ${id} absent du fixture`);
  return job;
}

function workflowStep(job: DeployJob, needle: string): DeployStep {
  const step = (job.steps ?? []).find((candidate) => (candidate.run ?? '').includes(needle));
  if (step === undefined) throw new Error(`étape ${needle} absente du fixture`);
  return step;
}

function realWorkflow() {
  const workflow = readDeployWorkflow(ROOT);
  expect(workflow.error).toBeNull();
  return workflow;
}

function baseInput() {
  const managed = readManagedConfig(ROOT);
  const vercel = readVercelConfig(ROOT);
  const workflow = realWorkflow();
  return {
    envName: 'preview',
    env: {},
    managed,
    vercel,
    vercelRaw: vercel.raw,
    workflow: workflow.doc,
    workflowError: workflow.error,
    ref: PREVIEW_REF,
    branch: 'spec/demo',
    event: 'pull_request',
    dryRun: true,
  };
}

function validProductionEnv(): Record<string, string> {
  const managed = readManagedConfig(ROOT);
  const env: Record<string, string> = {
    APP_ENV: 'production',
    ENABLE_SDD_PAGES: 'false',
    SUPABASE_REGION: 'eu-central-1',
    INNGEST_REGION: 'eu',
    GIT_COMMIT: 'abc1234',
    NEXT_PUBLIC_APP_URL: 'https://learny.example',
    NEXT_PUBLIC_SUPABASE_URL: 'https://learny.supabase.co',
    DATABASE_URL: 'postgresql://learny:password@db.learny.example:5432/postgres',
  };
  for (const key of managed.productionRequiredKeys) {
    if (env[key] === undefined) env[key] = `configured-${key.toLowerCase()}`;
  }
  return env;
}

describe('[SPEC-013] managed regions', () => {
  it('reads the three managed regions and production keys from @learny/config (ET-2)', () => {
    const managed = readManagedConfig(ROOT);
    expect(managed.regions).toEqual(HOSTING_REGIONS);
    expect(managed.euRegions).toEqual([...EU_REGIONS]);
    expect(managed.productionRequiredKeys).toEqual([...PRODUCTION_REQUIRED_KEYS]);
  });

  it.each(Object.entries(HOSTING_REGIONS))('%s is hosted in the EU (%s)', (_service, region) => {
    expect(isEuRegion(region)).toBe(true);
  });

  it('accepts the real configuration in dry-run without any credential (CA-1, CA-2)', () => {
    const result = runCheck({
      env: {},
      envName: 'preview',
      dryRun: true,
      ref: PREVIEW_REF,
      branch: 'spec/demo',
      event: 'pull_request',
    });
    expect(result.report.errors).toEqual([]);
    expect(result.code).toBe(0);
    expect(result.report.regions).toEqual(HOSTING_REGIONS);
    expect(result.report.actions.map((action) => action.id)).toEqual([
      'check',
      'migrate',
      'sync-inngest',
      'vercel',
      'smoke',
    ]);
  });

  it('accepts a complete production environment without calling any provider (CA-1, CA-2)', () => {
    const result = runCheck({
      env: validProductionEnv(),
      envName: 'production',
      dryRun: false,
      ref: 'v1.0.0',
      branch: 'main',
      event: 'push',
    });
    expect(result.report.errors).toEqual([]);
    expect(result.code).toBe(0);
    expect(result.report.actions.map((action) => action.id)).toContain('backup');
  });

  it('rejects a Vercel region outside the EU (CL-1)', () => {
    const input = baseInput();
    const result = validateDeployment({
      ...input,
      vercel: {
        config: { ...input.vercel.config, regions: ['iad1'] },
        raw: input.vercel.raw,
        error: null,
      },
    });
    expect(result.errors.join('\n')).toContain('hors UE');
  });

  it('rejects Supabase and Inngest regions outside the EU (CL-1)', () => {
    const input = baseInput();
    const result = validateDeployment({
      ...input,
      env: { SUPABASE_REGION: 'us-east-1', INNGEST_REGION: 'us' },
    });
    expect(result.errors.join('\n')).toContain('SUPABASE_REGION=us-east-1 est hors UE');
    expect(result.errors.join('\n')).toContain('INNGEST_REGION=us est hors UE');
  });

  it('rejects an EU region that is not the declared one', () => {
    const input = baseInput();
    const result = validateDeployment({
      ...input,
      env: { SUPABASE_REGION: 'eu-west-1', INNGEST_REGION: 'eu' },
    });
    expect(result.errors.join('\n')).toContain(
      'ne correspond pas à la région attendue eu-central-1',
    );
  });

  it('rejects SDD pages enabled in production (CL-8)', () => {
    const input = baseInput();
    const result = validateDeployment({
      ...input,
      envName: 'production',
      env: { ...validProductionEnv(), ENABLE_SDD_PAGES: 'true' },
      ref: 'v1.0.0',
      branch: 'main',
      event: 'push',
      dryRun: false,
    });
    expect(result.errors.join('\n')).toContain('pages SDD doivent être désactivées');
  });

  it('names every missing production variable and never prints a value (EF-8)', () => {
    const result = runCheck({
      env: { APP_ENV: 'production', ENABLE_SDD_PAGES: 'false' },
      envName: 'production',
      dryRun: false,
      ref: 'v1.0.0',
      branch: 'main',
      event: 'push',
    });
    expect(result.code).toBe(2);
    const errors = result.report.errors.join('\n');
    expect(errors).toContain('Variables obligatoires manquantes');
    expect(errors).toContain('NEXT_PUBLIC_APP_URL');
    expect(JSON.stringify(result.report)).not.toMatch(/configured-/);
  });

  it('rejects a production ref that is not a vX.Y.Z tag (CL-3)', () => {
    expect(
      validateRef({
        envName: 'production',
        ref: 'refs/heads/main',
        branch: 'main',
        event: 'push',
        dryRun: false,
      }).errors.join('\n'),
    ).toContain('tag vX.Y.Z');
  });

  it('rejects a production tag outside main (CL-3)', () => {
    expect(
      validateRef({
        envName: 'production',
        ref: 'v1.0.0',
        branch: 'release/v1.0.0',
        event: 'push',
        dryRun: false,
      }).errors.join('\n'),
    ).toContain('appartenir à main');
  });

  it('never lets a preview target main (EF-2)', () => {
    expect(
      validateRef({
        envName: 'preview',
        ref: 'refs/heads/main',
        branch: 'main',
        event: 'pull_request',
        dryRun: true,
      }).errors.join('\n'),
    ).toContain('jamais cibler main');
  });

  it('refuses preview variables in a production environment (EF-2)', () => {
    const input = baseInput();
    const result = validateDeployment({
      ...input,
      envName: 'production',
      env: {
        ...validProductionEnv(),
        PREVIEW_SUPABASE_DB_URL: 'postgresql://preview.example/db',
      },
      ref: 'v1.0.0',
      branch: 'main',
      event: 'push',
      dryRun: false,
    });
    expect(result.errors.join('\n')).toContain('PREVIEW_');
  });

  it('masks provider destinations in reports (EF-4)', () => {
    const masked = maskDestination('https://abcdefghijklmno.supabase.co');
    expect(masked).toBe('https://***.supabase.co');
    expect(masked).not.toContain('abcdefghijklmno');
  });

  it('keeps vercel.json free of secrets and of a fixed CSP (ET-5)', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
    expect(raw).not.toMatch(/sk-|service_role|eyJhbGci|BEGIN [A-Z ]*PRIVATE KEY/);
    expect(raw).not.toContain('Content-Security-Policy');
    const config = JSON.parse(raw) as {
      regions: string[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    expect(config.regions).toEqual(['fra1']);
    const all = config.headers.find((entry) => entry.source === '/(.*)');
    expect(all?.headers.map((header) => header.key)).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-Frame-Options',
        'Strict-Transport-Security',
        'Permissions-Policy',
      ]),
    );
    const sdd = config.headers.find((entry) => entry.source === '/_dev/(.*)');
    expect(sdd?.headers[0]?.value).toContain('noindex');
  });

  it('validates the real deployment workflow (ET-1, EF-3)', () => {
    const workflow = realWorkflow();
    const result = validateDeployWorkflow(workflow.doc);
    expect(result.errors).toEqual([]);
  });

  it('detects a production workflow that does not require a tag on main (CL-3)', () => {
    const workflow = realWorkflow();
    const doc = structuredClone(workflow.doc);
    workflowJob(doc, 'production').if = "github.event.workflow_run.conclusion == 'success'";
    const result = validateDeployWorkflow(doc);
    expect(result.errors.join('\n')).toContain('tag v*');
  });

  it('detects a deployment that ignores a red CI (CL-3)', () => {
    const workflow = realWorkflow();
    const doc = structuredClone(workflow.doc);
    workflowJob(doc, 'preview').if = "github.event.workflow_run.event == 'pull_request'";
    const result = validateDeployWorkflow(doc);
    expect(result.errors.join('\n')).toContain('CI verte');
  });

  it('detects preview secrets leaking into production (ET-1)', () => {
    const workflow = realWorkflow();
    const doc = structuredClone(workflow.doc);
    const production = workflowJob(doc, 'production');
    production.env = {
      ...production.env,
      LEAK: '${{ secrets.PREVIEW_SUPABASE_DB_URL }}',
    };
    const result = validateDeployWorkflow(doc);
    expect(result.errors.join('\n')).toContain('PREVIEW_*');
  });

  it('rejects a deployment step that is silently bypassed (CL-4)', () => {
    const workflow = realWorkflow();
    const doc = structuredClone(workflow.doc);
    const step = workflowStep(workflowJob(doc, 'production'), 'migrate.mjs');
    step['continue-on-error'] = true;
    const result = validateDeployWorkflow(doc);
    expect(result.errors.join('\n')).toContain('continue-on-error');
  });
});
