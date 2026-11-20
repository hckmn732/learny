import conventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import { z } from 'zod';

import { commitlintPlugin, commitlintRules, scanText } from '@learny/config';
import { DEMO_STEPS, inngest, runDemoJob, sddDemoStore, toJobLogger } from '@learny/jobs';
import { executeDirect } from '@learny/jobs/testing';

import { sddPagesEnabled } from '../deps/sdd-pages';

import type { SpecialHandler } from './types';

// SPEC-1004 EF-2 — the three `_dev` tooling endpoints of the SDD harness (SPEC-001, SPEC-002,
// SPEC-203). They are not contract routes: they answer whatever the tooling page needs, and are
// disabled outside `ENABLE_SDD_PAGES` like every demonstration route.

function invalidRequest(): Response {
  return Response.json(
    { type: 'about:blank', title: 'Requête invalide', status: 400, code: 'VALIDATION_FAILED' },
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  );
}

// --- POST /api/v1/_dev/demo-job (SPEC-203) -------------------------------------------------
// Loose shape only: the job itself validates the input (bounds, empty runId) and reports it.
const DemoJobBody = z.object({ runId: z.string().max(200), value: z.number() });

// Runs the shared demo job with the controlled adapter of the SDD harness (no Inngest server).
const demoJob: SpecialHandler['handle'] = async (request) => {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  const parsed = DemoJobBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  const logger = toJobLogger(inngest.logger);
  const run = await executeDirect(
    (step) => runDemoJob({ data: parsed.data, step, logger }, { store: sddDemoStore }),
    { steps: DEMO_STEPS },
  );
  const steps = run.steps.map(({ name, status, attempts }) => ({ name, status, attempts }));
  return Response.json(
    run.status === 'completed'
      ? { status: run.status, steps, result: run.output, error: null }
      : { status: run.status, steps, result: null, error: { code: run.error.code } },
    { headers: { 'cache-control': 'no-store' } },
  );
};

// --- POST /api/v1/_dev/commit-check (SPEC-002) ---------------------------------------------
const CommitBody = z.object({ message: z.string().min(1).max(2000) });

const COMMIT_RULES = { ...conventional.rules, ...commitlintRules };

const commitCheck: SpecialHandler['handle'] = async (request) => {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  // The message is never logged (ET-7).
  const parsed = CommitBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  const report = await lint(parsed.data.message, COMMIT_RULES, {
    plugins: { learny: commitlintPlugin },
    defaultIgnores: true,
  });
  const pick = ({ name, message }: { name: string; message: string }) => ({ name, message });
  return Response.json({
    valid: report.valid,
    errors: report.errors.map(pick),
    warnings: report.warnings.map(pick),
  });
};

// --- POST /api/v1/_dev/secret-scan (SPEC-002) ----------------------------------------------
const SecretBody = z.object({ text: z.string().max(20000) });

const secretScan: SpecialHandler['handle'] = async (request) => {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  // The scanned text may hold a secret: it is never logged (ET-7).
  const parsed = SecretBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  return Response.json({ findings: scanText(parsed.data.text, 'saisie') });
};

export const sddDemoJobSpecial: SpecialHandler = {
  method: 'POST',
  path: '/api/v1/_dev/demo-job',
  handle: demoJob,
};

export const sddCommitCheckSpecial: SpecialHandler = {
  method: 'POST',
  path: '/api/v1/_dev/commit-check',
  handle: commitCheck,
};

export const sddSecretScanSpecial: SpecialHandler = {
  method: 'POST',
  path: '/api/v1/_dev/secret-scan',
  handle: secretScan,
};
