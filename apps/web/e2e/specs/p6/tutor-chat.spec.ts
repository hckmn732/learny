import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import {
  DEMO_USERS,
  demoChapterId,
  demoFormationId,
  demoId,
  demoModuleId,
  demoUserId,
} from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { MOCKUP_MAX_DIFF_RATIO, compareRegions, expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const FORMATION = demoFormationId('sap');
const MODULE = demoModuleId('sap', 3);
const CHAPTER = demoChapterId('sap', 3, 2);
const COURSE_URL = `/formations/${FORMATION}/modules/${MODULE}/cours?chapitre=${CHAPTER}`;
const COURSE = demoId('course', 'alex:sap:m3');
const REFERENCE = fileURLToPath(new URL('../../../../../design/references/SCR-07-tuteur-ouvert-desktop.png', import.meta.url));

let session: TestSession;

async function seedChunks(): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`insert into public.subscriptions (user_id, status, current_period_end) values (${demoUserId('alex')}::uuid, 'active', '2030-01-01T00:00:00Z') on conflict (user_id) do update set status = 'active'`);
    const resources = await tx.execute<{ id: string; title: string }>(sql`
      select id::text as id, title from public.resources
      where owner_id = ${demoUserId('alex')}::uuid and title in ('Guide FI (PDF)', 'Note vocale, 1:42')
    `);
    const guide = resources.find((row) => row.title === 'Guide FI (PDF)')?.id;
    const note = resources.find((row) => row.title === 'Note vocale, 1:42')?.id;
    if (guide === undefined || note === undefined) throw new Error('apports démo absents');
    await tx.execute(sql`delete from public.resource_chunks where id in ('22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333333'::uuid)`);
    await tx.execute(sql`insert into public.resource_chunks (id, resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count) values ('22222222-2222-4222-8222-222222222222'::uuid, ${guide}::uuid, ${demoUserId('alex')}::uuid, ${FORMATION}::uuid, ${CHAPTER}::uuid, 5, 'Le type de pièce classe toute la pièce et fixe sa numérotation.', '{"page":6,"charStart":0,"charEnd":60}'::jsonb, 20)`);
    await tx.execute(sql`insert into public.resource_chunks (id, resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count) values ('33333333-3333-4333-8333-333333333333'::uuid, ${note}::uuid, ${demoUserId('alex')}::uuid, ${FORMATION}::uuid, ${CHAPTER}::uuid, 0, 'La clé de comptabilisation (40/50) se distingue du type de pièce (SA, KR).', '{"startSec":102,"endSec":150,"charStart":0,"charEnd":70}'::jsonb, 20)`);
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await serviceDb().execute(sql`insert into public.subscriptions (user_id, status, current_period_end) values (${demoUserId('alex')}::uuid, 'active', '2030-01-01T00:00:00Z') on conflict (user_id) do update set status = 'active'`);
  await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })));
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('ouvre la discussion, retire la lacune et répond avec sources @SPEC-610', async ({ page, axeCheck, captureEvidence }) => {
  await seedChunks();
  await page.goto(COURSE_URL);
  await expect(page.getByTestId('tutor-ask-card')).toContainText('Demander au tuteur');
  await expect(page.getByTestId('tutor-ask-card')).toContainText('Chapitre 2 · Saisie des pièces comptables');
  await expect(page.getByTestId('tutor-ask-card')).toContainText('Votre lacune : Clé de comptabilisation');
  await page.getByTestId('tutor-open').click();
  await expect(page.getByTestId('tutor-panel')).toBeVisible();
  await expect(page.getByTestId('tutor-context-count')).toHaveText('5 éléments');
  await expect(page.getByTestId('tutor-messages')).toContainText('Je connais ce chapitre');
  await expect(page.getByTestId('tutor-messages')).toContainText('Vos quiz montrent que clé de comptabilisation');

  // Retirer la lacune pour obtenir la comparaison plutôt qu'une question de vérification (BR-TUT-05).
  await page.locator('[data-testid="tutor-context-item"][data-key="gap"] button').click();
  await expect(page.getByTestId('tutor-context-count')).toHaveText('4 éléments');
  await page.getByTestId('tutor-starter').filter({ hasText: 'quelle différence' }).click();
  await expect(page.getByTestId('tutor-messages')).toContainText('Le type de pièce se choisit', { timeout: 30_000 });
  await expect(page.getByTestId('tutor-sources')).toContainText('Sources : votre note vocale, 1:42 · Guide FI, p. 6');
  await expect(page.getByTestId('tutor-follow-up').filter({ hasText: 'Teste-moi' })).toBeVisible();
  await captureEvidence('tuteur-reponse');
  await axeCheck();
});

test('sélection, clavier, Échap et nouvelle discussion @SPEC-610', async ({ page }) => {
  await page.goto(COURSE_URL);
  await expect(page.getByTestId('course-article')).toBeVisible();
  await page.evaluate(() => {
    const paragraph = document.querySelector('[data-testid="course-article"] p');
    if (paragraph === null) throw new Error('paragraphe absent');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    paragraph.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(page.getByTestId('tutor-selection-bar')).toBeVisible();
  await page.getByTestId('tutor-selection-ask').click();
  await expect(page.getByTestId('tutor-panel')).toBeVisible();
  await expect(page.getByTestId('tutor-context-count')).toHaveText('6 éléments');
  await expect(page.getByTestId('tutor-input')).toBeVisible();

  await page.getByTestId('tutor-input').fill('Explique-moi ce passage');
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByTestId('tutor-input')).toHaveValue('Explique-moi ce passage\n');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tutor-messages')).toContainText('Je pars du passage', { timeout: 30_000 });

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tutor-panel')).toBeHidden();
  await expect(page.getByTestId('tutor-open')).toBeFocused();

  await page.getByTestId('tutor-open').click();
  await page.getByTestId('tutor-reset').click();
  await expect(page.getByTestId('tutor-messages')).toContainText('Que voulez-vous que je vous explique');
  const list = await page.request.get(`/api/v1/courses/${COURSE}/conversations`);
  expect(list.status()).toBe(200);
  const body = (await list.json()) as { items: { title: string | null }[] };
  expect(body.items.length).toBeGreaterThanOrEqual(2);
  expect(body.items.some((item) => item.title === 'Explique-moi ce passage')).toBe(true);
});

test('panneau tuteur conforme à la maquette @SPEC-610 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(COURSE_URL);
  await page.getByTestId('tutor-open').click();
  await expect(page.getByTestId('tutor-panel')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="tutor-ask-card"]': { 'background-color': colors.ink, color: colors.white, 'border-radius': '21.6px' },
    '[data-testid="tutor-open"]': { 'background-color': colors.lime, color: colors.ink },
    '[data-testid="tutor-panel"]': { 'background-color': colors.surface, 'border-left-color': colors.border },
    '[data-testid="tutor-context-count"]': { 'background-color': colors.ink, color: colors.lime },
    '[data-testid="tutor-close"]': { color: colors['ink-muted'] },
  });
  await expect(page.locator('#t-chat')).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('#t-chat')).toHaveCSS('font-size', '16.2px');
  await expect(page.getByRole('dialog', { name: 'Tuteur' })).toHaveAttribute('aria-modal', 'false');
  await captureEvidence('tuteur-ouvert');
  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-610',
    regions: [{ name: 'panneau', locator: page.getByTestId('tutor-panel'), rect: { x: 923, y: 0, width: 414, height: 810 } }],
  });
  for (const comparison of comparisons) {
    await test.info().attach(`comparaison-${comparison.name}-side-by-side`, { path: comparison.sideBySidePath, contentType: 'image/png' });
    await test.info().attach(`comparaison-${comparison.name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  }
  expect(comparisons[0]?.ratio ?? 1).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  await expectScreenshotBaseline(page, 'tutor-panel-open.png', { maxDiffPixelRatio: 0.01 });
  await axeCheck();
});
