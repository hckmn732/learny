import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import {
  compareWithReference,
  cropPng,
  expectScreenshotBaseline,
  expectTokens,
  MOCKUP_MAX_DIFF_RATIO,
} from '@learny/testing/visual';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PASSWORD = `pw-${randomBytes(10).toString('hex')}`;
type Step = 'profil' | 'rythme' | 'ia' | 'rappels' | 'depart' | 'done';

async function createUser(step: Step, firstName: string | null = null): Promise<{ userId: string; email: string }> {
  const email = `e2e602-${randomBytes(5).toString('hex')}@test.learny.test`;
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
  await serviceDb().execute(sql`
    update public.profiles
    set onboarding_step = ${step}::onboarding_step,
        first_name = ${firstName}
    where id = ${userId}::uuid
  `);
  return { userId, email };
}

async function login(page: import('@playwright/test').Page, email: string, destination: RegExp): Promise<void> {
  await page.goto('/connexion');
  await page.getByTestId('auth-method-password').click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(destination);
}

async function installPushBrowser(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.mock.learny.test/e2e/success',
      expirationTime: null,
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: null,
          keys: { p256dh: 'BDemoP256dhKey_simulated', auth: 'demoAuthKey' },
        };
      },
    };
    const registration = {
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe: () => Promise.resolve(subscription),
      },
    };
    const fakeNotification = {
      permission: 'default',
      requestPermission: () => Promise.resolve('granted'),
    };
    try {
      Object.defineProperty(window, 'Notification', { value: fakeNotification, configurable: true });
      Object.defineProperty(window, 'PushManager', { value: () => undefined, configurable: true });
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: () => Promise.resolve(registration), ready: Promise.resolve(registration) },
        configurable: true,
      });
    } catch {
      // The real browser API stays in place; the test then reaches the same `channel_push = false`.
    }
  });
}

function validatedReport(modelId: string, failed: 'connection' | 'bricks') {
  const step = (key: string, ok: boolean) => ({
    step: key,
    status: ok ? 'passed' : 'failed',
    durationMs: 1,
    errorCode: ok ? null : key === 'connection' ? 'AI_KEY_INVALID' : 'NOT_RUN',
    modelVersion: modelId,
  });
  return {
    id: '11111111-1111-4111-8111-111111111111',
    credentialId: '22222222-2222-4222-8222-222222222222',
    modelId,
    provider: 'anthropic',
    status: 'failed',
    startedAt: '2026-11-11T12:20:00.000Z',
    finishedAt: '2026-11-11T12:20:01.000Z',
    durationMs: 1000,
    modelVersion: modelId,
    steps: [
      step('connection', failed !== 'connection'),
      step('tools', failed !== 'connection'),
      step('structured', failed !== 'connection'),
      step('bricks', false),
    ],
    bricks: Array.from({ length: 13 }, () => ({
      type: 'text',
      status: 'failed',
      durationMs: 0,
      errorCode: 'NOT_RUN',
      issues: [],
    })),
    capabilities: {
      tools: failed !== 'connection',
      structured: failed !== 'connection',
      web_search: false,
      passage_refs: false,
      vision: false,
    },
  };
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
  const comparison = compareWithReference(actualPath, referencePath, testInfo.outputPath('visual'), name);
  await testInfo.attach(`${name}-side-by-side`, { path: comparison.sideBySidePath, contentType: 'image/png' });
  await testInfo.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  await testInfo.attach(`${name}-ratio`, {
    body: JSON.stringify(comparison, null, 2),
    contentType: 'application/json',
  });
  expect(comparison.ratio, `écart ${name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
}

test.afterAll(async () => {
  await closeDb();
});

test('premiers pas avec clé personnelle qualifiée @SPEC-602', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const user = await createUser('profil');
  try {
    await login(page, user.email, /\/premiers-pas\/profil$/);
    await expect(page.getByTestId('onboarding-step-profil')).toBeVisible();
    await page.getByTestId('profile-first-name').fill('Alex');
    await page.getByTestId('tone-tu').click();
    await expect(page.getByTestId('tone-preview')).toContainText(
      'Bonjour Alex, voici tes 3 activités du jour.',
    );
    await page.getByTestId('course-language').selectOption('en');
    await captureEvidence('profil');
    await axeCheck();
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/premiers-pas\/rythme$/);
    const profile = await serviceDb().execute<{ tutor_tone: string; course_language: string; timezone: string }>(
      sql`select tutor_tone::text as tutor_tone, course_language::text as course_language, timezone from public.profiles where id = ${user.userId}::uuid`,
    );
    expect(profile[0]).toMatchObject({ tutor_tone: 'tu', course_language: 'en', timezone: 'Europe/Paris' });

    await page.getByTestId('hours-5').click();
    await page.getByTestId('slot-matin').click();
    await page.getByTestId('slot-apres_midi').click();
    await page.getByTestId('slot-soir').click();
    await expect(page.getByTestId('rhythm-summary')).toHaveText(
      '5 h par jour, 5 jours sur 7, plutôt matin et après-midi : 25 h par semaine.',
    );
    await captureEvidence('rythme');
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/premiers-pas\/ia$/);
    const preferences = await serviceDb().execute<{ hours_per_day: number; preferred_slots: string[] }>(
      sql`select hours_per_day, preferred_slots::text[] as preferred_slots from public.study_preferences where user_id = ${user.userId}::uuid`,
    );
    expect(preferences[0]).toMatchObject({ hours_per_day: 5, preferred_slots: ['matin', 'apres_midi'] });

    await page.getByTestId('ai-key').fill(`sk-ant-e2e-${randomBytes(6).toString('hex')}`);
    await page.getByTestId('ai-test').click();
    await expect(page.getByTestId('ai-status')).toHaveText('Clé valide · modèle qualifié pour Learny', {
      timeout: 30_000,
    });
    await captureEvidence('ia-cle-qualifiee');
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/premiers-pas\/rappels$/);
    const assignments = await serviceDb().execute<{ count: number }>(
      sql`select count(*)::int as count from public.ai_task_models where user_id = ${user.userId}::uuid`,
    );
    expect(assignments[0]?.count).toBe(5);

    await installPushBrowser(page);
    await page.reload();
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/premiers-pas\/depart$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue, Alex !');
    await expect(page.getByText('Ton compte est prêt. Par quoi veux-tu commencer ?')).toBeVisible();
    await captureEvidence('depart');
    await axeCheck();
    await page.getByTestId('departure-create').click();
    await expect(page).toHaveURL(/\/formations\/nouvelle$/);
    const done = await serviceDb().execute<{ step: string; completed: string | null; events: number }>(sql`
      select p.onboarding_step::text as step, p.onboarding_completed_at::text as completed,
             (select count(*)::int from public.event_outbox e
              where e.user_id = p.id and e.name = 'user/onboarding-completed') as events
      from public.profiles p where p.id = ${user.userId}::uuid
    `);
    expect(done[0]?.step).toBe('done');
    expect(done[0]?.completed).toBe('2026-11-11 12:20:00+00');
    expect(done[0]?.events).toBe(1);
  } finally {
    await deleteTestSession(user);
  }
});

test('premiers pas avec IA fournie et paiement @SPEC-602', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const owning = await createUser('ia');
  const cancelling = await createUser('rappels');
  try {
    await login(page, owning.email, /\/premiers-pas\/ia$/);
    await page.goto('/premiers-pas/ia');
    await page.getByTestId('ai-choice-managed').click();
    await expect(page.getByText('Abonnement mensuel, sans engagement.')).toBeVisible();
    await captureEvidence('ia-fournie');
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/premiers-pas\/rappels$/);
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/_dev\/stripe\/checkout/);
    await page.getByRole('button', { name: 'Payer' }).click();
    await expect(page).toHaveURL(/\/premiers-pas\/depart\?abonnement=ok$/);
    await expect(page.getByTestId('billing-status')).toHaveText('Abonnement activé : le tuteur est prêt.', {
      timeout: 15_000,
    });
    await captureEvidence('depart-abonnement-ok');
    await axeCheck();
  } finally {
    await deleteTestSession(owning);
  }

  try {
    await page.context().clearCookies();
    await login(page, cancelling.email, /\/premiers-pas\/rappels$/);
    await page.goto('/premiers-pas/rappels');
    await page.getByTestId('onboarding-continue').click();
    await expect(page).toHaveURL(/\/_dev\/stripe\/checkout/);
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page).toHaveURL(/\/premiers-pas\/depart\?abonnement=annule$/);
    await expect(page.getByTestId('billing-status')).toContainText(
      'Le paiement n’a pas abouti : le tuteur restera indisponible',
    );
    await captureEvidence('depart-abonnement-annule');
    await page.getByRole('button', { name: 'Reprendre le paiement' }).click();
    await expect(page).toHaveURL(/\/_dev\/stripe\/checkout/);
  } finally {
    await deleteTestSession(cancelling);
  }
});

test('reprise de l’onboarding et clé refusée @SPEC-602', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const user = await createUser('ia');
  try {
    await login(page, user.email, /\/premiers-pas\/ia$/);
    await page.route('**/api/v1/me/ai/credentials/*/qualify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(validatedReport('claude-sonnet-5-5', 'connection')),
      }),
    );
    await page.getByTestId('ai-key').fill(`sk-ant-refused-${randomBytes(5).toString('hex')}`);
    await page.getByTestId('ai-test').click();
    await expect(page.getByTestId('ai-status')).toHaveText(
      'Clé refusée par le fournisseur. Vérifiez-la.',
    );
    await page.getByTestId('onboarding-continue').click();
    await expect(page.getByTestId('ai-error')).toHaveText(
      'Testez votre clé avant de continuer, ou choisissez l’IA fournie.',
    );
    await captureEvidence('ia-cle-refusee');
    await axeCheck();

    await page.goto('/accueil');
    await expect(page).toHaveURL(/\/premiers-pas\/ia$/);
    await page.context().clearCookies();
    await login(page, user.email, /\/premiers-pas\/ia$/);

    const patched = await page.request.patch('/api/v1/me/onboarding', {
      data: { step: 'rappels', aiChoice: 'managed' },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(patched.status()).toBe(200);
    await page.goto('/accueil');
    await expect(page).toHaveURL(/\/accueil$/);
  } finally {
    await deleteTestSession(user);
  }
});

test('rejoindre par invitation @SPEC-602', async ({ page, axeCheck, captureEvidence }) => {
  const user = await createUser('depart', 'Alex');
  try {
    await login(page, user.email, /\/premiers-pas\/depart$/);
    await page.route('**/api/v1/invitations/*/accept', async (route) => {
      const code = new URL(route.request().url()).pathname.split('/').at(-2);
      if (code === 'LRN-AB2C') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            formationId: '33333333-3333-4333-8333-333333333333',
            formationTitle: 'Gestion de projet agile',
            memberFirstNames: ['Camille', 'Hugo'],
          }),
        });
        return;
      }
      if (code === 'LRN-CD3E') {
        await route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          body: JSON.stringify({ code: 'GROUP_FULL', status: 409, title: 'Complet', detail: 'Complet' }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'NOT_FOUND', status: 404, title: 'Introuvable', detail: 'Introuvable' }),
      });
    });
    await page.goto('/premiers-pas/depart');
    await page.getByTestId('invite-join').click();
    await expect(page.getByTestId('invite-error')).toHaveText(
      'Collez le code ou le lien reçu par e-mail.',
    );
    await page.getByTestId('invite-input').fill('LRN-AB1C');
    await page.getByTestId('invite-join').click();
    await expect(page.getByTestId('invite-error')).toHaveText(
      'Ce code d’invitation n’est pas valide.',
    );
    await page.getByTestId('invite-input').fill('LRN-ZZ9Z');
    await page.getByTestId('invite-join').click();
    await expect(page.getByTestId('invite-error')).toHaveText(
      'Ce code d’invitation n’existe pas ou a été régénéré.',
    );
    await page.getByTestId('invite-input').fill('LRN-CD3E');
    await page.getByTestId('invite-join').click();
    await expect(page.getByTestId('invite-error')).toHaveText(
      'Cette formation compte déjà 10 membres.',
    );
    await page.getByTestId('invite-input').fill('lrn-ab2c');
    await page.getByTestId('invite-join').click();
    await expect(page.getByTestId('invite-status')).toContainText(
      'Invitation acceptée : « Gestion de projet agile », avec Camille et Hugo.',
    );
    await expect(page.getByTestId('invite-status').getByRole('link', { name: 'Ouvrir l’accueil' })).toBeVisible();
    await captureEvidence('invitation');
    await axeCheck();
    const done = await serviceDb().execute<{ step: string; events: number }>(sql`
      select p.onboarding_step::text as step,
             (select count(*)::int from public.event_outbox e
              where e.user_id = p.id and e.name = 'user/onboarding-completed') as events
      from public.profiles p where p.id = ${user.userId}::uuid
    `);
    expect(done[0]).toMatchObject({ step: 'done', events: 1 });
  } finally {
    await deleteTestSession(user);
  }
});

async function visualState(
  page: import('@playwright/test').Page,
  userId: string,
  step: Step,
  firstName: string | null,
): Promise<void> {
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = ${step}::onboarding_step, first_name = ${firstName}
    where id = ${userId}::uuid
  `);
}

test('conformité SCR-02 premiers pas @SPEC-602 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const user = await createUser('profil');
  try {
    await login(page, user.email, /\/premiers-pas\/profil$/);
    const states: [Step, string | null, string, string][] = [
      ['profil', null, 'profil', 'SCR-02-profil-desktop.png'],
      ['rythme', null, 'rythme', 'SCR-02-rythme-desktop.png'],
      ['ia', null, 'ia-cle', 'SCR-02-ia-desktop.png'],
      ['rappels', null, 'rappels', 'SCR-02-rappels-desktop.png'],
      ['depart', 'Alex', 'depart', 'SCR-02-depart-desktop.png'],
    ];
    for (const [step, firstName, name, reference] of states) {
      await visualState(page, user.userId, step, firstName);
      await page.goto(`/premiers-pas/${step}`);
      await expect(page.getByTestId(`onboarding-step-${step}`)).toBeVisible();
      await captureEvidence(name);
      await compareScreen(page, reference, `SCR-02-${name}`);
      await expectScreenshotBaseline(page, `spec-602-${name}-desktop.png`, { fullPage: true });
    }
    await visualState(page, user.userId, 'ia', null);
    await page.goto('/premiers-pas/ia');
    await page.getByTestId('ai-choice-managed').click();
    await captureEvidence('ia-fournie');
    await expectScreenshotBaseline(page, 'spec-602-ia-fournie-desktop.png', { fullPage: true });

    await visualState(page, user.userId, 'depart', 'Alex');
    await page.goto('/premiers-pas/depart');
    await expectTokens(page, {
      body: { 'background-color': '#F4F4F1', color: '#111113' },
      '[data-testid="auth-panel"]': { 'background-color': '#111113' },
      '[data-testid="departure-create"]': { 'background-color': '#111113' },
      '[data-testid="invite-join"]': { 'background-color': '#C6F432', color: '#111113' },
    });
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space[ _]Grotesk/);
    await axeCheck();
  } finally {
    await deleteTestSession(user);
  }
});

test('conformité SCR-02 mobile @SPEC-602 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const user = await createUser('depart', 'Alex');
  try {
    await login(page, user.email, /\/premiers-pas\/depart$/);
    const states: [Step, string | null, string][] = [
      ['profil', null, 'profil'],
      ['rythme', null, 'rythme'],
      ['ia', null, 'ia-cle'],
      ['rappels', null, 'rappels'],
      ['depart', 'Alex', 'depart'],
    ];
    for (const [step, firstName, name] of states) {
      await visualState(page, user.userId, step, firstName);
      await page.goto(`/premiers-pas/${step}`);
      await expect(page.getByTestId(`onboarding-step-${step}`)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await captureEvidence(`mobile-${name}`);
      await expectScreenshotBaseline(page, `spec-602-${name}-mobile.png`, { fullPage: true });
    }
    await axeCheck();
  } finally {
    await deleteTestSession(user);
  }
});
