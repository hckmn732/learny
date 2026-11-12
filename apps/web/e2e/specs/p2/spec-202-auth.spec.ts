import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { extractAuthLink, linkOnOrigin, mailCount, waitForMail } from '@learny/testing/auth';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const DEMO = '/_dev/sdd/SPEC-202';
const TITLE = 'SPEC-202 — Authentification et sessions';
const CARDS = [
  'auth-session',
  'auth-magic',
  'auth-password',
  'auth-destinations-card',
  'auth-sign-out-card',
];

function uniqueEmail(): string {
  return `e2e-${randomBytes(5).toString('hex')}@test.learny.test`;
}

test('inscription et connexion par lien magique puis déconnexion @SPEC-202', async ({
  page,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const email = uniqueEmail();
  await page.goto(DEMO);
  await expect(page.getByTestId('auth-session-state')).toHaveText('Non connecté');

  await page.getByLabel('Adresse e-mail').first().fill(email);
  await page.getByRole('button', { name: 'Créer un compte par lien' }).click();
  await expect(page.getByTestId('auth-result')).toHaveText('Lien envoyé. Il reste valable 1 heure.');

  // CA-1 — the e-mail arrives, the link signs the learner in and leads to the first onboarding step.
  const mail = await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });
  await page.goto(linkOnOrigin(extractAuthLink(mail), origin));
  await expect(page).toHaveURL(`${origin}/premiers-pas/profil`);

  await page.goto(DEMO);
  const state = page.getByTestId('auth-session-state');
  await expect(state).toContainText('Connecté : ');
  await expect(state).toContainText('étape d’onboarding profil');
  await captureEvidence('spec-202-connecte');

  // BR-ACC-09 — signing out closes the session, a protected page asks to sign in again.
  await page.getByTestId('auth-sign-out').click();
  await expect(page.getByTestId('auth-sign-out-result')).toHaveText('Vous êtes déconnecté.');
  await expect(state).toHaveText('Non connecté');
  await page.goto('/accueil');
  await expect(page).toHaveURL(`${origin}/connexion?suite=%2Faccueil`);

  await page.goto(DEMO);
  await axeCheck();
});

test('mot de passe et renvoi limité @SPEC-202', async ({ page, baseURL, axeCheck }) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const email = uniqueEmail();
  const password = `pw-${randomBytes(10).toString('hex')}`;
  await page.goto(DEMO);

  await page.getByTestId('auth-password-email').fill(email);
  await page.getByTestId('auth-password-value').fill('a'.repeat(11));
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByTestId('auth-password-result')).toContainText(
    'Les données envoyées sont invalides.',
  );

  // CA-2 — twelve characters create the account; no session before the e-mail is confirmed.
  await page.getByTestId('auth-password-value').fill(password);
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByTestId('auth-password-result')).toHaveText(
    'Compte créé : consultez votre boîte mail pour confirmer votre adresse.',
  );
  await page.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(page.getByTestId('auth-password-result')).toHaveText(
    'Vérifiez votre adresse e-mail avant de vous connecter.',
  );

  // CA-3 — a second sending within 60 seconds is refused, with a countdown.
  await page.getByLabel('Adresse e-mail').first().fill(email);
  await page.getByRole('button', { name: 'Créer un compte par lien' }).click();
  await expect(page.getByTestId('auth-result')).toHaveText(
    /^Vous pourrez renvoyer le lien dans \d+ secondes\.$/,
  );
  expect(await mailCount(email)).toBe(1);

  const mail = await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });
  await page.goto(linkOnOrigin(extractAuthLink(mail), origin));
  await expect(page).toHaveURL(`${origin}/premiers-pas/profil`);

  await page.goto(DEMO);
  await page.getByTestId('auth-sign-out').click();
  await expect(page.getByTestId('auth-session-state')).toHaveText('Non connecté');
  await page.getByTestId('auth-password-email').fill(email);
  await page.getByTestId('auth-password-value').fill(password);
  await page.getByRole('button', { name: 'Me connecter', exact: true }).click();
  await expect(page.getByTestId('auth-password-result')).toHaveText(
    'Connexion réussie. Destination : /premiers-pas/profil',
  );
  await expect(page.getByTestId('auth-session-state')).toContainText('Connecté : ');
  await axeCheck();
});

test('le proxy garde les pages et l’onboarding @SPEC-202', async ({ page, context, baseURL }) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  // Anonymous visitor: a protected page leads to the sign-in page, with the way back.
  await page.goto('/agenda?semaine=2');
  await expect(page).toHaveURL(`${origin}/connexion?suite=%2Fagenda%3Fsemaine%3D2`);

  const session = await createTestSession();
  try {
    await context.addCookies(
      session.cookies.map((cookie) => ({ ...cookie, url: origin })),
    );
    // CL-5 — onboarding interrupted at the « rythme » step: the app stays closed.
    const { url, serviceRoleKey } = supabaseLocalEnv();
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    await admin.from('profiles').update({ onboarding_step: 'rythme' }).eq('id', session.userId);
    await page.goto('/agenda');
    await expect(page).toHaveURL(`${origin}/premiers-pas/rythme`);
    await page.goto('/connexion');
    await expect(page).toHaveURL(`${origin}/premiers-pas/rythme`);

    // Once the AI step is behind, the application opens (the cookie is remembered).
    await admin.from('profiles').update({ onboarding_step: 'rappels' }).eq('id', session.userId);
    await page.goto('/agenda');
    await expect(page).toHaveURL(`${origin}/agenda`);
    expect((await context.cookies()).some((cookie) => cookie.name === 'lr-onboarded')).toBe(true);
    await page.goto('/connexion');
    await expect(page).toHaveURL(`${origin}/accueil`);
  } finally {
    await deleteTestSession(session);
  }
});

test('page de démonstration SPEC-202 @SPEC-202 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'État de la session',
    'Lien magique',
    'Mot de passe',
    'Destination',
    'Se déconnecter',
  ]);
  await expect(page.getByTestId('auth-session-state')).toHaveText('Non connecté');

  // EF-8 — the destination table is computed by the real function.
  const rows = await page
    .getByTestId('auth-destination-row')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).innerText.trim().replace(/\s+/g, ' ')),
    );
  expect(rows).toEqual([
    'Onboarding à l’étape profil /premiers-pas/profil',
    'Onboarding à l’étape rythme /premiers-pas/rythme',
    'Onboarding à l’étape IA /premiers-pas/ia',
    'Onboarding terminé /accueil',
    'Onboarding terminé, next = /agenda /agenda',
    'Onboarding terminé, next externe (//evil.example) /accueil',
    'Suppression de compte programmée /parametres#profil',
  ]);

  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="auth-session"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="auth-magic"] button': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);
  await expect(page.getByLabel('Adresse e-mail').first()).toBeVisible();

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-202-demo.png', { fullPage: true });
});
