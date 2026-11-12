import fs from 'node:fs';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotification } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReference,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ACCUEIL = '/accueil';
const NOW = '2026-11-11T12:20:00Z';
const REFERENCE_WIDTH = 1600;
const REFERENCE_HEIGHT = 2095;
const SCALE = 0.9;

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
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

/**
 * Mockup-shaped header data: Alex Perrin, three active formations (one paused and one completed
 * formation must not count) and three unread notifications out of four.
 */
async function seedHeader(userId: string): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.profiles
      set first_name = 'Alex',
          last_name = 'Perrin',
          onboarding_step = 'done'
      where id = ${userId}::uuid
    `);
    const active = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    for (const title of ['Python pour l’analyse de données', 'Gestion de projet agile']) {
      await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title,
      });
    }
    const paused = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Formation en pause',
    });
    await tx.execute(sql`
      update public.formations set status = 'paused' where id = ${paused.formationId}::uuid
    `);
    const completed = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Formation terminée',
    });
    await tx.execute(sql`
      update public.formations set status = 'completed' where id = ${completed.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set last_opened_at = ${NOW}::timestamptz, status = 'active'
      where id = ${active.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${active.formationId}::uuid,
          streak_days = 12
      where id = ${userId}::uuid
    `);

    const notifications: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const notification = await createNotification(tx, {
        userId,
        title: `Notification ${String(index + 1)}`,
        dedupeKey: `spec-305-e2e:${userId}:${String(index)}`,
      });
      notifications.push(notification.id);
    }
    const read = notifications[0];
    if (read !== undefined) {
      await tx.execute(sql`
        update public.notifications set read_at = ${NOW}::timestamptz
        where id = ${read}::uuid
      `);
    }
  });
}

function mockupReferenceUrl(pageUrl: string): string {
  return new URL('/_dev/sdd/reference/SCR-03-base-desktop.png', pageUrl).toString();
}

test('Coquille : en-tête figé et menu Mon compte @SPEC-305', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await seedHeader(session.userId);
  await page.goto(ACCUEIL);

  const header = page.getByTestId('shell-header');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('header-search-input')).toHaveAttribute(
    'placeholder',
    'Rechercher une notion, un cours, une formation…',
  );
  await expect(page.getByTestId('header-notifications')).toHaveAttribute(
    'aria-label',
    'Notifications, 3 non lues',
  );
  await expect(page.getByTestId('header-notifications-badge')).toHaveText('3');
  await expect(page.getByTestId('header-account-trigger')).toHaveAttribute(
    'aria-label',
    /Mon compte/,
  );

  // CA-1 — search, bell and account follow the mockup order in the DOM.
  const order = await header
    .locator('[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  const positions = ['header-search', 'header-notifications', 'header-account-trigger'].map(
    (id) => order.indexOf(id),
  );
  for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
  expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  await captureEvidence('spec-305-entete-desktop');

  // CA-1 — the header stays stuck to the top while the page scrolls.
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main === null) return;
    const spacer = document.createElement('div');
    spacer.id = 'spec-305-scroll-spacer';
    spacer.style.height = '2000px';
    main.appendChild(spacer);
  });
  await page.evaluate(() => {
    window.scrollTo(0, 1500);
  });
  await expect
    .poll(async () => (await header.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(1);
  await expect(header).toBeVisible();
  await page.evaluate(() => {
    document.getElementById('spec-305-scroll-spacer')?.remove();
    window.scrollTo(0, 0);
  });

  // CA-2 — identity, active formation count and mockup order of the three actions.
  await page.getByTestId('header-account-trigger').click();
  const menu = page.getByTestId('account-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('account-identity-name')).toHaveText('Alex');
  await expect(page.getByTestId('account-active-formations')).toHaveText('3 formations en cours');
  const items = page.getByRole('menuitem');
  await expect(items).toHaveText(['Paramètres', 'Mettre en pause', 'Se déconnecter']);
  await captureEvidence('spec-305-menu-ouvert');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('header-account-trigger')).toBeFocused();

  await page.getByTestId('header-account-trigger').click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('header-account-trigger')).toBeFocused();

  await page.getByTestId('header-account-trigger').click();
  await expect(menu).toBeVisible();
  await axeCheck();

  // CA-3 — Se déconnecter closes the session, replaces the entry and refuses the next request.
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/connexion(\?|$)/);
  const refused = await page.request.get('/api/v1/me/header');
  expect(refused.status()).toBe(401);
  await page.goto(ACCUEIL);
  await expect(page).toHaveURL(/\/connexion(\?|$)/);
  await expect(page.getByTestId('shell-header')).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test('Coquille : en-tête figé et menu Mon compte mobile @SPEC-305 @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await seedHeader(session.userId);
  await page.goto(ACCUEIL);

  // CA-4 — the four actions are present, named, and none is clipped at 390 px.
  await expect(page.getByTestId('sidebar-show')).toBeVisible();
  await expect(page.getByTestId('header-search-input')).toBeVisible();
  await expect(page.getByTestId('header-notifications')).toBeVisible();
  await expect(page.getByTestId('header-account-trigger')).toBeVisible();
  await expect(page.getByTestId('sidebar-show')).toHaveAttribute('aria-label', 'Afficher le menu');
  await expect(page.getByTestId('header-search-input')).toHaveAttribute(
    'aria-label',
    'Rechercher',
  );
  await expect(page.getByTestId('header-notifications')).toHaveAttribute(
    'aria-label',
    'Notifications, 3 non lues',
  );
  await expect(page.getByTestId('header-account-trigger')).toHaveAttribute(
    'aria-label',
    /Mon compte/,
  );

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  for (const testId of [
    'sidebar-show',
    'header-search-input',
    'header-notifications',
    'header-account-trigger',
  ]) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, testId).not.toBeNull();
    if (box === null) continue;
    expect(box.x, testId).toBeGreaterThanOrEqual(0);
    expect(box.y, testId).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, testId).toBeLessThanOrEqual(390);
  }

  // CA-4 — keyboard reaches the bell then the account trigger from the search field.
  await page.getByTestId('header-search-input').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('header-notifications')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('header-account-trigger')).toBeFocused();

  await page.getByTestId('header-account-trigger').click();
  const menu = page.getByTestId('account-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await captureEvidence('spec-305-entete-mobile');
  await axeCheck();
});

test('Coquille : en-tête figé et menu Mon compte @SPEC-305 @visual', async ({
  page,
  axeCheck,
}, testInfo) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedHeader(session.userId);
  await page.goto(ACCUEIL);
  const header = page.getByTestId('shell-header');
  await expect(header).toBeVisible();

  await expectTokens(page, {
    '[data-testid="shell-header"]': {
      'background-color': colors['header-glass'],
      'border-bottom-color': colors.border,
    },
    '[data-testid="header-search-input"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '10.8px',
      'min-height': '37.8px',
    },
    '[data-testid="header-notifications"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '10.8px',
    },
    '[data-testid="header-notifications-badge"]': {
      'background-color': colors.orange,
      color: colors.white,
    },
    '[data-testid="header-account-trigger"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
    '[data-testid="header-account-avatar"]': {
      'background-color': colors.indigo,
      color: colors.white,
    },
  });

  // Mockup comparison of the header region: the 1600 px reference is captured at 90 %.
  const box = await header.boundingBox();
  if (box === null) throw new Error('en-tête non mesurable');
  const actual = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    animations: 'disabled',
  });
  const referencePage = await page.context().newPage();
  await referencePage.setViewportSize({ width: 1440, height: 900 });
  await referencePage.setContent(
    `<img id="ref" src="${mockupReferenceUrl(page.url())}" width="${String(
      Math.round(REFERENCE_WIDTH * SCALE),
    )}" height="${String(
      Math.round(REFERENCE_HEIGHT * SCALE),
    )}" style="display:block;margin:0">`,
  );
  await referencePage.waitForFunction(() => {
    const image = document.getElementById('ref');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const reference = await referencePage.screenshot({
    clip: { x: box.x, y: 0, width: box.width, height: box.height },
  });
  await referencePage.close();
  const referencePath = testInfo.outputPath('spec-305-header-reference.png');
  fs.writeFileSync(referencePath, reference);
  const comparison = compareWithReference(
    actual,
    referencePath,
    testInfo.outputPath('visual'),
    'spec-305-header',
  );
  await testInfo.attach('reference', { path: referencePath, contentType: 'image/png' });
  await testInfo.attach('side-by-side', {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('diff', { path: comparison.diffPath, contentType: 'image/png' });
  expect(comparison.ratio, 'écart à la maquette de l’en-tête').toBeLessThanOrEqual(
    MOCKUP_MAX_DIFF_RATIO,
  );
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: comparison.ratio.toFixed(4),
  });

  await expectScreenshotBaseline(page, 'spec-305-accueil-desktop.png', { fullPage: true });
  await page.getByTestId('header-account-trigger').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expectScreenshotBaseline(page, 'spec-305-menu-ouvert.png', { fullPage: false });
  await axeCheck();
});

test('Coquille : en-tête figé et menu Mon compte mobile @SPEC-305 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedHeader(session.userId);
  await page.goto(ACCUEIL);
  await expect(page.getByTestId('header-notifications')).toHaveAttribute(
    'aria-label',
    'Notifications, 3 non lues',
  );
  await expectScreenshotBaseline(page, 'spec-305-accueil-mobile.png', { fullPage: false });
  await page.getByTestId('header-account-trigger').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expectScreenshotBaseline(page, 'spec-305-menu-mobile.png', { fullPage: false });
  await axeCheck();
});
