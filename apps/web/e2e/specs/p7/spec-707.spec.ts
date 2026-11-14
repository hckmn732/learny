import { closeDb, serviceDb, sql } from '@learny/db';
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

/** Fresh learner for the functional parcours; deleted after every test. */
let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  // SPEC-202 onboarding is delivered by SPEC-601/602; the settings screen belongs to a learner
  // who has finished it.
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
  await closeDb();
});

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

test('parcours SPEC-707 @SPEC-707', async ({ page, axeCheck, captureEvidence }) => {
  // ADR-0047 — the browser clock is frozen so the J+30 label is deterministic.
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#notifications');

  // CA-1 — the hash selects the tab, the title follows and the panel is announced.
  await expect(page.getByTestId('settings-tab-notifications')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-title')).toHaveText('Notifications');
  await expect(page.getByTestId('settings-panel-notifications')).toBeVisible();
  await expect(page).toHaveURL(/#notifications$/);

  // EF-1 — exactly four tabs, in the mockup order.
  await expect(page.getByRole('tablist', { name: 'Rubriques des paramètres' })).toBeVisible();
  await expect(page.getByTestId('settings-tabs').getByRole('tab')).toHaveCount(4);

  // CA-1 — the arrows change the tab, the hash follows and the focus moves (roving tabindex).
  await page.getByTestId('settings-tab-notifications').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('settings-tab-automatismes')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-tab-automatismes')).toBeFocused();
  await expect(page).toHaveURL(/#automatismes$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('settings-tab-modeles')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('settings-tab-profil')).toBeFocused();
  await expect(page).toHaveURL(/#profil$/);
  await page.keyboard.press('End');
  await expect(page.getByTestId('settings-tab-modeles')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('settings-tab-profil')).toHaveAttribute('aria-selected', 'true');

  // CL-3 — an unknown hash opens Profil and normalises the URL, without a blank screen.
  await page.goto('/parametres#inconnu');
  await expect(page.getByTestId('settings-tab-profil')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#profil$/);
  await expect(page.getByTestId('profile-identity')).toBeVisible();

  // CA-2 — 5 h/jour and 5 days on 7 give the exact mockup summary.
  await page.getByTestId('profile-hours-5').click();
  await page.getByTestId('profile-slot-matin').click();
  await page.getByTestId('profile-slot-apres_midi').click();
  // The defaults already select « soir »: it is removed because two moments remain.
  await page.getByTestId('profile-slot-soir').click();
  await expect(page.getByTestId('profile-rhythm-summary')).toHaveText(
    '5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine.',
  );
  // BR-ACC-12 — the e-mail of the profile is never editable.
  await expect(page.getByTestId('profile-email')).toHaveAttribute('readonly', '');

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/profile') && response.request().method() === 'PATCH',
  );
  await page.getByTestId('profile-save').click();
  const patch = await saved;
  expect(patch.status()).toBe(200);
  await expect(page.getByTestId('profile-save-status')).toHaveText('Modifications enregistrées');
  const rows = await serviceDb().execute<{
    hours_per_day: number;
    preferred_slots: string[];
    timezone: string;
    tone: string;
  }>(sql`
    select sp.hours_per_day, sp.preferred_slots::text[] as preferred_slots,
           p.timezone::text as timezone, p.tutor_tone::text as tone
      from public.study_preferences sp
      join public.profiles p on p.id = sp.user_id
     where sp.user_id = ${session?.userId}::uuid
  `);
  expect(rows[0]).toMatchObject({
    hours_per_day: 5,
    preferred_slots: ['matin', 'apres_midi'],
    timezone: 'Europe/Paris',
    tone: 'vous',
  });

  // EF-3 — another tab then a reload find the saved values again.
  await page.getByTestId('settings-tab-notifications').click();
  await expect(page).toHaveURL(/#notifications$/);
  await page.reload();
  await expect(page.getByTestId('settings-tab-notifications')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByTestId('settings-tab-profil').click();
  await expect(page.getByTestId('profile-hours-5')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-slot-apres_midi')).toHaveAttribute('aria-pressed', 'true');

  // CA-2, CL-1 — 0 and 7 hours per day are refused by the API, nothing is written.
  const origin = new URL(page.url()).origin;
  const refused = await page.request.patch('/api/v1/me/profile', {
    data: { rhythm: { hoursPerDay: 7, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] } },
    headers: { origin },
  });
  expect(refused.status()).toBe(400);
  const zero = await page.request.patch('/api/v1/me/profile', {
    data: { rhythm: { hoursPerDay: 0, studyDays: [1], preferredSlots: ['soir'] } },
    headers: { origin },
  });
  expect(zero.status()).toBe(400);
  const empty = await page.request.patch('/api/v1/me/profile', {
    data: { rhythm: { hoursPerDay: 5, studyDays: [], preferredSlots: ['soir'] } },
    headers: { origin },
  });
  expect(empty.status()).toBe(400);
  const kept = await serviceDb().execute<{ hours_per_day: number }>(sql`
    select hours_per_day from public.study_preferences where user_id = ${session?.userId}::uuid
  `);
  expect(kept[0]?.hours_per_day).toBe(5);

  // CA-3 — the export goes through the real service of SPEC-211 and shows its real status.
  await page.getByTestId('data-export').click();
  const exportDialog = page.getByTestId('data-export-dialog');
  await expect(exportDialog).toBeVisible();
  const exportSent = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/export') && response.request().method() === 'POST',
  );
  await exportDialog.getByRole('button', { name: 'Exporter' }).click();
  const exportResponse = await exportSent;
  expect(exportResponse.status()).toBe(202);
  await expect(page.getByTestId('data-export-status')).toHaveText(/Export prêt\./, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('data-export-download')).toHaveAttribute(
    'href',
    /\/api\/v1\/me\/exports\/[0-9a-f-]+\?download=1$/,
  );
  const download = await page.request.get(
    (await page.getByTestId('data-export-download').getAttribute('href')) ?? '',
    { maxRedirects: 0 },
  );
  expect(download.status()).toBe(302);

  // CA-3, CL-5 — the deletion is scheduled at J+30 (11 décembre 2026), then cancelled.
  await page.getByTestId('account-delete').click();
  const deleteDialog = page.getByTestId('account-delete-dialog');
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog).toContainText('11 décembre 2026');
  const deleteSent = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/deletion') && response.request().method() === 'POST',
  );
  await deleteDialog.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deleteResponse = await deleteSent;
  expect(deleteResponse.status()).toBe(200);
  await expect(page.getByTestId('deletion-status')).toContainText(
    /Suppression programmée le .*11 décembre 2026/,
  );
  await expect(page.getByTestId('deletion-cancel')).toBeVisible();
  const scheduled = await serviceDb().execute<{ scheduled: string | null }>(sql`
    select deletion_scheduled_for::text as scheduled
      from public.profiles where id = ${session?.userId}::uuid
  `);
  expect(scheduled[0]?.scheduled).toBe('2026-12-11 12:20:00+00');

  // The destructive trigger disappears while a request is pending: only the cancellation remains.
  await expect(page.getByTestId('account-delete')).toHaveCount(0);
  await page.getByTestId('deletion-cancel').click();
  await expect(page.getByTestId('deletion-status')).toHaveText('Aucune suppression programmée.');
  const cleared = await serviceDb().execute<{ scheduled: string | null }>(sql`
    select deletion_scheduled_for::text as scheduled
      from public.profiles where id = ${session?.userId}::uuid
  `);
  expect(cleared[0]?.scheduled).toBeNull();

  // Error state (EF-5) — a server failure keeps the form and shows a recoverable message.
  await page.route('**/api/v1/me/profile', (route) =>
    route.fulfill({ status: 500, body: 'server down' }),
  );
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-error')).toBeVisible();
  await page.unroute('**/api/v1/me/profile');

  await captureEvidence('spec-707-parametres-profil');
  await axeCheck();
});

test('conformité SCR-15 @SPEC-707 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  // The maquette is rendered from the SPEC-115 dataset: Alex Perrin, 5 h par jour, L-V,
  // matin et après-midi. A fresh test session would not carry the shell of the reference.
  await page.goto('/parametres');
  await expect(page.getByTestId('profile-identity')).toContainText('Alex');
  await expect(page.getByTestId('profile-identity')).toContainText('alex.perrin@demo.learny.test');

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="settings-tabs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="settings-tab-profil"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="profile-identity"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-radius': '21.6px',
    },
    '[data-testid="profile-rhythm-summary"]': { 'background-color': '#F4F4F1' },
    '[data-testid="data-privacy"]': { 'background-color': '#FFFFFF' },
    '[data-testid="data-export"]': { 'background-color': '#FFFFFF' },
    '[data-testid="account-delete"]': { color: '#B42318' },
    '[data-testid="profile-save"]': { 'background-color': '#111113', color: '#FFFFFF' },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space[ _]Grotesk/);
  await expect(page.getByTestId('profile-rhythm-summary')).toHaveText(
    '5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine.',
  );

  // Mockup comparison region by region (ADR-0034, ≤ 12 %); the reference is a 0.9 render of the
  // maquette, the crops are resized to the rendered element by `compareRegions`.
  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-15-base-desktop.png',
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'settings-tabs',
        locator: page.getByTestId('settings-tabs'),
        rect: { x: 962, y: 99, width: 388, height: 32 },
      },
      {
        name: 'profile-identity',
        locator: page.getByTestId('profile-identity'),
        rect: { x: 313, y: 168, width: 506, height: 434 },
      },
      {
        name: 'profile-rhythm',
        locator: page.getByTestId('profile-rhythm'),
        rect: { x: 844, y: 166, width: 506, height: 365 },
      },
      {
        name: 'data-privacy',
        locator: page.getByTestId('data-privacy'),
        rect: { x: 313, y: 632, width: 1038, height: 71 },
      },
      {
        name: 'profile-save',
        locator: page.getByTestId('profile-save'),
        rect: { x: 1243, y: 730, width: 108, height: 40 },
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

  await expectScreenshotBaseline(page, 'spec-707-parametres-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SCR-15 mobile @SPEC-707 @visual @mobile', async ({
  page,
  axeCheck,
  baseURL,
  context,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await useDemoUser(context, baseURL, page);
  await page.goto('/parametres');
  await expect(page.getByTestId('profile-identity')).toContainText('Alex');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-707-parametres-mobile.png', { fullPage: true });
  await axeCheck();
});
