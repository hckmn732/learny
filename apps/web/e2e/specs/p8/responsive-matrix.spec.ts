// SPEC-802 — responsive matrix (EF-1, EF-8, CA-1, CA-2, CA-5, CA-7). One test per width renders
// every state of the inventory, asserts the absence of horizontal scrolling, and checks touch
// targets at 390 and 1024 px plus axe at 390 px.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Page } from '@playwright/test';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  expectMobileInputFontSize,
  expectNoClippedContent,
  expectNoHorizontalScroll,
  expectTouchTargets,
} from '@learny/testing/touch-targets';

import { deleteDemoAttempts, seedDemoExamAttempts } from '../../support/demo-exam';
import {
  RESPONSIVE_WIDTHS,
  buildResponsiveMatrix,
  type MatrixEntry,
} from '../../support/responsive-matrix';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-802', 'screenshots');

let session: TestSession;
let created: string[] = [];
let entries: MatrixEntry[] = [];
const results: Array<{
  width: number;
  id: string;
  ok: boolean;
  error?: string;
}> = [];

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
  page: Page,
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
  await applyUser(context, baseURL, page, entry);
  await page.goto(entry.route, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('main, [data-testid="exam-screen"], h1').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  // Client-loaded content (quiz session, agenda, notifications) is part of the checked state:
  // wait for the network to settle and for every skeleton region to be gone.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  if (entry.setup !== undefined) await entry.setup(page);
}

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  const states = await seedStates();
  entries = buildResponsiveMatrix(states);
  created = [states.quizAttemptId, states.examAttemptId, states.examResultId];
});

test.afterAll(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(
    path.join(EVIDENCE, 'matrix-after.json'),
    `${JSON.stringify({ generatedAt: '2026-11-11T12:20:00Z', results }, null, 2)}\n`,
  );
  // Leave the demo dataset as the next file of the campaign expects it.
  await deleteDemoAttempts(created);
  await restoreDemoData();
  await closeDb();
});

for (const width of RESPONSIVE_WIDTHS) {
  test(`matrice ${width.name} px @SPEC-802`, async ({
    page,
    context,
    baseURL,
    axeCheck,
  }) => {
    test.setTimeout(20 * 60_000);
    await page.setViewportSize({ width: width.width, height: width.height });
    for (const entry of entries) {
      try {
        console.log(`[matrice ${String(width.width)}] ${entry.id}`);
        await renderEntry(context, page, baseURL, entry);
        await expectNoHorizontalScroll(page);
        await expectNoClippedContent(page);
        if (width.width === 390 || width.width === 1024) {
          await expectTouchTargets(page, { min: 44 });
        }
        if (width.width === 390) {
          await expectMobileInputFontSize(page, 16);
          await axeCheck();
        }
        results.push({ width: width.width, id: entry.id, ok: true });
      } catch (error) {
        results.push({
          width: width.width,
          id: entry.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await context.clearCookies();
      }
    }
    // Collect every failing state of this width instead of stopping at the first one: one run
    // gives the full correction list, and the width still fails as soon as one state is broken.
    expect(
      results
        .filter((result) => result.width === width.width && !result.ok)
        .map((result) => `${result.id}: ${result.error ?? ''}`),
    ).toEqual([]);
  });
}
