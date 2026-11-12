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
/** Mockup region of the open notifications panel in `SCR-03-notifications-desktop.png`. */
const REFERENCE_PANEL = { x: 1044, y: 43, width: 360, height: 537 } as const;

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles
    set onboarding_step = 'done', timezone = 'Europe/Paris'
    where id = ${session.userId}::uuid
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

interface SeededPanel {
  todayUnreadId: string;
}

interface NotificationSeed {
  type:
    | 'validation_soon'
    | 'course_ready'
    | 'session_to_reschedule'
    | 'global_quiz_today'
    | 'new_gap'
    | 'session_planned'
    | 'module_validated'
    | 'weekly_review';
  icon: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  formation: 'sap' | 'agile';
}

/** The eight rows of the mockup: three unread, five read, split over the three groups. */
const ROWS: NotificationSeed[] = [
  {
    type: 'validation_soon',
    icon: 'clock',
    title: 'Quiz de validation à 14:00',
    body: 'Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %.',
    href: '/accueil?cible=quiz',
    createdAt: '2026-11-11T12:20:00Z',
    read: false,
    formation: 'sap',
  },
  {
    type: 'course_ready',
    icon: 'book-open',
    title: 'Votre cours est prêt',
    body: 'Chapitre 2 · Saisie des pièces comptables, rédigé à partir de vos 4 apports.',
    href: '/accueil?cible=cours',
    createdAt: '2026-11-11T10:05:00Z',
    read: false,
    formation: 'sap',
  },
  {
    type: 'session_to_reschedule',
    icon: 'calendar-x',
    title: 'Une séance à replacer',
    body: '« Ledgers parallèles » non terminé mardi : reprise proposée jeudi 10:30. Votre accord est demandé.',
    href: '/accueil?cible=reprise',
    createdAt: '2026-11-11T07:05:00Z',
    read: false,
    formation: 'sap',
  },
  {
    type: 'global_quiz_today',
    icon: 'refresh',
    title: 'Quiz global du jour',
    body: '14 notions à revoir, lacunes en priorité. Prévu à 17:00, environ 10 min.',
    href: '/accueil?cible=quiz-global',
    createdAt: '2026-11-11T07:00:00Z',
    read: true,
    formation: 'sap',
  },
  {
    type: 'new_gap',
    icon: 'alert-triangle',
    title: 'Nouvelle lacune repérée',
    body: 'Clé de comptabilisation : confondue avec le type de pièce, deux fois.',
    href: '/accueil?cible=lacune',
    createdAt: '2026-11-10T15:42:00Z',
    read: true,
    formation: 'sap',
  },
  {
    type: 'session_planned',
    icon: 'calendar',
    title: 'Session demain à 17:30',
    body: 'Rétrospectives · apports du chapitre 2. Pensez à préparer vos notes.',
    href: '/accueil?cible=session',
    createdAt: '2026-11-10T17:00:00Z',
    read: true,
    formation: 'agile',
  },
  {
    type: 'module_validated',
    icon: 'check-circle',
    title: 'Module 2 validé · 91 %',
    body: 'Le module 3 · Comptabilité générale est débloqué.',
    href: '/accueil?cible=module',
    createdAt: '2026-11-09T10:00:00Z',
    read: true,
    formation: 'sap',
  },
  {
    type: 'weekly_review',
    icon: 'bar-chart',
    title: 'Bilan de la semaine',
    body: '13 h d’étude, 86 % retenu à 1 mois, 3 notions à risque d’oubli.',
    href: '/accueil?cible=bilan',
    createdAt: '2026-11-08T18:00:00Z',
    read: true,
    formation: 'sap',
  },
];

async function seedPanel(userId: string): Promise<SeededPanel> {
  return serviceDb().transaction(async (tx) => {
    const sap = await createTestProgramme(tx, userId, {
      modules: 3,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const agile = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Gestion de projet agile',
    });
    let todayUnreadId = '';
    for (const [index, row] of ROWS.entries()) {
      const notification = await createNotification(tx, {
        userId,
        formationId: row.formation === 'sap' ? sap.formationId : agile.formationId,
        type: row.type,
        title: row.title,
        body: row.body,
        href: row.href,
        icon: row.icon,
        dedupeKey: `spec-306-e2e:${userId}:${String(index)}`,
      });
      if (index === 0) todayUnreadId = notification.id;
      await tx.execute(sql`
        update public.notifications
        set created_at = ${row.createdAt}::timestamptz,
            read_at = ${row.read ? sql`${NOW}::timestamptz` : sql`null`}
        where id = ${notification.id}::uuid
      `);
    }
    return { todayUnreadId };
  });
}

async function seedStrangerNotification(): Promise<{
  session: TestSession;
  notificationId: string;
}> {
  const stranger = await createTestSession();
  const notificationId = await serviceDb().transaction(async (tx) => {
    const created = await createNotification(tx, {
      userId: stranger.userId,
      title: 'Notification privée d’un autre apprenant',
      body: 'Ce contenu ne doit jamais traverser la frontière RLS.',
      href: '/accueil?cible=privee',
      dedupeKey: `spec-306-stranger:${stranger.userId}`,
    });
    return created.id;
  });
  return { session: stranger, notificationId };
}

test('Panneau des notifications @SPEC-306', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seed = await seedPanel(session.userId);
  await page.goto(ACCUEIL);

  const bell = page.getByTestId('header-notifications');
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 3 non lues');
  await expect(page.getByTestId('header-notifications-badge')).toHaveText('3');
  await bell.click();

  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('notification-group-today')).toBeVisible();
  await expect(page.getByTestId('notification-group-yesterday')).toBeVisible();
  await expect(page.getByTestId('notification-group-earlier')).toBeVisible();

  // CA-1 — the three groups, profile hours and mockup texts.
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Notifications');
  await expect(panel.getByText('13:20')).toBeVisible();
  await expect(panel.getByText('16:42')).toBeVisible();
  await expect(panel.getByText('lun. 9 nov.', { exact: true })).toBeVisible();
  await expect(panel.getByText('dim. 8 nov.', { exact: true })).toBeVisible();
  await expect(panel.getByText('SAP S/4HANA Finance').first()).toBeVisible();
  await expect(panel.getByTestId('notification-manage')).toHaveAttribute(
    'href',
    '/parametres#notifications',
  );

  // CA-2 — Non lues only filters the list, the counter stays the same.
  const filters = page.getByTestId('notification-filters');
  await expect(filters.getByRole('button', { name: 'Toutes 8' })).toBeVisible();
  await filters.getByRole('button', { name: /Non lues/ }).click();
  const unreadRows = panel.locator('[data-notif][data-unread]');
  await expect(unreadRows).toHaveCount(3);
  await expect(panel).not.toContainText('Bilan de la semaine');
  await expect(filters.getByRole('button', { name: /Non lues 3/ })).toBeVisible();
  await captureEvidence('spec-306-panneau-non-lues-desktop');

  // CA-2 — activating an unread row marks it read exactly once, then opens its deep link.
  await panel.getByTestId(`notification-item-${seed.todayUnreadId}`).click();
  await expect(page).toHaveURL(/\/accueil\?cible=quiz$/);
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 2 non lues');
  await expect(page.getByTestId('header-notifications-badge')).toHaveText('2');
  const persisted = await page.request.get('/api/v1/notifications/unread-count');
  expect(persisted.status()).toBe(200);
  expect(await persisted.json()).toEqual({ count: 2 });

  // EF-5 — Échap and an outside click close the panel and return the focus to the bell.
  await bell.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId(`notification-item-${seed.todayUnreadId}`)).toHaveCount(0);
  await panel.getByRole('button', { name: /Toutes/ }).click();
  await expect(panel.getByTestId(`notification-item-${seed.todayUnreadId}`)).not.toHaveAttribute(
    'data-unread',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  await bell.click();
  await expect(panel).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  // CA-3 — read-all empties the counter; the disabled second demand cannot write again.
  await bell.click();
  await expect(panel).toBeVisible();
  await panel.getByTestId('notification-read-all').click();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, aucune non lue');
  await expect(page.getByTestId('header-notifications-badge')).toHaveCount(0);
  await expect(panel.getByTestId('notification-read-all')).toHaveText('Tout est lu');
  await expect(panel.getByTestId('notification-read-all')).toBeDisabled();
  await panel.getByRole('button', { name: /Non lues/ }).click();
  await expect(panel.getByTestId('notification-empty')).toHaveText(
    'Vous avez tout lu. Les prochains rappels arriveront ici.',
  );
  await captureEvidence('spec-306-panneau-vide-desktop');
  await axeCheck();

  await page.reload();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, aucune non lue');
  const afterReload = await page.request.get('/api/v1/notifications?filter=unread');
  expect(await afterReload.json()).toMatchObject({ items: [], unreadCount: 0, total: 8 });

  expect(consoleErrors).toEqual([]);
});

test('Panneau des notifications : états vide et erreur @SPEC-306', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const stranger = await seedStrangerNotification();
  await page.goto(ACCUEIL);
  const bell = page.getByTestId('header-notifications');
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, aucune non lue');

  // CA-4 — the foreign notification is neither listed nor readable through the API.
  const ownList = await page.request.get('/api/v1/notifications');
  expect(ownList.status()).toBe(200);
  expect(await ownList.text()).not.toContain(stranger.notificationId);
  const foreignRead = await page.request.post(
    `/api/v1/notifications/${stranger.notificationId}/read`,
    { headers: { origin: new URL(page.url()).origin } },
  );
  expect(foreignRead.status()).toBe(404);
  const problem = (await foreignRead.json()) as { code: string; detail: string };
  expect(problem.code).toBe('NOT_FOUND');
  expect(problem.detail).not.toContain('privée');

  // CL-4 — distinct empty states for Toutes and Non lues.
  await bell.click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel.getByTestId('notification-empty')).toHaveText(
    'Aucune notification pour le moment. Les prochains rappels arriveront ici.',
  );
  await panel.getByRole('button', { name: /Non lues/ }).click();
  await expect(panel.getByTestId('notification-empty')).toHaveText(
    'Vous avez tout lu. Les prochains rappels arriveront ici.',
  );
  await captureEvidence('spec-306-panneau-sans-contenu-desktop');

  // EF-5 — the focus returns to the bell after Échap.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  // ET-5, CL-3 — a safe error state proposes Réessayer, then the empty panel comes back.
  await page.route(/\/api\/v1\/notifications\?/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json; charset=utf-8',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Erreur interne',
        status: 500,
        detail: 'Erreur interne',
        code: 'INTERNAL_ERROR',
        requestId: 'spec-306-e2e',
      }),
    });
  });
  await bell.click();
  await expect(panel.getByTestId('notification-error')).toBeVisible();
  await expect(panel.getByText('Impossible de charger les notifications.')).toBeVisible();
  await axeCheck();
  await page.unroute(/\/api\/v1\/notifications\?/);
  await panel.getByRole('button', { name: 'Réessayer' }).click();
  await expect(panel.getByTestId('notification-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bell).toBeFocused();

  await deleteTestSession(stranger.session);
});

test('Panneau des notifications : conformité @SPEC-306 @visual', async ({
  page,
  axeCheck,
}, testInfo) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = await seedPanel(session.userId);
  await page.goto(ACCUEIL);
  await page.getByTestId('header-notifications').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('notification-group-today')).toBeVisible();
  // The pointer stays over the trigger after the click; move it away before reading tokens.
  await page.mouse.move(0, 0);

  // Tokens of the panel and of the bell badge.
  await expectTokens(page, {
    '[data-testid="notification-panel"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '18px',
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
    '[data-testid="notification-filters"]': {
      'background-color': colors.canvas,
      'border-radius': '10.8px',
    },
    '[data-testid="notification-group-today"] h3': {
      color: colors['ink-muted'],
    },
    '[data-testid="notification-manage"]': {
      color: colors['indigo-ink'],
    },
    '[data-testid="notification-read-all"]': {
      color: colors['indigo-ink'],
    },
    [`[data-testid="notification-unread-${seed.todayUnreadId}"]`]: {
      'background-color': colors.indigo,
    },
  });

  // Mockup comparison of the bell/header region (SCR-03 reference, scale 0.9).
  const header = page.getByTestId('shell-header');
  const box = await header.boundingBox();
  if (box === null) throw new Error('en-tête non mesurable');
  const actual = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    animations: 'disabled',
  });
  const referencePage = await page.context().newPage();
  await referencePage.setViewportSize({ width: 1440, height: 900 });
  await referencePage.setContent(
    `<img id="ref" src="${new URL('/_dev/sdd/reference/SCR-03-base-desktop.png', page.url()).toString()}" width="${String(
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
  const referencePath = testInfo.outputPath('spec-306-header-reference.png');
  fs.writeFileSync(referencePath, reference);
  const comparison = compareWithReference(
    actual,
    referencePath,
    testInfo.outputPath('visual'),
    'spec-306-header',
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

  // Mockup comparison of the panel itself: the reference region is normalised to the captured
  // panel box (same content, same scale), so the 12 % structural threshold applies to the panel.
  const panelBox = await panel.boundingBox();
  if (panelBox === null) throw new Error('panneau non mesurable');
  const panelActual = await page.screenshot({
    clip: panelBox,
    animations: 'disabled',
  });
  const scaleX = panelBox.width / (REFERENCE_PANEL.width * SCALE);
  const scaleY = panelBox.height / (REFERENCE_PANEL.height * SCALE);
  const panelReferencePage = await page.context().newPage();
  await panelReferencePage.setViewportSize({
    width: Math.round(panelBox.width),
    height: Math.round(panelBox.height),
  });
  const panelReferenceUrl = new URL(
    '/_dev/sdd/reference/SCR-03-notifications-desktop.png',
    page.url(),
  ).toString();
  await panelReferencePage.setContent(
    `<div id="ref" style="width:${String(panelBox.width)}px;height:${String(panelBox.height)}px;background-image:url('${panelReferenceUrl}');background-repeat:no-repeat;background-size:${String(REFERENCE_WIDTH * SCALE * scaleX)}px ${String(REFERENCE_HEIGHT * SCALE * scaleY)}px;background-position:${String(-REFERENCE_PANEL.x * SCALE * scaleX)}px ${String(-REFERENCE_PANEL.y * SCALE * scaleY)}px"></div><img id="ref-img" src="${panelReferenceUrl}" alt="" style="position:absolute;width:1px;height:1px;opacity:0">`,
  );
  await panelReferencePage.waitForFunction(() => {
    const image = document.getElementById('ref-img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const panelReferencePath = testInfo.outputPath('spec-306-panel-reference.png');
  const panelReference = await panelReferencePage.screenshot({
    clip: { x: 0, y: 0, width: panelBox.width, height: panelBox.height },
  });
  await panelReferencePage.close();
  fs.writeFileSync(panelReferencePath, panelReference);
  const panelComparison = compareWithReference(
    panelActual,
    panelReferencePath,
    testInfo.outputPath('visual'),
    'spec-306-panel',
  );
  await testInfo.attach('panel-reference', {
    path: panelReferencePath,
    contentType: 'image/png',
  });
  await testInfo.attach('panel-side-by-side', {
    path: panelComparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('panel-diff', {
    path: panelComparison.diffPath,
    contentType: 'image/png',
  });
  expect(panelComparison.ratio, 'écart à la maquette du panneau').toBeLessThanOrEqual(
    MOCKUP_MAX_DIFF_RATIO,
  );
  testInfo.annotations.push({
    type: 'panel-mockup-diff-ratio',
    description: panelComparison.ratio.toFixed(4),
  });

  await expectScreenshotBaseline(page, 'spec-306-panneau-desktop.png', { fullPage: false });
  await axeCheck();
});

test('Panneau des notifications : conformité mobile @SPEC-306 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedPanel(session.userId);
  await page.goto(ACCUEIL);
  await page.getByTestId('header-notifications').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('notification-group-today')).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  const bellBox = await page.getByTestId('header-notifications').boundingBox();
  expect(bellBox).not.toBeNull();
  if (bellBox !== null) {
    expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(390);
  }

  await expectScreenshotBaseline(page, 'spec-306-panneau-mobile.png', { fullPage: false });
  await axeCheck();
});
