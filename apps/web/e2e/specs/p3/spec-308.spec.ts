import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReference,
  cropPng,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const AUTH_ROUTES = [
  {
    path: '/inscription',
    heading: 'Créer votre compte',
    counter: 'Étape 1 sur 7 · Compte',
  },
  {
    path: '/connexion',
    heading: 'Bon retour',
    counter: 'Connexion',
  },
  {
    path: '/verifier-email',
    heading: 'Vérifiez votre boîte mail',
    counter: 'Étape 2 sur 7 · Vérification',
  },
] as const;

const REFERENCE = new URL(
  '../../../../../design/references/SCR-01-base-desktop.png',
  import.meta.url,
);

async function ready(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function confirmedSession(): Promise<TestSession> {
  const session = await createTestSession();
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { error } = await admin
    .from('profiles')
    .update({ onboarding_step: 'done' })
    .eq('id', session.userId);
  if (error !== null) throw new Error(`profil de test : ${error.message}`);
  return session;
}

test('Pages système et mise en page d’authentification @SPEC-308', async ({
  page,
  context,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';

  // 404 : h1, action utile, aucun détail interne, aucun identifiant inventé (CA-1, CL-2).
  const notFound = await page.goto('/legal/page-inconnue-spec-308');
  expect(notFound?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible();
  await expect(page.getByTestId('system-error-request-id')).toHaveCount(0);
  expect(await page.content()).not.toMatch(/SQLSTATE|db\.internal|\.tsx:\d+|ECONNREFUSED/);
  await axeCheck();

  // Hors-ligne : texte et action de reprise visibles.
  await page.goto('/hors-ligne');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
  await expect(page.getByRole('link', { name: 'Réessayer' })).toHaveAttribute(
    'href',
    '/hors-ligne',
  );
  await axeCheck();

  // Erreur récupérable : identifiant présent, Réessayer rend la page (CA-2).
  await page.goto('/_dev/sdd/SPEC-006');
  await page.getByRole('button', { name: 'Simuler une erreur de page' }).click();
  await expect(page.getByTestId('system-error')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Une erreur est survenue');
  await expect(page.getByTestId('system-error-request-id')).toHaveText(
    'Identifiant de requête : req-spec006-page',
  );
  expect(await page.content()).not.toMatch(/\n\s+at |\.js:\d+:\d+|Erreur simulée/);
  await axeCheck();
  await page.getByTestId('system-error-retry').click();
  await expect(page.getByTestId('system-error')).toHaveCount(0);
  await expect(page.getByTestId('spec-006-client')).toBeVisible();
  await captureEvidence('spec-308-parcours');

  // Le layout d’authentification est partagé par les trois étapes (EF-3, EF-4, CA-3).
  // Il est vérifié avant l’ouverture de session : le proxy éloigne un apprenant connecté des
  // pages d’inscription et de connexion.
  for (const route of AUTH_ROUTES) {
    await page.goto(route.path);
    await expect(page.getByTestId('auth-layout')).toBeVisible();
    await expect(page.getByTestId('auth-panel')).toHaveAttribute('aria-label', 'Learny');
    await expect(page.getByTestId('auth-main')).toBeVisible();
    await expect(page.getByTestId('auth-step-counter')).toHaveText(route.counter);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(
      page.getByTestId('auth-card').or(page.getByTestId('verify-card')),
    ).toBeVisible();
    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.locator('[data-testid="app-sidebar"]')).toHaveCount(0);
    await axeCheck();
  }

  // Desktop : le panneau sombre est à gauche, la carte à droite, sur la même ligne.
  const panel = await page.getByTestId('auth-panel').boundingBox();
  const main = await page.getByTestId('auth-main').boundingBox();
  expect(panel?.x ?? 1).toBeLessThan(main?.x ?? 0);
  expect(Math.abs((panel?.y ?? 0) - (main?.y ?? 0))).toBeLessThanOrEqual(1);
  await captureEvidence('spec-308-auth-desktop');

  // Session expirée : route connectée → Connexion avec le retour local.
  await context.clearCookies();
  await page.goto('/acces-refuse');
  await expect(page).toHaveURL(`${origin}/connexion?suite=%2Facces-refuse`);

  const session = await confirmedSession();
  try {
    await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: origin })));

    // Accès refusé : h1, action et aucune information interne.
    await page.goto('/acces-refuse');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accès refusé');
    await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible();
    expect(await page.content()).not.toMatch(/SQLSTATE|db\.internal|\.tsx:\d+|ECONNREFUSED/);
    await axeCheck();
    await captureEvidence('spec-308-acces-refuse');

    // Retour local accepté, retour externe refusé (CA-4).
    await page.goto('/connexion?suite=%2Fhors-ligne');
    await expect(page).toHaveURL(`${origin}/hors-ligne`);
    await page.goto('/connexion?suite=https%3A%2F%2Fevil.example');
    await expect(page).toHaveURL(`${origin}/accueil`);
    expect(page.url()).not.toContain('evil.example');
  } finally {
    await deleteTestSession(session);
  }
});

test('Pages système et mise en page d’authentification @SPEC-308 @visual @mobile', async ({
  page,
  context,
  baseURL,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const desktop = testInfo.project.name === 'desktop';
  const visualDir = testInfo.outputPath('visual');
  fs.mkdirSync(visualDir, { recursive: true });

  for (const route of AUTH_ROUTES) {
    await page.goto(route.path);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(page.getByTestId('auth-layout')).toBeVisible();
    await expectTokens(page, {
      '[data-testid="auth-panel"]': { 'background-color': colors.ink },
      '[data-testid="auth-panel"] p.font-display': { 'font-size': '30.6px' },
      '[data-testid="auth-step-counter"]': { color: colors['on-dark-muted'] },
      '[data-testid="auth-card"], [data-testid="verify-card"]': {
        'background-color': colors.surface,
        'border-color': colors.border,
        'border-radius': '21.6px',
      },
    });
    await expect(page.locator('[data-testid="auth-panel"] p.font-display').first()).toHaveCSS(
      'font-family',
      /Space Grotesk/,
    );
    await axeCheck();
    await expectScreenshotBaseline(page, `spec-308-${route.path.slice(1)}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
    await captureEvidence(`spec-308-${route.path.slice(1)}`);

    if (desktop) {
      const panel = await page.getByTestId('auth-panel').boundingBox();
      const main = await page.getByTestId('auth-main').boundingBox();
      expect(panel?.x ?? 1).toBeLessThan(main?.x ?? 0);
      expect(Math.abs((panel?.y ?? 0) - (main?.y ?? 0))).toBeLessThanOrEqual(1);
    } else {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `défilement horizontal ${route.path}`).toBeLessThanOrEqual(0);
      const panel = await page.getByTestId('auth-panel').boundingBox();
      const main = await page.getByTestId('auth-main').boundingBox();
      expect(panel?.y ?? 1).toBeLessThan(main?.y ?? 0);
      expect(panel?.width ?? 0).toBeCloseTo(390, 0);
      expect(main?.width ?? 0).toBeCloseTo(390, 0);
    }
  }

  // Comparaison au layout de Inscription.dc.html : panneau sombre gauche (CA-5). La référence
  // desktop est capturée à 90 % ; la capture mobile ne se compare pas à cette échelle.
  if (desktop) {
    await page.goto('/inscription');
    await ready(page);
    const panelWidth = 343;
    const referencePanel = path.join(visualDir, 'scr-01-panel-reference.png');
    fs.writeFileSync(referencePanel, cropPng(fileURLToPath(REFERENCE), panelWidth, 900));
    const actualPanel = await page.screenshot({
      clip: { x: 0, y: 0, width: panelWidth, height: 900 },
      animations: 'disabled',
    });
    const comparison = compareWithReference(
      actualPanel,
      referencePanel,
      visualDir,
      'spec-308-auth-panel',
    );
    expect(comparison.ratio, 'écart au panneau de la maquette').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
    await testInfo.attach('spec-308-auth-panel-reference', {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('spec-308-auth-panel-diff', {
      path: comparison.diffPath,
      contentType: 'image/png',
    });
    await testInfo.attach('spec-308-auth-panel-ratio', {
      body: JSON.stringify(comparison, null, 2),
      contentType: 'application/json',
    });
  }

  // 404 et hors-ligne : jetons, axe et ligne de base.
  await page.goto('/legal/page-inconnue-spec-308');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="system-not-found"] h1': { 'font-size': '30.6px' },
    '[data-testid="system-not-found-card"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '21.6px',
    },
  });
  await expect(page.locator('[data-testid="system-not-found"] h1')).toHaveCSS(
    'font-family',
    /Space Grotesk/,
  );
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-308-404.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('spec-308-404');

  await page.goto('/hors-ligne');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-308-hors-ligne.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('spec-308-hors-ligne');

  // Access denied and error states need a real session / an intentional boundary error.
  const session = await confirmedSession();
  try {
    await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: origin })));
    await page.goto('/acces-refuse');
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accès refusé');
    await axeCheck();
    await expectScreenshotBaseline(page, 'spec-308-acces-refuse.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
    await captureEvidence('spec-308-acces-refuse');
  } finally {
    await deleteTestSession(session);
  }

  await page.goto('/_dev/sdd/SPEC-006');
  await page.getByRole('button', { name: 'Simuler une erreur de page' }).click();
  await expect(page.getByTestId('system-error')).toBeVisible();
  await ready(page);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-308-error.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('spec-308-error');
});
