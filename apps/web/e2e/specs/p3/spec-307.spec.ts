import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ';

let session: TestSession;

interface Seed {
  formationId: string;
  moduleId: string;
  notionIds: string[];
  sectionIds: string[];
}

/** Deterministic learner of SCR-18: two notions, a current course with two sections, one formation. */
async function seedLearner(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'Réseaux d’entreprise',
    });
    const moduleId = programme.moduleIds[0];
    const first = programme.notionIds[0];
    const second = programme.notionIds[1];
    if (moduleId === undefined || first === undefined || second === undefined) {
      throw new Error('programme de démonstration incomplet');
    }
    await tx.execute(sql`
      update public.formations
      set description = 'Formation aux réseaux locaux et à leur sécurité.'
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = 'Réseau local',
          short_definition = 'Un réseau local relie des machines proches.'
      where id = ${first}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = 'Routage',
          short_definition = 'Le routage choisit le chemin dans le réseau.'
      where id = ${second}::uuid
    `);
    const course = await createTestCourse(tx, {
      ownerId: userId,
      moduleId,
      sectionsPerChapter: 2,
    });
    const [intro, long] = course.sectionIds;
    if (intro === undefined || long === undefined) throw new Error('sections de démonstration absentes');
    await tx.execute(sql`
      update public.course_sections
      set title = 'Introduction au réseau',
          content_md = 'Un **réseau** relie des machines. <b>Texte sûr</b>'
      where id = ${intro}::uuid
    `);
    await tx.execute(sql`
      update public.course_sections
      set title = 'Topologies',
          content_md = ${`${FILLER.repeat(8)}Le réseau en étoile est courant. ${FILLER.repeat(8)}`}
      where id = ${long}::uuid
    `);
    await tx.execute(sql`
      update public.profiles
      set first_name = 'Alex',
          last_name = 'Perrin',
          onboarding_step = 'done',
          current_formation_id = ${programme.formationId}::uuid,
          streak_days = 3
      where id = ${userId}::uuid
    `);
    return {
      formationId: programme.formationId,
      moduleId,
      notionIds: programme.notionIds,
      sectionIds: course.sectionIds,
    };
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await seedLearner(session.userId);
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

test('Recherche globale : interface @SPEC-307', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const queries: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/search') queries.push(url.searchParams.get('q') ?? '');
  });

  await page.goto('/accueil');
  const input = page.getByTestId('header-search-input');
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-autocomplete', 'list');
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  // CA-1 / CL-1 — one character: no request, explicit invitation, value kept.
  await input.fill('r');
  await expect(page.getByTestId('search-state-idle')).toHaveText(
    'Saisissez au moins 2 caractères pour lancer la recherche.',
  );
  await page.waitForTimeout(350);
  expect(queries).toEqual([]);
  await expect(input).toHaveValue('r');

  // CA-1 — two characters: grouped results from SPEC-212, order Notions, Chapitres, Formations.
  await input.fill('reseau');
  await expect(page.getByTestId('search-suggestions')).toBeVisible();
  await expect(page.getByTestId('search-group-notion')).toContainText('Notions');
  await expect(page.getByTestId('search-group-chapter')).toContainText('Chapitres');
  await expect(page.getByTestId('search-group-formation')).toContainText('Formations');
  await expect(page.getByTestId('search-option')).toHaveCount(5);
  await expect(input).toHaveValue('reseau');
  expect(queries).toContain('reseau');
  const groupIds = await page
    .locator('[data-testid^="search-group-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(groupIds).toEqual([
    'search-group-notion',
    'search-group-chapter',
    'search-group-formation',
  ]);
  const marks = await page.locator('[data-testid="search-option"] mark').allTextContents();
  expect(marks.length).toBeGreaterThanOrEqual(5);
  for (const text of marks) {
    expect(text.normalize('NFD').replace(/\p{Mn}/gu, '')).toMatch(/reseau/i);
  }
  await captureEvidence('spec-307-panneau-desktop');

  // CA-2 — the combobox keeps the focus, arrows move the active option, Enter opens it.
  await input.focus();
  await page.keyboard.press('ArrowDown');
  const firstId = await input.getAttribute('aria-activedescendant');
  expect(firstId).toBeTruthy();
  const options = page.getByTestId('search-option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/formations\/[0-9a-f-]{36}\/programme#notion-/);

  // CA-3 — an accented query returns the same authorized result set.
  await page.goto('/accueil');
  const accentInput = page.getByTestId('header-search-input');
  await accentInput.fill('RÉSEAU');
  await expect(page.getByTestId('search-group-formation')).toBeVisible();
  const accentedTitles = await page.getByTestId('search-option-title').allTextContents();
  await accentInput.fill('reseau');
  await expect(page.getByTestId('search-state-loading')).toBeVisible();
  await expect(page.getByTestId('search-group-formation')).toBeVisible();
  await expect(page.getByTestId('search-option-title')).toHaveText(accentedTitles);

  // CA-2 — Escape closes the list without clearing the query.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-suggestions')).toBeHidden();
  await expect(accentInput).toHaveValue('reseau');

  // CL-2 — empty result: explicit message, query kept.
  await accentInput.fill('zzzzqqq');
  await expect(page.getByTestId('search-state-empty')).toHaveText(
    'Aucun résultat pour « zzzzqqq ».',
  );
  await expect(accentInput).toHaveValue('zzzzqqq');

  // CA-4 / CL-3 — network error: loading, error, retry, no stale result.
  let failSearch = false;
  await page.route('**/api/v1/search**', async (route) => {
    if (!failSearch) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Erreur interne',
        status: 500,
        code: 'INTERNAL_ERROR',
      }),
    });
  });
  failSearch = true;
  await accentInput.fill('panne');
  const error = page.getByTestId('search-state-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('La recherche a échoué');
  await expect(accentInput).toHaveValue('panne');
  failSearch = false;
  await page.getByTestId('search-retry').click();
  await expect(page.getByTestId('search-state-empty')).toHaveText(
    'Aucun résultat pour « panne ».',
  );

  // CA-1 / CL-1 — back under two characters: no new request and the invitation returns.
  const before = queries.length;
  await accentInput.fill('a');
  await expect(page.getByTestId('search-state-idle')).toBeVisible();
  await page.waitForTimeout(350);
  expect(queries.length).toBe(before);

  // EF-3 — the direct URL page shows the query, the total, every group and deep links.
  await page.goto('/recherche?q=reseau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Résultats de recherche');
  await expect(page.getByTestId('search-page-query')).toHaveText('Résultats pour « reseau »');
  await expect(page.getByTestId('search-page-total')).toHaveText('5 résultats');
  await expect(page.getByTestId('search-page-group-title-notion')).toHaveText('Notions');
  await expect(page.getByTestId('search-page-group-title-chapter')).toHaveText('Chapitres');
  await expect(page.getByTestId('search-page-group-title-formation')).toHaveText('Formations');
  const pageLinks = page.getByTestId('search-page-item-link');
  await expect(pageLinks).toHaveCount(5);
  expect(await pageLinks.first().getAttribute('href')).toMatch(
    /^\/formations\/[0-9a-f-]{36}\/programme#notion-/,
  );
  await expect(page.getByTestId('search-page-item-type').first()).toHaveText('Notion');
  await expect(page.getByTestId('search-page-item-snippet').first()).toBeVisible();
  await captureEvidence('spec-307-page-desktop');
  await axeCheck();

  await pageLinks.first().click();
  await expect(page).toHaveURL(/\/formations\/[0-9a-f-]{36}\/programme#notion-/);
  await page.goBack();
  await expect(page.getByTestId('search-page')).toBeVisible();

  // EF-3 — an accented direct URL gives the same result set.
  await page.goto(`/recherche?q=${encodeURIComponent('RÉSEAU')}`);
  await expect(page.getByTestId('search-page-query')).toHaveText('Résultats pour « RÉSEAU »');
  await expect(page.getByTestId('search-page-total')).toHaveText('5 résultats');

  // CL-1 / CL-2 — short URL and empty URL have their own explicit states.
  await page.goto('/recherche?q=a');
  await expect(page.getByTestId('search-page-short')).toContainText('Précisez votre recherche');
  await page.goto('/recherche?q=zzzzqqq');
  await expect(page.getByTestId('search-page-empty')).toContainText(
    'Aucun résultat pour « zzzzqqq ».',
  );
  await expect(page.getByTestId('search-page-query')).toHaveText(
    'Résultats pour « zzzzqqq »',
  );
  await axeCheck();

  expect(
    consoleErrors.filter((message) => !/status of 5\d\d/.test(message)),
  ).toEqual([]);
});

test('Recherche globale : interface mobile @SPEC-307 @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.goto('/recherche?q=reseau');
  await expect(page.getByTestId('search-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Résultats de recherche');

  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    )
    .toBe(true);

  const input = page.getByTestId('header-search-input');
  await input.fill('reseau');
  const panel = page.getByTestId('search-suggestions');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('search-option')).toHaveCount(5);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }

  await captureEvidence('spec-307-panneau-mobile');
  await axeCheck();
});

test('Recherche globale : interface @SPEC-307 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/recherche?q=reseau');
  await expect(page.getByTestId('search-page')).toBeVisible();
  await expect(page.getByTestId('search-page-total')).toHaveText('5 résultats');

  // CA-5 — tokens and structure of screens.md §3 (no mockup for SCR-18).
  await expectTokens(page, {
    body: { color: colors.ink, 'background-color': colors.canvas },
    '[data-testid="search-page-header"] h1': { color: colors.ink },
    '[data-testid="search-page-item"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="search-page-item-type"]': {
      'background-color': colors['indigo-soft'],
      color: colors['indigo-ink'],
    },
  });
  await expect(page.getByTestId('search-page-header').locator('h1')).toHaveCSS(
    'font-family',
    /Space[ _]Grotesk/,
  );
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const groups = await page
    .locator('section[data-testid^="search-page-group-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(groups).toEqual([
    'search-page-group-notion',
    'search-page-group-chapter',
    'search-page-group-formation',
  ]);
  await expect(page.getByTestId('search-page-item')).toHaveCount(5);
  await axeCheck();
  await captureEvidence('spec-307-page-visual');
  await expectScreenshotBaseline(page, 'spec-307-recherche.png', { fullPage: true });

  // The header panel follows the notification panel: 400 px, radius 18 px, popover shadow.
  const input = page.getByTestId('header-search-input');
  await input.fill('reseau');
  const panel = page.getByTestId('search-suggestions');
  await expect(panel).toBeVisible();
  await expectTokens(page, {
    '[data-testid="search-suggestions"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '18px',
    },
  });
  const shadow = await panel.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).toContain('rgba(17, 17, 19, 0.16)');
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.width).toBe(testInfo.project.name === 'mobile' ? 358 : 400);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(
      testInfo.project.name === 'mobile' ? 390 : 1440,
    );
  }
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-307-panneau.png', { fullPage: false });
  testInfo.annotations.push({
    type: 'mockup-comparison',
    description: 'SCR-18 sans maquette : jetons, structure et non-régression (ADR-0034).',
  });
});
