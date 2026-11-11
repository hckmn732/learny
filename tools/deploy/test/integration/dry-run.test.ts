import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXIT } from '../../lib.mjs';
import { runMigrate } from '../../migrate.mjs';
import { runSync } from '../../sync-inngest.mjs';
import type { DeployJob, DeployWorkflowDoc } from '../../workflow.mjs';
import { readDeployWorkflow, validateDeployWorkflow } from '../../workflow.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DB_URL = 'postgresql://learny:secret@db.abcdefgh.supabase.co:5432/postgres';

function asFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return handler as unknown as typeof fetch;
}

function workflowJob(doc: DeployWorkflowDoc | null, id: string): DeployJob {
  const job = doc?.jobs?.[id];
  if (job === undefined) throw new Error(`job ${id} absent du fixture`);
  return job;
}

function tempMigrations(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-deploy-'));
  const dir = path.join(root, 'supabase/migrations');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), content);
  return root;
}

describe('[SPEC-013] deployment dry-run', () => {
  it('runs the check CLI in dry-run without secrets or any network call (CA-2, EF-8)', () => {
    const result = spawnSync(
      process.execPath,
      ['tools/deploy/check.mjs', '--env', 'preview', '--dry-run', '--json'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          APP_ENV: 'preview',
        },
      },
    );
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      dryRun: boolean;
      errors: string[];
      actions: { id: string; destination: string }[];
      warnings: string[];
    };
    expect(report.dryRun).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.actions.map((action) => action.id)).toEqual([
      'check',
      'migrate',
      'sync-inngest',
      'vercel',
      'smoke',
    ]);
    expect(report.actions.some((action) => action.destination === 'Non configuré')).toBe(true);
    expect(result.stdout).not.toContain('sk-');
    expect(result.stdout).not.toContain('learny-test-only');
  });

  it('performs zero mutation calls in migrate --dry-run and never calls db:reset (CA-2, CL-5)', () => {
    const calls: string[][] = [];
    const root = tempMigrations({ '0000_extensions.sql': 'select 1;\n' });
    const result = runMigrate({
      root,
      envName: 'preview',
      dryRun: true,
      env: { APP_ENV: 'preview', SUPABASE_DB_URL: DB_URL },
      runner: (args) => {
        calls.push(args);
        return { code: 0, output: '' };
      },
    });
    expect(result.code).toBe(EXIT.ok);
    expect(calls).toEqual([]);
    expect(result.report.applied).toEqual([]);
    expect(result.report.pending).toEqual(['0000']);
  });

  it('requires an explicit preview|production mode before any call (ET-3)', () => {
    const calls: string[][] = [];
    const result = runMigrate({
      envName: '',
      env: {},
      runner: (args) => {
        calls.push(args);
        return { code: 0, output: '' };
      },
    });
    expect(result.code).toBe(EXIT.config);
    expect(calls).toEqual([]);
  });

  it('refuses a local database URL for a remote migration (ET-3, CL-6)', () => {
    const calls: string[][] = [];
    const result = runMigrate({
      envName: 'production',
      env: {
        APP_ENV: 'production',
        SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        PRODUCTION_SUPABASE_BACKUP_REFERENCE: 'backup-2026-11-11',
      },
      runner: (args) => {
        calls.push(args);
        return { code: 0, output: '' };
      },
    });
    expect(result.code).toBe(EXIT.config);
    expect(calls).toEqual([]);
    expect(result.report.errors?.join('\n')).toContain('URL de base est locale');
  });

  it('lists before applying, applies once in order and stops on failure (EF-5, CL-4)', () => {
    const root = tempMigrations({
      '0002_second.sql': 'select 2;',
      '0001_first.sql': 'select 1;',
    });
    const calls: string[][] = [];
    const result = runMigrate({
      root,
      envName: 'preview',
      env: { APP_ENV: 'preview', SUPABASE_DB_URL: DB_URL },
      runner: (args) => {
        calls.push(args);
        if (args[0] === 'migration') return { code: 0, output: 'LOCAL | REMOTE\n0000 |\n' };
        return { code: 0, output: 'Applying migration 0001_first.sql' };
      },
    });
    expect(result.code).toBe(EXIT.ok);
    expect(calls[0]?.slice(0, 2)).toEqual(['migration', 'list']);
    expect(calls[1]?.slice(0, 2)).toEqual(['db', 'push']);
    expect(calls[1]).not.toContain('reset');
    expect(result.report.pending).toEqual(['0001', '0002']);
    expect(result.report.applied).toEqual(['0001', '0002']);

    const failureCalls: string[][] = [];
    const failed = runMigrate({
      root,
      envName: 'preview',
      env: { APP_ENV: 'preview', SUPABASE_DB_URL: DB_URL },
      runner: (args) => {
        failureCalls.push(args);
        if (args[0] === 'migration') return { code: 0, output: 'LOCAL | REMOTE\n' };
        return { code: 1, output: 'Applying migration 0001_first.sql\nerror: syntax error' };
      },
    });
    expect(failed.code).toBe(EXIT.external);
    expect(failed.report.failedMigration).toBe('0001');
    expect(failed.report.applied).toEqual([]);
    expect(failureCalls).toHaveLength(2);
  });

  it('skips migrations already applied remotely and refuses modified published ones (EF-5)', () => {
    const root = tempMigrations({
      '0001_first.sql': 'select 1;',
      '0002_second.sql': 'select 2;',
    });
    const skipped = runMigrate({
      root,
      envName: 'preview',
      env: { APP_ENV: 'preview', SUPABASE_DB_URL: DB_URL },
      runner: (args) =>
        args[0] === 'migration'
          ? { code: 0, output: 'LOCAL | REMOTE\n0001 | 0001\n0002 |\n' }
          : { code: 0, output: 'Applying migration 0002_second.sql' },
    });
    expect(skipped.report.skipped).toEqual(['0001']);
    expect(skipped.report.applied).toEqual(['0002']);

    const manifestPath = path.join(root, 'published.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ '0001': 'not-the-right-hash' }));
    const calls: string[][] = [];
    const modified = runMigrate({
      root,
      envName: 'preview',
      env: { APP_ENV: 'preview', SUPABASE_DB_URL: DB_URL },
      manifestPath,
      runner: (args) => {
        calls.push(args);
        return { code: 0, output: 'LOCAL | REMOTE\n' };
      },
    });
    expect(modified.code).toBe(EXIT.config);
    expect(modified.report.errors?.join('\n')).toContain('déjà publiée modifiée');
    expect(calls).toHaveLength(1);
  });

  it('never calls the network in sync --dry-run (CA-2, CL-5)', async () => {
    let calls = 0;
    const result = await runSync({
      envName: 'preview',
      dryRun: true,
      appUrl: 'https://preview.learny.example',
      region: 'eu',
      functions: ['sdd-demo-job'],
      fetchImpl: asFetch(() => {
        calls += 1;
        return Promise.reject(new Error('réseau interdit en --dry-run'));
      }),
    });
    expect(result.code).toBe(EXIT.ok);
    expect(calls).toBe(0);
    expect(result.report.synced).toBe(false);
  });

  it('fails when an Inngest function is missing (CL-7)', async () => {
    const urls: string[] = [];
    const result = await runSync({
      envName: 'preview',
      appUrl: 'https://preview.learny.example',
      region: 'eu',
      functions: ['sdd-demo-job'],
      fetchImpl: asFetch((url) => {
        urls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify({ functionsFound: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    });
    expect(result.code).toBe(EXIT.config);
    expect(urls).toHaveLength(1);
    expect(result.report.errors.join('\n')).toContain('synchronisées insuffisantes');
  });

  it('verifies a successful Inngest synchronisation (ET-4)', async () => {
    const methods: string[] = [];
    const result = await runSync({
      envName: 'preview',
      appUrl: 'https://preview.learny.example',
      region: 'eu',
      functions: ['sdd-demo-job'],
      fetchImpl: asFetch((_url, init) => {
        methods.push(init?.method ?? 'GET');
        const payload =
          init?.method === 'PUT' ? { modified: true, functionsFound: 1 } : { functionsFound: 1 };
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }),
    });
    expect(result.code).toBe(EXIT.ok);
    expect(result.report.synced).toBe(true);
    expect(methods).toEqual(['GET', 'PUT']);
  });

  it('refuses a non-EU Inngest region before any call (CL-1)', async () => {
    let calls = 0;
    const result = await runSync({
      envName: 'preview',
      appUrl: 'https://preview.learny.example',
      region: 'us-east-1',
      functions: ['sdd-demo-job'],
      fetchImpl: asFetch(() => {
        calls += 1;
        return Promise.reject(new Error('ne doit pas être appelé'));
      }),
    });
    expect(result.code).toBe(EXIT.config);
    expect(calls).toBe(0);
    expect(result.report.errors.join('\n')).toContain('hors UE');
  });

  it('validates the deploy workflow rules on the real YAML (CA-3)', () => {
    const workflow = readDeployWorkflow(ROOT);
    expect(workflow.error).toBeNull();
    const result = validateDeployWorkflow(workflow.doc);
    expect(result.errors).toEqual([]);
    const doc = structuredClone(workflow.doc);
    workflowJob(doc, 'production').if = "github.event.workflow_run.conclusion == 'success'";
    expect(validateDeployWorkflow(doc).errors.join('\n')).toContain('tag v*');
  });

  it('contains every required operation in the deployment guide (CA-4)', () => {
    const guide = fs.readFileSync(path.join(ROOT, 'docs/operations/deployment.md'), 'utf8');
    for (const heading of [
      '## 1. Matrice des environnements',
      '## 2. Régions européennes',
      '## 3. Secrets et variables',
      '## 4. Ordre de déploiement',
      '## 5. Migrations distantes',
      '## 6. Retour arrière',
      '## 7. Vérifications post-déploiement',
      '## 8. Vérification locale sans accès externe',
      '## 9. Blocages externes',
    ]) {
      expect(guide, heading).toContain(heading);
    }
    expect(guide).toContain('db:reset');
    expect(guide).toContain('PRODUCTION_SUPABASE_BACKUP_REFERENCE');
    expect(guide).not.toMatch(/sk-[A-Za-z0-9]{8,}|eyJhbGci/);
  });
});
