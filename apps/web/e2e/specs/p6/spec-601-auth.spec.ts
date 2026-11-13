import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { extractAuthLink, linkOnOrigin, waitForMail } from '@learny/testing/auth';
import { expect, test } from '@learny/testing/playwright';
import { deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import {
  compareWithReference,
  cropPng,
  expectScreenshotBaseline,
  expectTokens,
  MOCKUP_MAX_DIFF_RATIO,
} from '@learny/testing/visual';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PASSWORD = `pw-${randomBytes(10).toString('hex')}`;

function uniqueEmail(): string {
  return `e2e601-${randomBytes(5).toString('hex')}@test.learny.test`;
}

async function createPasswordUser(
  email: string,
  onboardingStep: 'profil' | 'done' = 'done',
): Promise<{ userId: string; email: string }> {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { timezone: 'Europe/Paris' },
  });
  if (created.error !== null) throw new Error(created.error.message);
  const userId = created.data.user.id;
  const updated = await admin
    .from('profiles')
    .update({ onboarding_step: onboardingStep })
    .eq('id', userId);
  if (updated.error !== null) throw new Error(updated.error.message);
  return { userId, email };
}

function collectRequestUrls(page: import('@playwright/test').Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

function expectNoEmailInUrls(urls: readonly string[]): void {
  for (const url of urls) expect(decodeURIComponent(url), 'adresse dans une URL').not.toContain('@');
}

async function compareScreen(
  page: import('@playwright/test').Page,
  reference: string,
  name: string,
): Promise<void> {
  const testInfo = test.info();
  const actualPath = testInfo.outputPath(`${name}-actual.png`);
  const referencePath = testInfo.outputPath(`${name}-reference.png`);
  const actual = cropPng(await page.screenshot({ fullPage: true, animations: 'disabled' }), 1440, 900);
  const mockup = cropPng(path.join(ROOT, 'design/references', reference), 1440, 900);
  fs.writeFileSync(actualPath, actual);
  fs.writeFileSync(referencePath, mockup);
  const comparison = compareWithReference(
    actualPath,
    referencePath,
    testInfo.outputPath('visual'),
    name,
  );
  await testInfo.attach(`${name}-side-by-side`, {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  await testInfo.attach(`${name}-ratio`, {
    body: JSON.stringify(comparison, null, 2),
    contentType: 'application/json',
  });
  expect(comparison.ratio, `écart ${name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
}

test('inscription par lien magique jusqu’aux premiers pas @SPEC-601', async ({
  page,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const email = uniqueEmail();
  const urls = collectRequestUrls(page);

  await page.goto('/inscription');
  await expect(page.getByTestId('auth-step-counter')).toHaveText('Étape 1 sur 7 · Compte');
  await expect(page.getByRole('radio', { name: /Recevoir un lien de connexion/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.getByTestId('auth-email').fill('pas-un-email');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toHaveText('Saisissez une adresse e-mail valide.');

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toHaveText(
    'Acceptez les conditions pour créer votre compte.',
  );
  await expect(page.getByTestId('auth-email')).toHaveValue(email);

  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(`${origin}/verifier-email`);
  await expect(page.getByText(new RegExp(`lien de connexion à ${email}`))).toBeVisible();
  await captureEvidence('inscription-verification');

  // CA-2 — the e-mailed link opens a session and leads to the first onboarding step.
  const mail = await waitForMail(email);
  await page.goto(linkOnOrigin(extractAuthLink(mail), origin));
  await expect(page).toHaveURL(`${origin}/premiers-pas/profil`);

  await axeCheck();
  expectNoEmailInUrls(urls);
});

test('inscription par mot de passe et solidité @SPEC-601', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const email = uniqueEmail();
  const urls = collectRequestUrls(page);
  await page.goto('/inscription');
  await page.getByTestId('auth-method-password').click();
  await page.getByTestId('auth-email').fill(email);

  const strength = page.getByTestId('auth-strength');
  await page.getByTestId('auth-password').fill('abcdefgh');
  await expect(strength).toHaveAttribute('data-strength', '1');
  await expect(page.getByTestId('auth-strength-hint')).toHaveText(
    'Encore un effort : allongez-le, ajoutez un chiffre ou un symbole.',
  );

  await page.getByTestId('auth-password').fill('abcdefgh1');
  await expect(strength).toHaveAttribute('data-strength', '2');

  await page.getByTestId('auth-password').fill('motdepassefacile1!');
  await expect(strength).toHaveAttribute('data-strength', '4');
  await expect(page.getByTestId('auth-strength-hint')).toHaveText('Mot de passe solide.');

  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/verifier-email$/);
  await expect(page.getByText(new RegExp(`lien de confirmation à ${email}`))).toBeVisible();
  await captureEvidence('inscription-mot-de-passe');

  // EF-10 — clicking before opening the link tells the learner what to do.
  await page.getByTestId('verify-confirm').click();
  await expect(page.getByTestId('verify-status')).toHaveText(
    'Le lien n’a pas encore été ouvert sur ce navigateur. Ouvrez-le depuis l’e-mail reçu.',
  );

  await axeCheck();
  expectNoEmailInUrls(urls);
});

test('renvoi limité à 60 s @SPEC-601', async ({ page, axeCheck, captureEvidence }) => {
  const user = await createPasswordUser(uniqueEmail());
  try {
    const urls = collectRequestUrls(page);
    await page.addInitScript(
      `sessionStorage.setItem('learny.pendingAuth', JSON.stringify(${JSON.stringify({
        email: user.email,
        method: 'password',
        intent: 'signup',
        sentAt: '2026-11-11T12:20:00.000Z',
      })}));`,
    );
    await page.goto('/verifier-email');
    const resend = page.getByTestId('verify-resend');
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText('renvoyez le lien (dans 60 s)');
    await captureEvidence('verification-compte-a-rebours');

    await page.clock.fastForward(60_000);
    await expect(resend).toBeEnabled();
    await expect(resend).toHaveText('renvoyez le lien');
    await resend.click();
    await expect(page.getByTestId('verify-status')).toHaveText(
      'Nouveau lien envoyé. Il reste valable 1 heure.',
    );
    await expect(resend).toHaveText('renvoyez le lien (dans 60 s)');
    await captureEvidence('verification-renvoi');

    // A forced server call during the countdown receives 429 with Retry-After.
    const response = await page.request.post('/api/v1/auth/resend', {
      data: { email: user.email, kind: 'magic_link' },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(response.status()).toBe(429);
    expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);

    await axeCheck();
    expectNoEmailInUrls(urls);
  } finally {
    await deleteTestSession(user);
  }
});

test('connexion par mot de passe, erreurs et lien expiré @SPEC-601', async ({
  page,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const user = await createPasswordUser(uniqueEmail());
  try {
    const urls = collectRequestUrls(page);
    await page.goto('/connexion');
    await expect(page.getByTestId('auth-step-counter')).toHaveText('Connexion');
    await page.getByTestId('auth-method-password').click();
    await page.getByTestId('auth-email').fill(user.email);
    await page.getByTestId('auth-password').fill('mauvais-mot-de-passe');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('auth-error')).toHaveText(
      'Adresse e-mail ou mot de passe incorrect.',
    );

    await page.getByTestId('auth-password').fill(PASSWORD);
    await page.getByTestId('auth-submit').click();
    await expect(page).toHaveURL(`${origin}/accueil`);
    await captureEvidence('connexion-accueil');

    // EF-11 — an expired link explains itself on the sign-in screen.
    await page.context().clearCookies();
    await page.goto('/connexion?erreur=lien-expire');
    await expect(page.getByTestId('auth-error')).toHaveText(
      'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    );

    // CL-11 — the switch keeps the address, never in the URL.
    const email = uniqueEmail();
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-switch').click();
    await expect(page).toHaveURL(`${origin}/inscription`);
    await expect(page.getByTestId('auth-email')).toHaveValue(email);

    await axeCheck();
    for (const url of urls) {
      expect(decodeURIComponent(url)).not.toContain(encodeURIComponent(email));
    }
    expectNoEmailInUrls(urls.filter((url) => !url.startsWith('data:')));
  } finally {
    await deleteTestSession(user);
  }
});

test('conformité SCR-01 compte, connexion et vérification @SPEC-601 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/inscription');
  await expect(page.getByRole('heading', { name: 'Créer votre compte' })).toBeVisible();
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="auth-panel"]': { 'background-color': '#111113' },
    '[data-testid="auth-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="auth-submit"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
      'border-top-left-radius': '12.6px',
      'min-height': '45px',
    },
    '[data-testid="auth-email"]': {
      'border-top-color': '#DAD9D3',
      'border-top-left-radius': '10.8px',
      'min-height': '43.2px',
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space[ _]Grotesk/);
  const follows = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="auth-panel"]');
    const main = document.querySelector('[data-testid="auth-main"]');
    return (
      panel !== null &&
      main !== null &&
      (panel.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
  });
  expect(follows).toBe(true);
  await captureEvidence('inscription-compte');
  await compareScreen(page, 'SCR-01-base-desktop.png', 'SCR-01-inscription');
  await expectScreenshotBaseline(page, 'spec-601-inscription-desktop.png', { fullPage: true });

  await page.goto('/connexion');
  await expect(page.getByRole('heading', { name: 'Bon retour' })).toBeVisible();
  await expect(page.getByTestId('auth-step-counter')).toHaveText('Connexion');
  await captureEvidence('connexion');
  await compareScreen(page, 'SCR-01-connexion-desktop.png', 'SCR-01-connexion');
  await expectScreenshotBaseline(page, 'spec-601-connexion-desktop.png', { fullPage: true });

  await page.addInitScript(
    `sessionStorage.setItem('learny.pendingAuth', JSON.stringify(${JSON.stringify({
      email: 'alex.perrin@exemple.fr',
      method: 'magic',
      intent: 'signup',
      sentAt: '2026-11-11T12:20:00.000Z',
    })}));`,
  );
  await page.goto('/verifier-email');
  await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();
  await expect(page.getByText(/lien de connexion à alex\.perrin@exemple\.fr/)).toBeVisible();
  await expectTokens(page, {
    '[data-testid="verify-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
  });
  await captureEvidence('verification');
  await compareScreen(page, 'SCR-01-verification-desktop.png', 'SCR-01-verification');

  await page.clock.fastForward(20_000);
  await expect(page.getByTestId('verify-resend')).toHaveText('renvoyez le lien (dans 40 s)');
  await captureEvidence('verification-compte-a-rebours');

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-601-verification-desktop.png', { fullPage: true });
});

test('conformité SCR-01 mobile @SPEC-601 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/inscription');
  await expect(page.getByRole('heading', { name: 'Créer votre compte' })).toBeVisible();
  const panel = await page.getByTestId('auth-panel').boundingBox();
  const main = await page.getByTestId('auth-main').boundingBox();
  expect(panel?.width ?? 0).toBeCloseTo(390, 0);
  expect(main?.width ?? 0).toBeCloseTo(390, 0);
  expect(main?.y ?? 0).toBeGreaterThan(panel?.y ?? 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await captureEvidence('mobile-inscription');
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-601-inscription-mobile.png', { fullPage: true });
});
