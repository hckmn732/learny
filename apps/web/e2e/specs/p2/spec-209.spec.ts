import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-209';
const TITLE = 'SPEC-209 — Service unifié de notifications';
const SECTIONS = ['spec-209-settings', 'spec-209-send', 'spec-209-result', 'spec-209-digest'];

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await serviceDb().execute(sql`
    update public.notification_settings
    set channel_email = true, channel_push = true, max_per_day = 5,
        quiet_start = '21:00', quiet_end = '08:00', weekend_quiet = true
    where user_id = ${session.userId}::uuid
  `);
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('routage des notifications @SPEC-209', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Réglages simulés',
    'Envoi',
    'Résultat',
    'Programme du jour',
  ]);

  const notify = page.getByRole('button', { name: 'Notifier' });

  // CL-1 — 22:30 with the default 21:00–08:00 quiet hours: both external channels are deferred.
  await page.getByTestId('spec-209-type').selectOption('validation_soon');
  await page.getByTestId('spec-209-at').selectOption('evening');
  await notify.click();
  await expect(page.getByTestId('spec-209-result')).toContainText(
    'Votre quiz de validation approche',
  );
  await expect(page.getByTestId('spec-209-delivery-email')).toContainText(
    'Reportée (heures calmes)',
  );
  await expect(page.getByTestId('spec-209-delivery-push')).toContainText(
    'Reportée (heures calmes)',
  );

  // CA-3 — cap 3 and four immediate sends: the fourth is capped and summarised for tomorrow.
  await page.getByTestId('spec-209-cap-3').check({ force: true });
  await page.getByTestId('spec-209-at').selectOption('wednesday');
  await page.getByTestId('spec-209-type').selectOption('milestone');
  for (let index = 1; index <= 4; index += 1) {
    await notify.click();
    await expect(page.getByTestId('spec-209-result')).not.toContainText('Envoi en cours');
    if (index < 4) {
      await expect(page.getByTestId('spec-209-delivery-email')).toContainText('Envoyée');
      await expect(page.getByTestId('spec-209-delivery-push')).toContainText(
        'Non envoyée (préférence)',
      );
    }
  }
  await expect(page.getByTestId('spec-209-delivery-email')).toContainText('Écartée (plafond)');
  await expect(page.getByTestId('spec-209-digest-held')).toContainText(
    '1 notification n’a pas été envoyée hier pour respecter votre limite de 3 par jour',
  );
  await expect(page.getByTestId('spec-209-digest-held')).toContainText('Nouveau palier atteint');

  // CA-5, CL-8 — the tone applies to the tutor text, the fixed label stays “Ouvrir”.
  await page.getByTestId('spec-209-tone').selectOption('tu');
  await page.getByTestId('spec-209-type').selectOption('course_ready');
  await notify.click();
  await expect(page.getByTestId('spec-209-result')).toContainText('Ton cours est prêt');
  await expect(page.getByTestId('spec-209-result').getByRole('link')).toHaveText('Ouvrir');

  // CL-9 — Saturday: a course is deferred to Monday, end of the quiet hours.
  await page.getByTestId('spec-209-at').selectOption('saturday');
  await notify.click();
  await expect(page.getByTestId('spec-209-delivery-email')).toContainText(
    'Reportée (heures calmes)',
  );
  await expect(page.getByTestId('spec-209-delivery-email')).toContainText('16/11/2026 08:00');

  await axeCheck();
  await captureEvidence('spec-209-routing');
});

test('notifications conformes @SPEC-209 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Réglages simulés',
    'Envoi',
    'Résultat',
    'Programme du jour',
  ]);
  await expect(page.getByRole('radio')).toHaveCount(3);

  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-209-settings"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-209-send"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-209-send"] button': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-209-notifications.png', { fullPage: true });
});
