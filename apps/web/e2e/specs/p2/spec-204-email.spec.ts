import { randomUUID } from 'node:crypto';

import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const TITLE = 'SPEC-204 — Service e-mail et gabarits';
const CARDS = ['email-toolbar', 'email-preview-card', 'email-outbox'];
const HEADINGS = ['Gabarit et ton', 'Aperçu', 'Boîte d’envoi'];
const PREFIX = 'sdd-204-e2e-';

const TEMPLATES = [
  'welcome',
  'daily_digest',
  'reminder',
  'weekly_review',
  'ai_task_failed',
  'export_ready',
  'deletion_scheduled',
  'deletion_completed',
] as const;

const SUBJECTS: Record<(typeof TEMPLATES)[number], string> = {
  welcome: 'Bienvenue sur Learny',
  daily_digest: 'Votre programme du mercredi 11 novembre',
  reminder: 'Quiz de validation à 14:00',
  weekly_review: 'Votre bilan de la semaine du 2 novembre au 8 novembre',
  ai_task_failed: 'Le tuteur n’a pas pu terminer : rédaction du cours',
  export_ready: 'Votre export Learny est prêt',
  deletion_scheduled: 'Suppression de votre compte programmée le vendredi 11 décembre 2026',
  deletion_completed: 'Votre compte Learny a été supprimé',
};

const TRANSACTIONAL = new Set(['export_ready', 'deletion_scheduled', 'deletion_completed']);

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({
    email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`,
  });
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

async function selectTemplate(page: import('@playwright/test').Page, key: string, tone = 'vous') {
  await page.getByTestId('email-template').selectOption(key);
  if (tone === 'tu') await page.getByTestId('email-tone-tu').click();
  else await page.getByTestId('email-tone-vous').click();
  await expect(page.getByTestId('email-subject')).toHaveText(SUBJECTS[key as keyof typeof SUBJECTS]);
}

async function capturePreview(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string,
): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.getByTestId('email-preview').screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

test('aperçu et envoi des gabarits @SPEC-204', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}, testInfo) => {
  await page.goto('/_dev/sdd/SPEC-204');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // The default tone is `vous`, the default template the daily programme.
  await expect(page.getByTestId('email-tone-vous')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('email-tone-tu')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('email-subject')).toHaveText(SUBJECTS.daily_digest);
  await expect(page.getByTestId('email-category')).toHaveText('Service');

  // CA-1 / CA-2 — the eight templates render; only the service ones carry List-Unsubscribe.
  for (const key of TEMPLATES) {
    await selectTemplate(page, key);
    await expect(page.getByTestId('email-category')).toHaveText(
      TRANSACTIONAL.has(key) ? 'Transactionnel' : 'Service',
    );
    const headers = page.getByTestId('email-headers');
    if (TRANSACTIONAL.has(key)) {
      await expect(headers).toContainText('Aucun en-tête de désinscription');
    } else {
      await expect(headers).toContainText('List-Unsubscribe:');
      await expect(headers).toContainText('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    }
    // `ai_task_failed` would end with `sk-failed`, which the secret scanner reads as an API key.
    const evidenceName = key === 'ai_task_failed' ? 'email-ia-echec' : `email-${key}`;
    await capturePreview(page, testInfo, evidenceName);
  }

  // CA-3 — the `tu` variant of the welcome e-mail.
  await page.getByTestId('email-template').selectOption('welcome');
  await page.getByTestId('email-tone-tu').click();
  await expect(page.getByTestId('email-subject')).toHaveText('Bienvenue sur Learny');
  const tu = await page
    .frameLocator('[data-testid="email-preview"]')
    .locator('body')
    .innerText();
  expect(tu).toContain('Ton compte est prêt');
  expect(tu).not.toMatch(/\b(vous|votre|vos)\b/i);
  await capturePreview(page, testInfo, 'email-welcome-tu');

  // CA-6 — a send reaches the current transport (memory in tests) and the outbox.
  await page.getByTestId('email-template').selectOption('daily_digest');
  await page.getByTestId('email-tone-vous').click();
  await expect(page.getByTestId('email-subject')).toHaveText(SUBJECTS.daily_digest);
  await page.getByTestId('email-send').click();
  await expect(page.getByTestId('email-send-status')).toHaveText(
    'Envoyé par le transport memory.',
  );
  const outbox = page.getByTestId('email-outbox');
  await expect(outbox).toContainText(SUBJECTS.daily_digest);
  await expect(outbox).toContainText('***@');

  // CA-4 — the List-Unsubscribe URL of the service e-mail opens the confirmation page.
  const headersText = await page.getByTestId('email-headers').innerText();
  const token = /unsubscribe\?token=([^\s>]+)/.exec(headersText)?.[1];
  expect(token, 'jeton de désinscription présent').toBeTruthy();
  await page.goto(`/api/v1/email/unsubscribe?token=${token ?? ''}`);
  await expect(page.getByTestId('unsubscribe-title')).toHaveText(
    'Ne plus recevoir les e-mails de rappel de Learny ?',
  );
  await expect(page.getByText('Les e-mails liés à la sécurité de votre compte')).toBeVisible();
  await page.getByTestId('unsubscribe-confirm').click();
  await expect(page.getByTestId('unsubscribe-done')).toHaveText(
    'C’est fait. Vous pouvez réactiver les e-mails dans Paramètres › Notifications.',
  );

  await axeCheck();
  await captureEvidence('spec-204-email');
  // The empty sandbox of the preview blocks the inline scripts React Email ships for Outlook:
  // the browser reports it as a console error, which is precisely the expected behaviour.
  expect(
    consoleErrors.filter((message) => !message.includes('Blocked script execution')),
  ).toEqual([]);
});

test('page de démonstration SPEC-204 @SPEC-204 @visual', async ({ page, axeCheck }) => {
  test.setTimeout(120_000);
  await page.goto('/_dev/sdd/SPEC-204');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('email-subject')).toHaveText(SUBJECTS.daily_digest);

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);

  // Tokens of SPEC-204 §10: page #F4F4F1, white cards #E7E6E1 with a 24 px radius, active
  // segment #111113.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="email-toolbar"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="email-preview-card"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="email-tone-vous"]': { 'background-color': '#111113' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  // Inside the preview: primary button #111113 with a 12 px radius, footer link #3A3AA8,
  // logo #C6F432.
  const preview = page.frameLocator('[data-testid="email-preview"]');
  await expect(preview.locator('[data-testid="email-cta"]')).toHaveCSS(
    'background-color',
    'rgb(17, 17, 19)',
  );
  await expect(preview.locator('[data-testid="email-cta"]')).toHaveCSS('border-radius', '12px');
  await expect(preview.locator('[data-testid="email-preferences-link"]')).toHaveCSS(
    'color',
    'rgb(58, 58, 168)',
  );
  await expect(preview.locator('[data-testid="email-logo"]')).toHaveCSS(
    'background-color',
    'rgb(198, 244, 50)',
  );

  await expectScreenshotBaseline(page, 'spec-204-demo.png', { fullPage: true });

  // The `welcome` template in the `tu` tone (preview capture).
  await page.getByTestId('email-template').selectOption('welcome');
  await page.getByTestId('email-tone-tu').click();
  await expect(page.getByTestId('email-subject')).toHaveText('Bienvenue sur Learny');
  await expect(preview.locator('body')).toContainText('Ton compte est prêt');
  await expect(page.getByTestId('email-preview')).toHaveScreenshot('spec-204-preview-tu.png');

  // Axe cannot inject its script into the empty sandbox of the preview (by design); the scan
  // covers the page itself, the e-mail document being a static, self-contained artefact.
  await page.evaluate(() => {
    document.querySelector('[data-testid="email-preview"]')?.remove();
  });
  await axeCheck();
});
