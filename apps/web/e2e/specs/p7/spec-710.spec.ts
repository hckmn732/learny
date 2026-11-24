import { randomUUID } from 'node:crypto';

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
const PREFIX = 'sdd-710-e2e-';

let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({ email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test` });
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

async function insertAction(input: {
  userId: string;
  automation: string;
  kind: string;
  summary: string;
  status: 'applied' | 'consumed';
  createdAt: string;
  undo: boolean;
}): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.automation_actions (
      user_id, formation_id, automation, kind, summary, payload, undo_payload,
      requires_consent, status, decided_at, created_at
    ) values (
      ${input.userId}::uuid, null, ${input.automation}::automation_key, ${input.kind},
      ${input.summary}, ${JSON.stringify({ dedupeKey: `spec-710:${randomUUID()}` })}::jsonb,
      ${input.undo ? JSON.stringify({ restore: true }) : null}::jsonb, false,
      ${input.status}::automation_status, ${input.createdAt}::timestamptz,
      ${input.createdAt}::timestamptz
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('action non créée');
  return id;
}

async function seedJournal(userId: string): Promise<void> {
  await insertAction({
    userId,
    automation: 'reprise',
    kind: 'slot_rescheduled',
    summary: 'Séance replacée jeudi à 10:30.',
    status: 'applied',
    createdAt: '2026-11-11T08:05:00.000Z',
    undo: true,
  });
  await insertAction({
    userId,
    automation: 'plafond_quiz',
    kind: 'quiz_smoothed',
    summary: '18 notions étaient dues : 4 reportées à jeudi.',
    status: 'applied',
    createdAt: '2026-11-11T08:01:00.000Z',
    undo: true,
  });
  await insertAction({
    userId,
    automation: 'micro_seance',
    kind: 'micro_session_done',
    summary: 'Micro-séance de 5 min faite.',
    status: 'consumed',
    createdAt: '2026-11-11T07:00:00.000Z',
    undo: false,
  });
}

/** Waits for the PATCH of the settings service (immediate persistence, EF-3). */
async function patchAfter(
  page: import('@playwright/test').Page,
  action: () => Promise<void>,
): Promise<void> {
  const sent = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/automations') &&
      response.request().method() === 'PATCH',
  );
  await action();
  expect((await sent).status()).toBe(200);
}

/** Signs the browser in as the seeded demonstration user (SPEC-115). */
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

test('parcours SPEC-710 @SPEC-710', async ({ page, axeCheck, captureEvidence }) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  await seedJournal(current.userId);
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#automatismes');

  // EF-1, BR-SET-01 — the hash opens the Automatismes tab.
  await expect(page.getByTestId('settings-tab-automatismes')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-title')).toHaveText('Automatismes');
  await expect(page.getByTestId('automation-principle')).toBeVisible();
  await expect(page.getByTestId('automation-count')).toHaveText('3 actions cette semaine');

  // CA-1 — nine automations in the three groups, plus the Mode pause card: each one exactly once.
  await expect(page.getByTestId('automation-group')).toHaveCount(4);
  await expect(page.getByTestId('automation-switch')).toHaveCount(10);
  for (const key of [
    'reprise',
    'micro_seance',
    'bilan',
    'echauffement',
    'questions_cartes',
    'plafond_quiz',
    'remediation',
    'jeu_lacune',
    'sprint',
    'pause',
  ]) {
    await expect(page.getByTestId(`automation-row-${key}`)).toHaveCount(1);
  }
  const groups = page.getByTestId('automation-group');
  await expect(groups.nth(0)).toContainText('Contre le décrochage');
  await expect(groups.nth(1)).toContainText('Mémorisation');
  await expect(groups.nth(2)).toContainText('Quiz et jeux');
  await expect(groups.nth(3)).toContainText('Mode pause et retour');

  // EF-2 — the options of the select are real, ordered `option` elements.
  const reprise = page.getByTestId('automation-row-reprise');
  const inactive = reprise.getByTestId('automation-setting-reprise-inactiveDays');
  await expect(inactive.locator('option')).toHaveText(['1 jour', '2 jours', '3 jours']);
  await expect(inactive.locator('option')).toHaveCount(3);

  // CA-1 — disabling removes its editable settings, keeps the history, and survives a reload.
  const repriseSwitch = reprise.getByTestId('automation-switch');
  await expect(repriseSwitch).toHaveAttribute('aria-checked', 'true');
  await patchAfter(page, async () => {
    await repriseSwitch.click();
  });
  await expect(reprise.getByTestId('automation-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(reprise.getByTestId('automation-setting-reprise-inactiveDays')).toHaveCount(0);
  await expect(reprise).toContainText('Séance replacée jeudi à 10:30.');
  await page.reload();
  await expect(
    page.getByTestId('automation-row-reprise').getByTestId('automation-switch'),
  ).toHaveAttribute('aria-checked', 'false');
  await patchAfter(page, async () => {
    await page.getByTestId('automation-row-reprise').getByTestId('automation-switch').click();
  });

  // CA-1, CL-4 — a valid select value is stored and survives a reload.
  const cap = page.getByTestId('automation-setting-plafond_quiz-maxMinutes');
  await patchAfter(page, async () => {
    await cap.selectOption('30');
  });
  await page.reload();
  await expect(page.getByTestId('automation-setting-plafond_quiz-maxMinutes')).toHaveValue('30');

  // CA-2 — the weekly counter matches the three journal rows; the consumed action has no undo.
  const journal = page.getByTestId('automation-history');
  await expect(journal.getByTestId('automation-journal-row')).toHaveCount(3);
  const consumed = journal
    .getByTestId('automation-journal-row')
    .filter({ hasText: 'Micro-séance de 5 min faite.' });
  await expect(consumed.getByTestId('automation-undo')).toHaveCount(0);
  await expect(consumed.getByTestId('automation-journal-status')).toHaveText('Consommée');

  // CA-2 — « Annuler » changes the row and the stored status.
  const undoable = journal
    .getByTestId('automation-journal-row')
    .filter({ hasText: 'Séance replacée jeudi à 10:30.' });
  const undone = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/automation-actions/') &&
      response.url().endsWith('/undo') &&
      response.request().method() === 'POST',
  );
  await undoable.getByTestId('automation-undo').click();
  expect((await undone).status()).toBe(200);
  // EF-8 — le résumé devient « Annulé : … » ; la ligne reste dans le journal avec son statut.
  const cancelled = journal
    .getByTestId('automation-journal-row')
    .filter({ hasText: 'Annulé :' });
  await expect(cancelled).toHaveCount(1);
  await expect(cancelled.getByTestId('automation-undo')).toHaveCount(0);
  await expect(cancelled.getByTestId('automation-journal-status')).toHaveText('Annulée');

  // CL-1 — a failing read keeps the screen usable and offers « Réessayer ».
  await page.route('**/api/v1/me/automations', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await page.reload();
  await expect(page.getByTestId('automation-error-state')).toBeVisible();
  await page.unroute('**/api/v1/me/automations');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('automation-principle')).toBeVisible();

  await axeCheck();
  await captureEvidence('spec-710-parametres-automatismes');
});

test('conformité SPEC-710 @SPEC-710 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/parametres#automatismes');

  await expect(page.getByTestId('automation-principle')).toBeVisible();
  await expect(page.getByTestId('automation-switch')).toHaveCount(10);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="automation-principle"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="automation-group"]': { 'background-color': '#FFFFFF' },
    '[data-testid="automation-history"]': { 'background-color': '#FFFFFF' },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'font-family',
    /Space[ _]Grotesk/,
  );

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

  await expectScreenshotBaseline(page, 'spec-710-parametres-automatismes-desktop.png', {
    fullPage: true,
  });
  await axeCheck();

  // Mobile : même contenu, aucun débordement horizontal, capture de non-régression ≤ 1 %.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('automation-principle')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-710-parametres-automatismes-mobile.png', {
    fullPage: true,
  });
  await axeCheck();
});
