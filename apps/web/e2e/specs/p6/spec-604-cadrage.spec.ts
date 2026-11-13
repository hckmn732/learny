import fs from 'node:fs';

import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReference,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NEW = '/formations/nouvelle';
const Q1 = 'SAP S/4HANA Finance couvre plusieurs domaines. Lesquels voulez-vous maîtriser ?';
const Q2 =
  'Quel est votre point de départ : connaissez-vous déjà la comptabilité, ou un autre module SAP ?';
const Q3 = 'Noté. Quel niveau visez-vous à la fin de la formation ? Plusieurs réponses possibles.';
const Q4 = 'Combien de temps pouvez-vous consacrer à cette formation chaque semaine ?';
const Q5 = 'Quand souhaitez-vous commencer et finir cette formation ?';
const DONE = 'Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez.';

let session: TestSession;

async function subscribe(userId: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end)
    values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    on conflict (user_id) do update set status = 'active', current_period_end = '2030-01-01T00:00:00Z'
  `);
}

async function answer(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.getByTestId('cadrage-reply').fill(text);
  await page.getByTestId('cadrage-send').click();
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await subscribe(session.userId);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('cadrage complet jusqu’à la génération du programme @SPEC-604', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(NEW);
  await expect(page.getByTestId('cadrage-title-input')).toBeVisible();
  await page.getByTestId('cadrage-title-input').fill('SAP S/4HANA Finance');
  await page.getByTestId('cadrage-start').click();
  await expect(page).toHaveURL(/\/formations\/[0-9a-f-]+\/cadrage$/);
  await expect(page.getByTestId('cadrage-log')).toContainText(Q1);
  await captureEvidence('cadrage-q1');

  await answer(page, 'La comptabilité générale, les fournisseurs, les clients et les immobilisations.');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q2);
  await answer(page, 'Je connais bien la comptabilité, mais je n’ai jamais utilisé SAP.');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q3);

  await page.getByTestId('cadrage-suggestion-Utilisateur autonome').click();
  await page.getByTestId('cadrage-suggestion-Certification SAP').click();
  await expect(page.getByTestId('profile-rubric-target_level')).toContainText(
    'Utilisateur autonome, Certification SAP',
  );
  await expect(page.getByTestId('cadrage-send')).toBeEnabled();
  await page.getByTestId('cadrage-send').click();
  await expect(page.getByTestId('cadrage-log')).toContainText(Q4);
  await captureEvidence('cadrage-q3-apercu');

  await answer(page, '10 h par semaine');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q5);
  await answer(page, 'Démarrer le 18 novembre');
  await expect(page.getByTestId('cadrage-log')).toContainText(DONE);
  await expect(page.getByTestId('cadrage-generate')).toHaveAttribute('aria-disabled', 'false');
  await captureEvidence('cadrage-fin');

  await axeCheck();
  await page.getByTestId('cadrage-generate').click();
  await expect(page).toHaveURL(/\/formations\/[0-9a-f-]+\/programme$/);
  expect(consoleErrors).toEqual([]);
});

test('cadrage interrompu puis repris @SPEC-604', async ({ page, axeCheck }) => {
  await page.goto(NEW);
  await page.getByTestId('cadrage-title-input').fill('SAP S/4HANA Finance');
  await page.getByTestId('cadrage-start').click();
  await expect(page.getByTestId('cadrage-log')).toContainText(Q1);
  await answer(page, 'La comptabilité générale.');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q2);
  const cadrageUrl = page.url();

  await page.goto('/accueil');
  await page.goto(cadrageUrl);
  await expect(page.getByTestId('cadrage-log')).toContainText(Q1);
  await expect(page.getByTestId('cadrage-log')).toContainText(Q2);
  await expect(page.getByTestId('profile-rubric-scope')).toContainText(
    'Comptabilité générale, fournisseurs, clients, immobilisations',
  );
  await expect(page.getByTestId('cadrage-reply')).toBeVisible();
  await axeCheck();
});

test('erreurs du tuteur @SPEC-604', async ({ page, axeCheck, captureEvidence }) => {
  await serviceDb().execute(
    sql`delete from public.subscriptions where user_id = ${session.userId}::uuid`,
  );
  await page.goto(NEW);
  await page.getByTestId('cadrage-title-input').fill('Sans abonnement');
  await page.getByTestId('cadrage-start').click();
  await expect(page.getByTestId('cadrage-error')).toContainText(
    'Aucun modèle d’IA n’est disponible pour le tuteur. Ajoutez votre clé ou souscrivez à l’IA fournie.',
  );
  await expect(page.getByRole('link', { name: 'Ouvrir les paramètres' })).toBeVisible();
  await captureEvidence('cadrage-erreur');
  await axeCheck();

  await deleteTestSession(session);
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await subscribe(session.userId);
  const baseURL = new URL(page.url()).origin;
  await page.context().addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL })),
  );

  await page.goto(NEW);
  await page.getByTestId('cadrage-title-input').fill('Formation sortie invalide');
  await page.getByTestId('cadrage-start').click();
  await expect(page.getByTestId('cadrage-error')).toContainText('Le tuteur n’a pas pu répondre.');
  await page.getByTestId('cadrage-retry').click();
  await expect(page.getByTestId('cadrage-error')).toContainText('Le tuteur n’a pas pu répondre.');
  await axeCheck();
});

async function compareFullPage(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  referenceName: string,
  width: number,
): Promise<number> {
  await expectScreenshotBaseline(page, `cadrage-${width === 390 ? 'mobile' : 'desktop'}.png`, {
    fullPage: true,
  });
  const actual = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const height = Math.max(1, Math.floor(await page.evaluate(() => document.documentElement.scrollHeight)));
  const referencePage = await page.context().newPage();
  await referencePage.setViewportSize({ width, height });
  const url = new URL(`/_dev/sdd/reference/${referenceName}`, page.url()).toString();
  await referencePage.setContent(
    `<body style="margin:0;background:#F4F4F1"><img id="ref" src="${url}" width="${String(width)}" style="display:block;margin:0"></body>`,
  );
  await referencePage.waitForFunction(() => {
    const image = document.getElementById('ref');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const reference = await referencePage.screenshot({ fullPage: false });
  await referencePage.close();
  const referencePath = testInfo.outputPath(`cadrage-reference-${String(width)}.png`);
  fs.writeFileSync(referencePath, reference);
  const comparison = compareWithReference(
    actual,
    referencePath,
    testInfo.outputPath('visual'),
    `cadrage-${String(width)}`,
  );
  await testInfo.attach('side-by-side', {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('diff', { path: comparison.diffPath, contentType: 'image/png' });
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: comparison.ratio.toFixed(4),
  });
  return comparison.ratio;
}

async function reachThirdQuestion(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(NEW);
  await page.getByTestId('cadrage-title-input').fill('SAP S/4HANA Finance');
  await page.getByTestId('cadrage-start').click();
  await expect(page.getByTestId('cadrage-log')).toContainText(Q1);
  await answer(page, 'La comptabilité générale, les fournisseurs, les clients et les immobilisations.');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q2);
  await answer(page, 'Je connais bien la comptabilité, mais je n’ai jamais utilisé SAP.');
  await expect(page.getByTestId('cadrage-log')).toContainText(Q3);
}

test('conformité SCR-04 cadrage @SPEC-604 @visual', async ({ page, axeCheck }, testInfo) => {
  await reachThirdQuestion(page);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="cadrage-chat"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '25.2px',
    },
    '[data-testid="cadrage-profile"] section': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '25.2px',
    },
    '[data-testid="cadrage-generate"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="cadrage-suggestion-Utilisateur autonome"]': {
      'border-top-color': colors['border-strong'],
      'border-top-left-radius': '18px',
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('cadrage-chat')).toBeVisible();
  await expect(page.getByTestId('cadrage-profile')).toBeVisible();
  await expect(page.getByTestId('profile-ring')).toContainText('3/5');
  await expect(page.getByText('Question 3 sur 5 au plus')).toBeVisible();
  await expect(page.getByTestId('cadrage-generate')).toHaveAttribute('aria-disabled', 'true');
  const ratio = await compareFullPage(page, testInfo, 'SCR-04-base-desktop.png', 1440);
  expect(ratio).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  await axeCheck();
});

test('conformité SCR-04 cadrage mobile @SPEC-604 @visual @mobile', async ({
  page,
  axeCheck,
}, testInfo) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await reachThirdQuestion(page);
  const ratio = await compareFullPage(page, testInfo, 'SCR-04-base-mobile.png', 390);
  expect(ratio).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
});
