import fs from 'node:fs';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';
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
const REGULARITY_DAYS = [
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  // SPEC-202 onboarding is delivered by SPEC-601/602; the shell tests start from a learner who
  // has finished it so the proxy reaches the connected page.
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

interface SeededMenu {
  sapId: string;
  agileId: string;
}

/**
 * Mockup-shaped demonstration: SAP with seven modules (two validated, module 3 open), 14 notions
 * due, 4 gaps and the 12-day streak of SPEC-115; a second active formation for the switcher.
 */
async function seedMenu(userId: string): Promise<SeededMenu> {
  return serviceDb().transaction(async (tx) => {
    const sap = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    for (let index = 0; index < 2; index += 1) {
      const moduleId = sap.moduleIds[index];
      if (moduleId === undefined) throw new Error('module SAP absent');
      await tx.execute(sql`
        update public.modules
        set status = 'validated', validated_at = ${NOW}::timestamptz
        where id = ${moduleId}::uuid
      `);
    }
    const openModule = sap.moduleIds[2];
    if (openModule === undefined) throw new Error('module ouvert absent');
    await tx.execute(sql`
      update public.modules
      set status = 'open', opened_at = ${NOW}::timestamptz
      where id = ${openModule}::uuid
    `);
    for (let index = 0; index < 14; index += 1) {
      const notionId = sap.notionIds[index];
      if (notionId === undefined) throw new Error('notion SAP absente');
      const gapNature = ['forgetting', 'confusion', 'misunderstanding', 'application'][
        index
      ] as 'forgetting' | 'confusion' | 'misunderstanding' | 'application' | undefined;
      await createNotionState(tx, {
        userId,
        notionId,
        gapNature: gapNature ?? null,
        ...(gapNature === 'confusion'
          ? { confusedWith: sap.notionIds[0] ?? null, evidence: 'Confondue avec la notion voisine.' }
          : gapNature === undefined
            ? {}
            : { evidence: 'Lacune observée en quiz.' }),
        inReview: true,
        dueAt: new Date('2026-11-11T08:00:00Z'),
      });
    }
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values ${sql.join(
        REGULARITY_DAYS.map(
          (day) =>
            sql`(${userId}::uuid, ${day}::date, 60, true, array['e2e']::text[])`,
        ),
        sql`, `,
      )}
      on conflict (user_id, day) do nothing
    `);

    const agile = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Gestion de projet agile',
    });
    const agileModule = agile.moduleIds[0];
    if (agileModule === undefined) throw new Error('module agile absent');
    await tx.execute(sql`
      update public.modules
      set status = 'open', opened_at = ${NOW}::timestamptz
      where id = ${agileModule}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set last_opened_at = '2026-11-10T10:00:00Z'::timestamptz
      where id = ${agile.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set last_opened_at = ${NOW}::timestamptz, status = 'active'
      where id = ${sap.formationId}::uuid
    `);
    for (const formationId of [sap.formationId, agile.formationId]) {
      await tx.execute(sql`
        update public.modules
        set planned_start = date '2026-11-02' + (position - 1) * 7,
            planned_end = date '2026-11-02' + (position - 1) * 7 + 4
        where formation_id = ${formationId}::uuid
      `);
      await tx.execute(sql`
        update public.formations
        set start_date = (select min(planned_start) from public.modules where formation_id = ${formationId}::uuid),
            end_date = (select max(planned_end) from public.modules where formation_id = ${formationId}::uuid)
        where id = ${formationId}::uuid
      `);
    }
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${sap.formationId}::uuid,
          onboarding_step = 'done',
          streak_days = 12
      where id = ${userId}::uuid
    `);
    return { sapId: sap.formationId, agileId: agile.formationId };
  });
}

test('Coquille : menu latéral @SPEC-304', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(ACCUEIL);

  // Empty state first (EF-5, CL-1): no broken formation link.
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId('sidebar-empty')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Créer une formation' })).toHaveAttribute(
    'href',
    '/formations/nouvelle',
  );
  await expect(page.getByTestId('sidebar-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('sidebar-formation-nav')).toHaveCount(0);

  const seeded = await seedMenu(session.userId);
  await page.reload();

  // CA-1 — ten regions in mockup order, card with monogram, title, progress and module.
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('SAP S/4HANA Finance');
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('Module 3 sur 7');
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('29\u00a0%');
  await expect(page.getByTestId('sidebar-quiz-badge')).toHaveText('14');
  await expect(page.getByTestId('sidebar-gaps-badge')).toHaveText('4');
  await expect(page.getByTestId('sidebar-streak-count')).toHaveText('12 jours');
  await expect(page.getByTestId('sidebar-streak-day')).toHaveCount(14);
  const order = [
    'sidebar-logo',
    'sidebar-nav-main',
    'sidebar-separator',
    'sidebar-current-formation',
    'sidebar-switch-formation',
    'sidebar-formation-card',
    'sidebar-formation-nav',
    'sidebar-quiz-badge',
    'sidebar-gaps-badge',
    'sidebar-streak',
  ];
  const rendered = await sidebar
    .locator('[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  const positions = order.map((id) => rendered.indexOf(id));
  for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
  expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  await expect(
    page.getByRole('link', { name: /Quiz global/ }),
  ).toHaveAttribute('href', `/formations/${seeded.sapId}/quiz-global`);

  // EF-2 — the switcher lists active and paused formations; changing updates the card.
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  const switched = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/current-formation') &&
      response.request().method() === 'PATCH',
  );
  await page.getByTestId(`sidebar-formation-option-${seeded.agileId}`).click();
  await switched;
  await expect(page.getByTestId('sidebar-formation-card')).toContainText(
    'Gestion de projet agile',
  );

  await page.getByTestId('sidebar-switch-formation').click();
  const switchedBack = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/current-formation') &&
      response.request().method() === 'PATCH',
  );
  await page.getByTestId(`sidebar-formation-option-${seeded.sapId}`).click();
  await switchedBack;

  // CA-4 — Programme is the only current link and navigation succeeds.
  await page.getByTestId('sidebar-programme').click();
  await expect(page).toHaveURL(
    new RegExp(`/formations/${seeded.sapId}/programme$`),
  );
  await expect(page.getByTestId('sidebar-programme')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('sidebar-home')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('sidebar-notion-map')).not.toHaveAttribute(
    'aria-current',
    'page',
  );

  // CA-2 — collapse persists across a reload, then the header trigger reopens it.
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/sidebar') && response.request().method() === 'PATCH',
  );
  await page.getByTestId('sidebar-hide').click();
  await saved;
  await expect(page.getByTestId('sidebar')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('sidebar')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-show')).toBeVisible();
  await page.getByTestId('sidebar-show').click();
  await expect(page.getByTestId('sidebar')).toBeVisible();

  await captureEvidence('spec-304-menu-desktop');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('Coquille : menu latéral mobile @SPEC-304 @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedMenu(session.userId);
  await page.goto(ACCUEIL);

  // BR-NAV-03 — closed by default under 900 px, opened as an overlay.
  await expect(page.getByTestId('sidebar')).toBeHidden();
  await expect(page.getByTestId('sidebar-show')).toBeVisible();
  await page.getByTestId('sidebar-show').click();
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('sidebar-hide')).toBeFocused();
  await expect(page.getByTestId('sidebar-backdrop')).toBeVisible();

  // CL-3 — Escape closes and returns the focus to the trigger.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sidebar')).toBeHidden();
  await expect(page.getByTestId('sidebar-show')).toBeFocused();

  // CL-3 — a backdrop click also closes the overlay.
  await page.getByTestId('sidebar-show').click();
  await page.getByTestId('sidebar-backdrop').click({ position: { x: 380, y: 420 } });
  await expect(page.getByTestId('sidebar')).toBeHidden();

  await page.getByTestId('sidebar-show').click();
  await expect(sidebar).toBeVisible();
  await captureEvidence('spec-304-menu-mobile');
  await axeCheck();
});

test('Coquille : menu latéral @SPEC-304 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedMenu(session.userId);
  await page.goto(ACCUEIL);
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('SAP S/4HANA Finance');

  await expectTokens(page, {
    '[data-testid="sidebar"]': { 'background-color': colors.ink },
    '[data-testid="sidebar-logo"] span:first-child': {
      'background-color': colors.lime,
      'border-radius': '8.1px',
    },
    '[data-testid="sidebar-home"]': {
      'background-color': colors['dark-750'],
      color: colors.white,
    },
    '[data-testid="sidebar-current-formation"]': {
      'background-color': colors['dark-850'],
      'border-color': colors['dark-line'],
      'border-radius': '16.2px',
    },
    '[data-testid="sidebar-formation-card"]': {
      'background-color': colors['dark-750'],
      'border-radius': '11.7px',
    },
    '[data-testid="sidebar-quiz-badge"]': {
      'background-color': colors.lime,
      color: colors.ink,
    },
    '[data-testid="sidebar-gaps-badge"]': {
      'background-color': colors['orange-dark'],
      color: colors['orange-on-dark'],
    },
    '[data-testid="sidebar-streak"]': {
      'background-color': colors['dark-800'],
      'border-radius': '12.6px',
    },
    '[data-testid="sidebar-streak-day"][data-status="done"]': {
      'background-color': colors.lime,
    },
  });

  // Mockup comparison of the sidebar region: the mockup of SCR-03 is 90 % scaled, like the app.
  const sidebar = page.getByTestId('sidebar');
  const box = await sidebar.boundingBox();
  if (box === null) throw new Error('barre latérale non mesurable');
  const actual = await sidebar.screenshot({ animations: 'disabled' });
  const referencePage = await page.context().newPage();
  await referencePage.setViewportSize({ width: 1600, height: 2095 });
  const referenceUrl = new URL(
    '/_dev/sdd/reference/SCR-03-base-desktop.png',
    page.url(),
  ).toString();
  await referencePage.setContent(
    `<img id="ref" src="${referenceUrl}" width="1600" height="2095" style="display:block;margin:0">`,
  );
  await referencePage.waitForFunction(() => {
    const image = document.getElementById('ref');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const reference = await referencePage.screenshot({
    clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) },
  });
  await referencePage.close();
  const referencePath = testInfo.outputPath('spec-304-sidebar-reference.png');
  fs.writeFileSync(referencePath, reference);
  const comparison = compareWithReference(
    actual,
    referencePath,
    testInfo.outputPath('visual'),
    'spec-304-sidebar',
  );
  await testInfo.attach('reference', { path: referencePath, contentType: 'image/png' });
  await testInfo.attach('side-by-side', {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('diff', { path: comparison.diffPath, contentType: 'image/png' });
  expect(comparison.ratio, 'écart à la maquette de la barre latérale').toBeLessThanOrEqual(
    MOCKUP_MAX_DIFF_RATIO,
  );
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: comparison.ratio.toFixed(4),
  });

  await expectScreenshotBaseline(page, 'spec-304-accueil-desktop.png', { fullPage: true });
  await axeCheck();
});

test('Coquille : menu latéral mobile @SPEC-304 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedMenu(session.userId);
  await page.goto(ACCUEIL);
  await page.getByTestId('sidebar-show').click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
  await expectScreenshotBaseline(page, 'spec-304-menu-mobile.png', { fullPage: false });
  await axeCheck();
});
