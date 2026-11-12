import { expect, test } from '@learny/testing/playwright';
import {
  createProfileUser,
  createTestSession,
  deleteTestSession,
  deleteUsersByEmailPrefix,
  type ProfileUserOptions,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const TITLE = 'SPEC-203 — Événements, jobs et crons';
const CARDS = ['jobs-demo', 'jobs-tick', 'jobs-outbox'];
const FAIL_SWITCH = 'Faire échouer l’étape 2 une fois';
const PREFIX = 'sdd-203-e2e-';

let session: TestSession;

// Factory users of the tick demonstration: Paris, Kolkata and New York are active, one user is
// still onboarding (not selected, CL-8).
test.beforeAll(async () => {
  const users: [string, string, NonNullable<ProfileUserOptions['onboardingStep']>][] = [
    ['paris', 'Europe/Paris', 'done'],
    ['kolkata', 'Asia/Kolkata', 'depart'],
    ['new-york', 'America/New_York', 'rappels'],
    ['onboarding', 'Europe/Paris', 'ia'],
  ];
  await deleteUsersByEmailPrefix(PREFIX);
  for (const [label, timezone, onboardingStep] of users) {
    await createProfileUser({ email: `${PREFIX}${label}@test.learny.test`, timezone, onboardingStep });
  }
});

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(PREFIX);
});

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

async function runPipelineAndTick(page: import('@playwright/test').Page) {
  await page.goto('/_dev/sdd/SPEC-203');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // Pipeline with a simulated failure of step 2.
  const failure = page.getByRole('switch', { name: FAIL_SWITCH });
  await expect(failure).toHaveAttribute('aria-checked', 'false');
  await failure.click();
  await expect(failure).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Émettre l’événement' }).click();
  for (const index of [1, 2, 3]) {
    await expect(page.getByTestId(`jobs-step-${String(index)}-state`)).toHaveText('Terminée');
  }
  await expect(page.getByTestId('jobs-attempts')).toHaveText('Exécutions : 2');

  // Hourly tick at the reference instant.
  await expect(page.getByLabel('Instant du tick (UTC)')).toHaveValue('2026-11-11T07:05:00Z');
  await page.getByRole('button', { name: 'Exécuter le tick' }).click();
  await expect(page.getByTestId('jobs-tick-table')).toBeVisible();
}

test('pipeline avec reprise et tick horaire @SPEC-203', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-203');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Pipeline de démonstration',
    'Tick horaire',
    'Boîte d’envoi',
  ]);

  // The three steps wait before anything is emitted.
  for (const index of [1, 2, 3]) {
    await expect(page.getByTestId(`jobs-step-${String(index)}-state`)).toHaveText('En attente');
  }
  await expect(page.getByTestId('jobs-attempts')).toHaveText('Exécutions : 0');

  await runPipelineAndTick(page);

  // CA-3, CA-6 — three steps done, step 2 ran twice, effects visible right after the emission.
  await expect(page.getByTestId('jobs-step-1')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('jobs-step-2')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('jobs-step-3')).toHaveAttribute('data-state', 'done');

  // The outbox of the caller: one event sent, none pending or failed.
  await expect(page.getByTestId('jobs-outbox-sent')).toHaveText('1');
  await expect(page.getByTestId('jobs-outbox-pending')).toHaveText('0');
  await expect(page.getByTestId('jobs-outbox-failed')).toHaveText('0');

  // CA-4 — local windows of 2026-11-11T07:05:00Z; the onboarding user is excluded.
  const rows = page.getByTestId('jobs-tick-row');
  await expect(rows).toHaveCount(3);
  const paris = rows.filter({ hasText: 'Europe/Paris' });
  await expect(paris).toContainText('08:00–09:00');
  await expect(paris).toContainText('2026-11-11');
  await expect(paris).toContainText('mercredi (3)');
  await expect(rows.filter({ hasText: 'Asia/Kolkata' })).toContainText('12:30–13:30');
  await expect(rows.filter({ hasText: 'America/New_York' })).toContainText('02:00–03:00');
  await expect(page.getByTestId('jobs-tick-count')).toHaveText('3 utilisateur(s) sélectionné(s)');

  await axeCheck();
  await captureEvidence('spec-203-jobs');
  expect(consoleErrors).toEqual([]);
});

test('page de démonstration SPEC-203 @SPEC-203 @visual @mobile', async ({ page, axeCheck }) => {
  await runPipelineAndTick(page);
  await expect(page.getByTestId('jobs-tick-row')).toHaveCount(3);
  await expect(page.getByTestId('jobs-outbox-sent')).toHaveText('1');

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  // The timeline is an ordered list of three steps.
  await expect(page.locator('[data-testid="jobs-demo"] ol > li')).toHaveCount(3);
  await expect(page.locator('[data-testid="jobs-tick-table"] th[scope="col"]')).toHaveText([
    'Utilisateur',
    'Fuseau',
    'Fenêtre locale',
    'Date locale',
    'Jour',
  ]);

  // Tokens of SPEC-203 §10: page #F4F4F1, white cards #E7E6E1 with a 24 px radius, active switch
  // #111113, "Terminée" in green #0F9F7F, "Échec, nouvelle tentative" in orange #F97316.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="jobs-demo"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="jobs-tick"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[role="switch"]': { 'background-color': '#111113' },
    '[data-testid="jobs-step-1-dot"]': { 'background-color': '#0F9F7F' },
    '[data-testid="jobs-legend-done"]': { 'background-color': '#0F9F7F' },
    '[data-testid="jobs-legend-retrying"]': { 'background-color': '#F97316' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  // Row identifiers are random: masked in the baseline.
  await expectScreenshotBaseline(page, 'spec-203-demo.png', {
    fullPage: true,
    mask: [page.locator('[data-testid="jobs-tick-row"] th')],
  });
});
