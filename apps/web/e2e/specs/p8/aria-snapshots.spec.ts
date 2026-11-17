// SPEC-803 EF-4, CA-3 — accessible-name snapshots of the nine key regions. The .aria.yml files
// are versioned next to the spec; a rename or a missing aria-label changes the snapshot.
import { closeDb } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

import {
  deleteDemoAttempts,
  resetDemoRateLimits,
  seedDemoExamAttempts,
  type DemoExamAttempts,
} from '../../support/demo-exam';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const MODULE = demoModuleId('sap', 1);

let session: TestSession;
let exam: DemoExamAttempts;

test.setTimeout(180_000);

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  exam = await seedDemoExamAttempts();
});

test.afterAll(async () => {
  await deleteDemoAttempts([exam.inProgressId, exam.gradedId]);
  await restoreDemoData();
  await resetDemoRateLimits();
  await closeDb();
});

test('noms accessibles des régions clés @SPEC-803', async ({ page, context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await resetDemoRateLimits();

  await page.goto('/accueil');
  await expect(page.getByTestId('shell-header')).toBeVisible();
  await expect(page.getByTestId('shell-header')).toMatchAriaSnapshot({
    name: 'header.aria.yml',
  });
  await expect(page.getByTestId('sidebar')).toMatchAriaSnapshot({ name: 'sidebar.aria.yml' });

  await page.getByTestId('header-notifications').click();
  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await expect(page.getByTestId('notification-panel')).toMatchAriaSnapshot({
    name: 'notifications.aria.yml',
  });
  await page.keyboard.press('Escape');

  await page.goto(`/formations/${SAP}/modules/${MODULE}/quiz`);
  await expect(page.getByTestId('quiz-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-page')).toMatchAriaSnapshot({ name: 'quiz-question.aria.yml' });

  await page.goto(`/formations/${SAP}/quiz-global`);
  const recall = page.getByTestId('gq-recall');
  await expect(recall).toBeVisible({ timeout: 30_000 });
  await expect(recall).toMatchAriaSnapshot({ name: 'recall-card.aria.yml' });

  await page.goto(`/formations/${SAP}/examen-blanc/${exam.inProgressId}`);
  await expect(page.getByTestId('exam-palette')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('exam-palette')).toMatchAriaSnapshot({
    name: 'exam-palette.aria.yml',
  });

  await page.goto(`/formations/${SAP}/carte`);
  await page.getByTestId('graph-gap-item').first().click();
  await expect(page.getByTestId('graph-detail')).toBeVisible();
  await expect(page.getByTestId('graph-detail')).toMatchAriaSnapshot({
    name: 'graph-detail.aria.yml',
  });

  await page.goto('/parametres#profil');
  await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('settings-tabs')).toMatchAriaSnapshot({
    name: 'settings-tabs.aria.yml',
  });

  await page.goto('/connexion');
  await expect(page.getByTestId('auth-content')).toBeVisible();
  await expect(page.getByTestId('auth-content')).toMatchAriaSnapshot({
    name: 'connexion-form.aria.yml',
  });
});
