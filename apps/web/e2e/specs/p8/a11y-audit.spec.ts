// SPEC-803 EF-1, CA-1 — axe audit of every state of the inventory (ET-1), desktop and mobile.
// Only serious and critical violations fail; moderate and minor violations are recorded in
// evidence/SPEC-803/axe-report*.json for the declaration and the grid.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import type { Result } from 'axe-core';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

import { buildA11yInventory } from '../../support/a11y-inventory';
import { deleteDemoAttempts, resetDemoRateLimits, seedDemoExamAttempts } from '../../support/demo-exam';
import type { MatrixEntry } from '../../support/responsive-matrix';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-803');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BEST_PRACTICE = ['region', 'landmark-one-main', 'page-has-heading-one', 'heading-order'];
const BLOCKING = new Set(['serious', 'critical']);

interface AuditRow {
  width: number;
  id: string;
  ok: boolean;
  violations: Array<{ id: string; impact: string | null; help: string; nodes: number }>;
  error?: string;
}

let session: TestSession;
let created: string[] = [];
let entries: MatrixEntry[] = [];

async function seedStates(): Promise<{
  quizAttemptId: string;
  examAttemptId: string;
  examResultId: string;
  code: string;
}> {
  const alex = demoUserId('alex');
  const quizAttempt = await serviceDb().execute<{ id: string }>(sql`
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
    )
    select ${alex}::uuid, id,
           coalesce((select max(attempt_no) from public.attempts where activity_id = a.id), 0) + 1,
           'graded'::public.attempt_status,
           '2026-11-11T10:00:00Z'::timestamptz, '2026-11-11T10:20:00Z'::timestamptz, 60, false
    from public.activities a
    where a.id = ${demoId('activity', 'm3-quiz')}::uuid
    returning id::text as id
  `);
  const exam = await seedDemoExamAttempts();
  const group = await serviceDb().execute<{ invite_code: string }>(sql`
    select invite_code from public.groups where id = ${demoId('group', 'agile')}::uuid limit 1
  `);
  return {
    quizAttemptId: quizAttempt[0]?.id ?? '',
    examAttemptId: exam.inProgressId,
    examResultId: exam.gradedId,
    code: group[0]?.invite_code ?? '',
  };
}

async function applyUser(
  context: BrowserContext,
  baseURL: string | undefined,
  entry: MatrixEntry,
): Promise<void> {
  if (entry.user === 'anonymous') {
    await context.clearCookies();
    return;
  }
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
}

async function renderEntry(
  context: BrowserContext,
  page: Page,
  baseURL: string | undefined,
  entry: MatrixEntry,
): Promise<void> {
  // Leave the previous document (and any open modal that keeps the body inert) before the next
  // state: two entries share the same `/parametres#profil` address.
  await page.goto('about:blank');
  await applyUser(context, baseURL, entry);
  await page.goto(entry.route, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('main, [data-testid="exam-screen"], h1').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  if (entry.setup !== undefined) await entry.setup(page);
}

async function audit(page: Page): Promise<Result[]> {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const rule of BEST_PRACTICE) builder.withRules([rule]);
  return (await builder.analyze()).violations;
}

async function runMatrix(
  page: Page,
  context: BrowserContext,
  baseURL: string | undefined,
  width: number,
): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  for (const entry of entries) {
    try {
      console.log(`[axe ${String(width)}] ${entry.id}`);
      await renderEntry(context, page, baseURL, entry);
      const violations = await audit(page);
      rows.push({
        width,
        id: entry.id,
        ok: violations.every((violation) => !BLOCKING.has(violation.impact ?? '')),
        violations: violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          help: violation.help,
          nodes: violation.nodes.length,
        })),
      });
    } catch (error) {
      rows.push({
        width,
        id: entry.id,
        ok: false,
        violations: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await context.clearCookies();
    }
  }
  return rows;
}

function writeReport(project: string, rows: AuditRow[]): void {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const blocking = rows.filter((row) => !row.ok);
  const report = {
    generatedAt: '2026-11-11T12:20:00Z',
    project,
    states: rows.length,
    blockingStates: blocking.length,
    byImpact: rows.flatMap((row) => row.violations).reduce<Record<string, number>>((acc, v) => {
      const impact = v.impact ?? 'null';
      acc[impact] = (acc[impact] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };
  const suffix = project === 'desktop' ? '' : `-${project}`;
  fs.writeFileSync(
    path.join(EVIDENCE, `axe-report${suffix}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (process.env.A11Y_WRITE_BEFORE === '1') {
    fs.writeFileSync(
      path.join(EVIDENCE, `axe-before${suffix}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  const states = await seedStates();
  entries = buildA11yInventory(states);
  created = [states.quizAttemptId, states.examAttemptId, states.examResultId];
});

test.afterAll(async () => {
  await deleteDemoAttempts(created);
  await restoreDemoData();
  await resetDemoRateLimits();
  await closeDb();
});

test('audit axe desktop @SPEC-803', async ({ page, context, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop', 'parcours desktop');
  test.setTimeout(45 * 60_000);
  await resetDemoRateLimits();
  const rows = await runMatrix(page, context, baseURL, 1440);
  writeReport('desktop', rows);
  expect(
    rows
      .filter((row) => !row.ok)
      .map(
        (row) =>
          `${row.id}: ${row.error ?? row.violations.map((v) => `${v.id} (${v.impact ?? ''})`).join(', ')}`,
      ),
  ).toEqual([]);
});

test('audit axe mobile @SPEC-803 @mobile', async ({ page, context, baseURL }) => {
  test.skip(test.info().project.name !== 'mobile', 'parcours mobile');
  test.setTimeout(45 * 60_000);
  await resetDemoRateLimits();
  const rows = await runMatrix(page, context, baseURL, 390);
  writeReport('mobile', rows);
  expect(
    rows
      .filter((row) => !row.ok)
      .map(
        (row) =>
          `${row.id}: ${row.error ?? row.violations.map((v) => `${v.id} (${v.impact ?? ''})`).join(', ')}`,
      ),
  ).toEqual([]);
});
