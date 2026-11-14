import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
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

let session: TestSession;

test.beforeAll(async () => {
  // The demo dataset is shared by the whole e2e run: restore it before asserting its state.
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

test('journée d’Alex et navigation depuis l’accueil @SPEC-603', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/accueil$/);

  await expect(page.getByTestId('home-header')).toContainText('Mercredi 11 novembre');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "Votre journée d'apprentissage",
  );
  await expect(page.getByRole('link', { name: 'Nouvelle formation' })).toHaveAttribute(
    'href',
    '/formations/nouvelle',
  );
  await expect(page.getByTestId('home-day')).toContainText("Aujourd'hui · 5 activités");
  await expect(page.getByTestId('home-day')).toContainText('5 h 2 prévues · 3 h faites');
  await expect(page.getByTestId('home-day')).toContainText('Dans 40 min');
  await expect(page.getByTestId('home-day')).toContainText('Commencer le quiz de validation');
  await expect(page.getByTestId('home-retention')).toContainText('Notions retenues à 1 mois');
  await expect(page.getByTestId('home-global-quiz')).toContainText('14 notions à revoir');
  await expect(page.getByTestId('home-global-quiz')).toContainText('SAP S/4HANA Finance');
  await expect(page.getByTestId('home-global-quiz')).toContainText(
    '18 notions étaient dues : 4 reportées à',
  );

  // Deux onglets ARIA ; Terminées s'ouvre au clavier et dans l'URL (EF-5, CA-8).
  await page.getByTestId('home-tab-ongoing').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('home-tab-completed')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/onglet=terminees/);
  await expect(page.getByTestId('home-table-completed')).toContainText(
    "Excel pour l'analyse financière",
  );
  await expect(page.getByTestId('home-table-completed')).toContainText('Validée · 88 %');
  await expect(page.getByTestId('home-table-completed')).toContainText('Entretien arrêté');
  await axeCheck();
  await page.getByTestId('home-tab-ongoing').click();
  await expect(page).toHaveURL(/\/accueil$/);
  await expect(page.getByTestId('home-table-ongoing')).toContainText('SAP S/4HANA Finance');

  // CA-3 — chaque action mène à la bonne route.
  await page
    .getByTestId(`home-formation-action-${demoFormationId('python')}`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/formations/${demoFormationId('python')}/programme$`));
  await page.goBack();
  await page.getByTestId(`home-formation-action-${demoFormationId('sap')}`).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/formations/${demoFormationId('sap')}/modules/${demoModuleId('sap', 3)}$`,
    ),
  );
  await page.goBack();
  await page.getByRole('link', { name: 'Jouer maintenant' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/formations/${demoFormationId('sap')}/quiz-global$`),
  );
  await page.goBack();

  await axeCheck();
  await captureEvidence('accueil-en-cours');
});

test('accueil d’un nouvel utilisateur @SPEC-603', async ({ page, axeCheck, captureEvidence, baseURL }) => {
  const fresh = await createTestSession();
  try {
    await serviceDb().execute(sql`
      update public.profiles set onboarding_step = 'done' where id = ${fresh.userId}::uuid
    `);
    await page.context().clearCookies();
    await page.context().addCookies(
      fresh.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
    );
    await page.goto('/accueil');
    await expect(page.getByTestId('home-day')).toContainText(
      "Aucune activité prévue aujourd'hui.",
    );
    await expect(page.getByTestId('home-retention')).toContainText('Pas encore de mesure');
    await expect(page.getByTestId('home-global-quiz')).toHaveCount(0);
    await expect(page.getByTestId('home-empty-ongoing')).toContainText('Aucune formation en cours');
    await page.getByTestId('home-tab-completed').click();
    await expect(page.getByText("Aucune formation terminée pour l'instant.")).toBeVisible();
    await page.getByRole('link', { name: 'Créer une formation' }).click();
    await expect(page).toHaveURL(/\/formations\/nouvelle$/);
    await captureEvidence('accueil-vide');
    await axeCheck();
  } finally {
    await deleteTestSession(fresh);
  }
});

test('passage de l’heure @SPEC-603', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T12:20:00Z') });
  await page.goto('/accueil');
  await expect(page.getByTestId('home-day')).toContainText('Dans 40 min');
  await page.clock.fastForward('00:41:00');
  await expect(page.getByTestId('home-day')).toContainText('En cours', { timeout: 10_000 });
});

test('conformité SCR-03 par régions @SPEC-603 @visual', async ({ page, axeCheck }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');
  await expect(page.getByTestId('home-formations')).toBeVisible();
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="home-day"]': { 'background-color': '#111113', 'border-radius': '21.6px' },
    '[data-testid="home-global-quiz"]': { 'background-color': '#C6F432' },
    '[data-testid="home-retention"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="home-formations"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'font-family',
    /Space[_ ]Grotesk/,
  );

  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-03-base-desktop.png',
    outputDir: test.info().outputPath('visual'),
    regions: [
      {
        name: 'home-header',
        locator: page.getByTestId('home-header').locator('div').first(),
        rect: { x: 310, y: 56, width: 600, height: 90 },
      },
      {
        name: 'home-day',
        locator: page.getByTestId('home-day').locator('div').first(),
        rect: { x: 338, y: 270, width: 622, height: 24 },
      },
      {
        name: 'home-retention',
        locator: page.getByTestId('home-retention'),
        rect: { x: 991, y: 248, width: 362, height: 167 },
      },
      {
        name: 'home-global-quiz',
        locator: page.getByTestId('home-global-quiz'),
        rect: { x: 996, y: 433, width: 357, height: 229 },
      },
      {
        name: 'home-formations',
        locator: page.getByTestId('home-formations'),
        rect: { x: 310, y: 1506, width: 1044, height: 328 },
      },
    ],
  });
  for (const region of regions) {
    await test.info().attach(`${region.name}-side-by-side`, {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await test.info().attach(`${region.name}-diff`, {
      path: region.diffPath,
      contentType: 'image/png',
    });
    expect(region.ratio, `écart ${region.name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }

  await page.getByTestId('home-tab-completed').click();
  const completed = await compareRegions(page, {
    reference: 'design/references/SCR-03-formations-terminees-desktop.png',
    outputDir: test.info().outputPath('visual'),
    regions: [
      {
        name: 'home-formations-terminees',
        locator: page.getByTestId('home-formations'),
        rect: { x: 310, y: 1506, width: 1044, height: 286 },
      },
    ],
  });
  for (const region of completed) {
    await test.info().attach(`${region.name}-side-by-side`, {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await test.info().attach(`${region.name}-diff`, {
      path: region.diffPath,
      contentType: 'image/png',
    });
    expect(region.ratio, `écart ${region.name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }
  await page.getByTestId('home-tab-ongoing').click();
  await expectScreenshotBaseline(page, 'spec-603-accueil-desktop.png', { fullPage: true });
  await axeCheck();
});

test('accueil mobile @SPEC-603 @visual @mobile', async ({ page, axeCheck, captureEvidence }) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.goto('/accueil');
  await expect(page.getByTestId('home-day')).toBeVisible();
  const mainBox = await page.locator('main').first().boundingBox();
  expect(mainBox?.width ?? 999).toBeLessThanOrEqual(390);
  const table = page.getByTestId('home-formations').locator('div[role="region"]').first();
  const scrolls = await table.evaluate((element) => element.scrollWidth >= element.clientWidth);
  expect(scrolls).toBe(true);
  await captureEvidence('accueil-mobile');
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-603-accueil-mobile.png', { fullPage: true });
});
