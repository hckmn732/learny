import { closeDb, aiCredentials, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
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
const MODEL = 'gpt-5.5-e2e';
const FAILED_MODEL = 'deepseek-failed-e2e';
const KEY = 'sk-e2e-709-000000a91F';

/** Fresh learner for the functional parcours; deleted after every test. */
let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  // The settings screen belongs to a learner who has finished the onboarding of SPEC-602.
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await cleanupDemoKeys();
  await closeDb();
});

/** SPEC-115 does not ship personal keys: the mockup cards are seeded deterministically here. */
async function seedKeys(
  userId: string,
  options: { qualified: boolean; failed: boolean },
): Promise<void> {
  const createdAt = new Date('2026-11-09T10:00:00Z');
  const qualifiedReport = report('44444444-4444-4444-8444-444444444444', MODEL, 'qualified');
  const failedReport = report('55555555-5555-4555-8555-555555555555', FAILED_MODEL, 'failed');
  const rows = [];
  if (options.qualified) {
    rows.push({
      id: '66666666-6666-4666-8666-666666666666',
      userId,
      provider: 'openai' as const,
      label: 'OpenAI',
      modelIds: [MODEL],
      encryptedKey: Buffer.alloc(32, 7), // ciphertext placeholder, never decrypted by the screen
      keyLast4: 'a91F',
      status: 'qualified' as const,
      qualification: {
        keyPrefix: 'sk',
        models: { [MODEL]: qualifiedReport },
        lastRunId: qualifiedReport.id,
      },
      outsideEu: true,
      qualifiedAt: new Date('2026-11-10T10:00:00Z'),
      createdAt,
      updatedAt: createdAt,
    });
  }
  if (options.failed) {
    rows.push({
      id: '77777777-7777-4777-8777-777777777777',
      userId,
      provider: 'deepseek' as const,
      label: 'DeepSeek',
      modelIds: [FAILED_MODEL],
      encryptedKey: Buffer.alloc(32, 9),
      keyLast4: '77c2',
      status: 'failed' as const,
      qualification: {
        keyPrefix: 'sk',
        models: { [FAILED_MODEL]: failedReport },
        lastRunId: failedReport.id,
      },
      outsideEu: true,
      qualifiedAt: null,
      createdAt: new Date(createdAt.getTime() + 1000),
      updatedAt: createdAt,
    });
  }
  if (rows.length > 0) {
    await serviceDb().insert(aiCredentials).values(rows);
  }
  if (options.qualified) {
    // The mockup shows the tutor task on « OpenAI · ma clé ».
    await serviceDb().execute(sql`
      insert into public.ai_task_models (user_id, task, credential_id, model_id)
      values (${userId}::uuid, 'tutor', '66666666-6666-4666-8666-666666666666'::uuid, ${MODEL})
      on conflict (user_id, task) do update
        set credential_id = excluded.credential_id, model_id = excluded.model_id
    `);
  }
}

function report(
  id: string,
  modelId: string,
  status: 'qualified' | 'failed',
): import('@learny/contracts').QualificationReport {
  return {
    id,
    credentialId: '66666666-6666-4666-8666-666666666666',
    modelId,
    provider: 'openai',
    status,
    startedAt: '2026-11-10T09:59:00Z',
    finishedAt: '2026-11-10T10:00:00Z',
    durationMs: 60_000,
    modelVersion: '2026-11',
    steps: (['connection', 'tools', 'structured', 'bricks'] as const).map((step) => ({
      step,
      status: status === 'failed' && step === 'bricks' ? ('failed' as const) : ('passed' as const),
      durationMs: 1000,
      errorCode: status === 'failed' && step === 'bricks' ? 'INVALID_OUTPUT' : null,
      modelVersion: '2026-11',
    })),
    bricks: Array.from({ length: 13 }, (_entry, index) => ({
      type: index === 0 ? 'matching' : 'text',
      status: index === 0 && status === 'failed' ? ('failed' as const) : ('passed' as const),
      durationMs: 10,
      errorCode: index === 0 && status === 'failed' ? 'INVALID_OUTPUT' : null,
      issues: [],
    })),
    capabilities: {
      tools: true,
      structured: true,
      web_search: false,
      passage_refs: false,
      vision: true,
    },
  };
}

async function cleanupDemoKeys(): Promise<void> {
  const id = demoUserId('alex');
  await serviceDb().execute(sql`delete from public.ai_credentials where user_id = ${id}::uuid`);
}

/** Signs the test browser in as the seeded demonstration user (SPEC-115). */
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
    demo.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await page.clock.setFixedTime(NOW);
}

test('parcours SPEC-709 @SPEC-709', async ({ page, axeCheck, captureEvidence }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#modeles');

  // EF-1, BR-SET-01 — the hash opens the tab and its title.
  await expect(page.getByTestId('settings-tab-modeles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('settings-title')).toHaveText('Modèles d’IA');
  await expect(page.getByTestId('ai-models-principle')).toBeVisible();
  await expect(page.getByTestId('provider-card')).toHaveCount(1);
  await expect(page.getByTestId('provider-card')).toContainText('Anthropic · Claude');
  await expect(page.getByTestId('provider-card')).toContainText('Par défaut');

  // EF-1 — five task rows, each one with a selector of the qualified models only.
  await expect(page.getByTestId('ai-task-model')).toHaveCount(5);
  for (const task of ['programme', 'course', 'gaps', 'tutor', 'light']) {
    const row = page.getByTestId(`ai-task-${task}`);
    await expect(row.getByTestId('ai-task-model')).toBeVisible();
    await expect(row).toContainText('Par défaut');
  }
  await expect(page.getByTestId('ai-task-tutor').getByTestId('ai-task-model')).toContainText(
    'Claude Sonnet',
  );

  // EF-3, EF-4 — adding a provider: the outside-EU warning appears before any submit.
  await page.getByTestId('provider-add').click();
  await expect(page.getByTestId('provider-form')).toBeVisible();
  await page.getByTestId('provider-form-type').selectOption('openai');
  await expect(page.getByTestId('provider-region-warning')).toHaveText(
    'Traite les données hors de l’Union européenne',
  );
  await page.getByTestId('provider-form-model').fill(MODEL);
  await page.getByTestId('provider-form-key').fill(KEY);
  await page.getByTestId('provider-qualify').click();
  await expect(page.getByTestId('provider-qualification-result')).toBeVisible();
  await expect(page.getByTestId('provider-qualification-result')).toContainText(
    'Modèle qualifié',
  );
  await expect(page.getByTestId('provider-qualification-result')).toContainText('Connexion');
  await page.getByTestId('provider-save').click();
  await expect(page.getByTestId('provider-card')).toHaveCount(2);

  // CA-2 — the card only renders the mask and the four last characters.
  const openaiCard = page
    .getByTestId('provider-card')
    .filter({ hasText: 'OpenAI' })
    .filter({ hasNotText: 'Anthropic' });
  await expect(openaiCard).toContainText('Votre clé · sk-••••••••a91F');
  await expect(openaiCard).not.toContainText(KEY);
  await expect(openaiCard.getByTestId('provider-region-warning')).toHaveText(
    'Traite les données hors de l’Union européenne',
  );
  await expect(openaiCard).toContainText('Qualifié');

  // CA-1, EF-2 — a qualified model is assigned, survives a reload, then resets.
  const tutor = page.getByTestId('ai-task-tutor');
  const assigned = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/ai/models') &&
      response.request().method() === 'PATCH',
  );
  await tutor.getByTestId('ai-task-model').selectOption({ label: 'OpenAI · ma clé' });
  expect((await assigned).status()).toBe(200);
  await expect(tutor).toContainText('Personnalisé');
  await expect(tutor).toContainText('Hors UE');
  await page.reload();
  await expect(page.getByTestId('settings-tab-modeles')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('ai-task-tutor')).toContainText('Personnalisé');
  await expect(page.getByTestId('ai-task-tutor').getByTestId('ai-task-model')).toHaveValue(
    /^[0-9]+$/,
  );

  // CA-1 — a failed model of the learner never appears in the five selectors (CL-5 card kept).
  if (session !== null) {
    await seedKeys(session.userId, { qualified: false, failed: true });
  }
  await page.reload();
  await expect(page.getByTestId('provider-card')).toHaveCount(3);
  const failedCard = page.getByTestId('provider-card').filter({ hasText: 'DeepSeek' });
  await expect(failedCard).toContainText('Non qualifié');
  await expect(failedCard).toContainText('brique « Association »');
  for (const task of ['programme', 'course', 'gaps', 'tutor', 'light']) {
    await expect(page.getByTestId(`ai-task-${task}`)).not.toContainText(FAILED_MODEL);
  }
  for (const select of await page.getByTestId('ai-task-model').all()) {
    expect(await select.locator('option').allTextContents()).not.toContain(FAILED_MODEL);
  }

  // EF-2 — « Revenir aux modèles par défaut » keeps the keys and restores the provided models.
  await page.getByTestId('ai-reset-models').click();
  await expect(page.getByTestId('ai-task-tutor')).toContainText('Par défaut');
  await expect(page.getByTestId('ai-task-tutor')).not.toContainText('Personnalisé');
  await expect(page.getByTestId('provider-card')).toHaveCount(3);
  await page.reload();
  await expect(page.getByTestId('ai-task-tutor')).toContainText('Par défaut');

  await captureEvidence('spec-709-parametres-modeles');

  // CL-1 — a server failure keeps the screen usable and offers « Réessayer ».
  await page.route('**/api/v1/me/ai/models', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Erreur interne',
        status: 500,
        detail: 'Erreur simulée.',
        code: 'INTERNAL_ERROR',
        requestId: 'spec-709-e2e',
      }),
    });
  });
  await page.getByTestId('ai-reset-models').click();
  await expect(page.getByTestId('ai-models-error')).toBeVisible();
  await expect(page.getByTestId('ai-models-retry')).toBeVisible();
  await page.unroute('**/api/v1/me/ai/models');

  await axeCheck();
});

test('conformité SPEC-709 @SPEC-709 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  await cleanupDemoKeys();
  await seedKeys(demoUserId('alex'), { qualified: true, failed: true });
  await page.goto('/parametres#modeles');
  await expect(page.getByTestId('provider-card')).toHaveCount(3);
  await expect(page.getByTestId('ai-task-tutor')).toContainText('Personnalisé');

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="ai-models-principle"]': { 'background-color': '#111113', color: '#FFFFFF' },
    '[data-testid="ai-task-models"]': { 'background-color': '#FFFFFF' },
    '[data-testid="ai-task-programme"]': { 'background-color': '#F8F8F6' },
    '[data-testid="provider-card"]': { 'background-color': '#FFFFFF' },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'font-family',
    /Space[ _]Grotesk/,
  );
  await expect(page.getByTestId('ai-task-tutor').getByTestId('ai-task-model')).toContainText(
    'OpenAI · ma clé',
  );

  // Mockup comparison region by region (ADR-0034, ≤ 12 %); the reference is a 0.9 render of the
  // maquette, the crops are resized to the rendered element by `compareRegions`.
  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-15-modeles-desktop.png',
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'ai-models-principle',
        locator: page.getByTestId('ai-models-principle'),
        rect: { x: 310, y: 161, width: 1044, height: 121 },
      },
      {
        name: 'ai-task-models',
        locator: page.getByTestId('ai-task-models-list'),
        rect: { x: 311, y: 378, width: 1041, height: 363 },
      },
      {
        name: 'ai-providers',
        locator: page.getByTestId('ai-providers-cards'),
        rect: { x: 311, y: 808, width: 1041, height: 171 },
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

  await expectScreenshotBaseline(page, 'spec-709-parametres-modeles-desktop.png', {
    fullPage: true,
  });
  await axeCheck();
});

test('conformité SPEC-709 mobile @SPEC-709 @visual @mobile', async ({
  page,
  axeCheck,
  baseURL,
  context,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await useDemoUser(context, baseURL, page);
  await cleanupDemoKeys();
  await seedKeys(demoUserId('alex'), { qualified: true, failed: false });
  await page.goto('/parametres#modeles');
  await expect(page.getByTestId('ai-task-model')).toHaveCount(5);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-709-parametres-modeles-mobile.png', {
    fullPage: true,
  });
  await axeCheck();
});
