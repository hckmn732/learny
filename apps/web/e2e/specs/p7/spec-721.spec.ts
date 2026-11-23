import { createHash, randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { DEMO_USERS, demoUserId } from '@learny/testing/db-factories';
import { expect, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const PREFIX = 'sdd-721-e2e-';

let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({
    email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`,
  });
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3110' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await closeDb();
});

interface Fixture {
  formationId: string;
  slotId: string;
}

async function seedFixture(userId: string): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const formationRows = await tx.execute<{ id: string }>(sql`
      insert into public.formations (
        owner_id, title, status, objectives, start_date, end_date, volume_hours
      ) values (
        ${userId}::uuid, 'SAP S/4HANA Finance', 'active'::formation_status,
        '{operational}'::formation_objective[], '2026-11-01'::date, '2026-12-20'::date, 30
      )
      returning id::text as id
    `);
    const formationId = formationRows[0]?.id;
    if (formationId === undefined) throw new Error('formation non créée');
    const moduleRows = await tx.execute<{ id: string }>(sql`
      insert into public.modules (formation_id, position, title, status)
      values (${formationId}::uuid, 1, 'Module 1', 'open')
      returning id::text as id
    `);
    const moduleId = moduleRows[0]?.id;
    if (moduleId === undefined) throw new Error('module non créé');
    const chapterRows = await tx.execute<{ id: string }>(sql`
      insert into public.chapters (module_id, formation_id, position, title)
      values (${moduleId}::uuid, ${formationId}::uuid, 1, 'Chapitre 1')
      returning id::text as id
    `);
    const chapterId = chapterRows[0]?.id;
    if (chapterId === undefined) throw new Error('chapitre non créé');
    const notionRows = await tx.execute<{ id: string }>(sql`
      insert into public.notions (formation_id, module_id, chapter_id, label, position)
      values (
        ${formationId}::uuid, ${moduleId}::uuid, ${chapterId}::uuid,
        'Écritures de clôture', 1
      )
      returning id::text as id
    `);
    const notionId = notionRows[0]?.id;
    if (notionId === undefined) throw new Error('notion non créée');
    await tx.execute(sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
        success_count, gap_nature, gap_detected_at, in_review
      ) values (
        ${userId}::uuid, ${notionId}::uuid,
        '{"due":"2026-11-11T12:20:00.000Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":1,"reps":1,"lapses":1,"state":2,"last_review":"2026-11-10T12:20:00.000Z"}'::jsonb,
        '2026-11-11T12:20:00Z'::timestamptz, 35,
        '2026-11-10T12:20:00Z'::timestamptz, '2026-11-10T12:20:00Z'::timestamptz,
        1, 'confusion', '2026-11-10T12:20:00Z'::timestamptz, true
      )
    `);
    const brickRows = await tx.execute<{ id: string }>(sql`
      insert into public.bricks (
        owner_id, formation_id, type, notion_ids, purpose, status, current_version
      ) values (
        ${userId}::uuid, ${formationId}::uuid, 'matching',
        array[${notionId}::uuid], 'bank', 'active', 1
      )
      returning id::text as id
    `);
    const brickId = brickRows[0]?.id;
    if (brickId === undefined) throw new Error('brique non créée');
    await tx.execute(sql`
      insert into public.brick_versions (
        brick_id, version, payload, fingerprint, origin, created_by
      ) values (
        ${brickId}::uuid, 1,
        '{"question":"Quand passe-t-on les écritures de clôture ?","choices":["À la fin de l’exercice","Chaque matin"],"answer":"À la fin de l’exercice"}'::jsonb,
        ${createHash('sha256').update('spec-721-brick').digest('hex')}, 'tutor', 'tutor'
      )
    `);
    const slotRows = await tx.execute<{ id: string }>(sql`
      insert into public.schedule_slots (
        user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
      ) values (
        ${userId}::uuid, ${formationId}::uuid, ${moduleId}::uuid, 'course',
        'Cours de clôture', '2026-11-12T09:00:00Z'::timestamptz,
        '2026-11-12T11:00:00Z'::timestamptz, 'planned', 'planner'
      )
      returning id::text as id
    `);
    const slotId = slotRows[0]?.id;
    if (slotId === undefined) throw new Error('créneau non créé');
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values
        (${userId}::uuid, '2026-11-09'::date, 20, true, '{global_quiz}'),
        (${userId}::uuid, '2026-11-10'::date, 20, true, '{global_quiz}')
    `);
    return { formationId, slotId };
  });
}

async function formationStatus(formationId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.formations where id = ${formationId}::uuid`,
  );
  return rows[0]?.status;
}

async function slotStatus(slotId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.schedule_slots where id = ${slotId}::uuid`,
  );
  return rows[0]?.status;
}

async function pauseActionCount(userId: string, kind: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(sql`
    select count(*)::int as n from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'pause' and kind = ${kind}
  `);
  return rows[0]?.n ?? 0;
}

async function useDemoUser(
  context: import('@playwright/test').BrowserContext,
  baseURL: string | undefined,
  page: import('@playwright/test').Page,
): Promise<void> {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
  const demo = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.clearCookies();
  await context.addCookies(
    demo.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3110' })),
  );
  await page.clock.setFixedTime(NOW);
}

test('parcours SPEC-721 @SPEC-721', async ({ page, baseURL, axeCheck, captureEvidence }) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  const fixture = await seedFixture(current.userId);
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#automatismes');

  const pauseMode = page.getByTestId('pause-mode');
  await expect(pauseMode).toBeVisible();
  await expect(page.getByTestId('pause-end-date')).toBeVisible();
  await expect(page.getByTestId('pause-diagnostic')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('pause-resume')).toHaveCount(0);

  // EF-1, CA-1 — declaring a pause freezes the future slot and the formation.
  const endDate = page.getByTestId('pause-end-date');
  await endDate.selectOption({ index: 0 });
  const start = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/pause') && response.request().method() === 'POST',
  );
  await page.getByTestId('automation-pause-start').click();
  expect((await start).status()).toBe(200);
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await expect(pauseMode).toContainText('En pause jusqu’au');
  expect(await formationStatus(fixture.formationId)).toBe('paused');
  expect(await slotStatus(fixture.slotId)).toBe('cancelled');

  // Idempotence visible: reload keeps the same active pause and hides the declaration form.
  await page.reload();
  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await expect(page.getByTestId('pause-end-date')).toHaveCount(0);

  // EF-2, CA-2 — the return proposes the ten-minute diagnostic exactly once.
  const resume = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/pause') && response.request().method() === 'DELETE',
  );
  await page.getByTestId('pause-resume').click();
  expect((await resume).status()).toBe(200);
  await expect(page.getByTestId('pause-diagnostic-proposed')).toContainText('10 minutes');
  await page.reload();
  await expect(page.getByTestId('pause-diagnostic-proposed')).toHaveCount(1);
  expect(await pauseActionCount(current.userId, 'pause_ended')).toBe(1);

  // ET-4 — a real diagnostic result writes its activity and replans the formation.
  const diagnostic = await page.request.post('/api/v1/me/pause/diagnostic', {
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      origin: baseURL ?? 'http://127.0.0.1:3100',
    },
    data: { answered: 3, correct: 2 },
  });
  expect(diagnostic.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('pause-diagnostic-done')).toContainText('Diagnostic terminé');
  expect(await formationStatus(fixture.formationId)).toBe('active');

  // CA-2 — disabling the diagnostic resumes directly, without a fictional session.
  await expect(page.getByTestId('pause-diagnostic')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('pause-diagnostic').click();
  await expect(page.getByTestId('pause-diagnostic')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('pause-end-date').selectOption({ index: 0 });
  const secondStart = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/pause') && response.request().method() === 'POST',
  );
  await page.getByTestId('automation-pause-start').click();
  expect((await secondStart).status()).toBe(200);
  const secondResume = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/pause') && response.request().method() === 'DELETE',
  );
  await page.getByTestId('pause-resume').click();
  expect((await secondResume).status()).toBe(200);
  await expect(page.getByTestId('pause-diagnostic-proposed')).toHaveCount(0);
  expect(await formationStatus(fixture.formationId)).toBe('active');

  // CL-1 — a failing read keeps the screen usable and offers « Réessayer ».
  await page.route('**/api/v1/me/pause', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await page.reload();
  await expect(page.getByTestId('automation-error-state')).toBeVisible();
  await page.unroute('**/api/v1/me/pause');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('pause-mode')).toBeVisible();

  await axeCheck();
  await captureEvidence('spec-721-parametres-pause');
});

test('conformité SPEC-721 @SPEC-721 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/parametres#automatismes');

  await expect(page.getByTestId('pause-mode')).toBeVisible();
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
  });

  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-15-automatismes-desktop.png',
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'automation-principle',
        locator: page.getByTestId('automation-principle'),
        rect: { x: 312, y: 163, width: 1040, height: 117 },
      },
      {
        name: 'automation-group-decrochage',
        locator: page.getByTestId('automation-group').first(),
        rect: { x: 310, y: 330, width: 1044, height: 560 },
      },
    ],
  });
  for (const region of regions) {
    await testInfo.attach(`${region.name}-side-by-side`, {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`${region.name}-diff`, {
      path: region.diffPath,
      contentType: 'image/png',
    });
    expect(region.ratio, `écart ${region.name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }

  await expectScreenshotBaseline(page, 'spec-721-parametres-pause-desktop.png', {
    fullPage: true,
  });
  await axeCheck();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('pause-mode')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-721-parametres-pause-mobile.png', {
    fullPage: true,
  });
  await axeCheck();
});
