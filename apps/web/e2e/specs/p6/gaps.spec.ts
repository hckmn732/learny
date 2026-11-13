import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReferenceRegion,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

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

/** Content region of `SCR-13-base-desktop.png` (1600 × 1341): eyebrow to explanatory note. */
const REFERENCE_DESKTOP = { x: 311, y: 86, width: 1042, height: 1072 } as const;
/** Content region of `SCR-13-base-mobile.png` (433 × 3260): eyebrow to explanatory note. */
const REFERENCE_MOBILE = { x: 36, y: 628, width: 317, height: 2262 } as const;

const REFERENCE_DIR = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris'
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

interface SeededGaps {
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
  sectionIds: string[];
}

interface GapSeed {
  index: number;
  nature: 'confusion' | 'misunderstanding' | 'application' | 'forgetting';
  mastery: number;
  evidence: string;
  anchor: string;
}

const GAP_SEEDS: readonly GapSeed[] = [
  {
    index: 18,
    nature: 'confusion',
    mastery: 35,
    evidence: 'confondue avec le type de pièce dans 2 réponses, aux tentatives 1 et 2.',
    anchor: 'cle-de-comptabilisation',
  },
  {
    index: 19,
    nature: 'misunderstanding',
    mastery: 28,
    evidence: 'erreurs répétées et réponses ouvertes à côté du sujet.',
    anchor: 'ledgers-paralleles',
  },
  {
    index: 20,
    nature: 'application',
    mastery: 55,
    evidence: 'définition juste, mais exercice de saisie échoué.',
    anchor: 'equilibre-d-une-piece',
  },
  {
    index: 9,
    nature: 'forgetting',
    mastery: 60,
    evidence: 'réussie le 6 nov., ratée au quiz global du 10 nov.',
    anchor: 'variante-d-exercice',
  },
];

const NOTION_LABELS: Readonly<Record<number, string>> = {
  9: 'Variante d’exercice',
  18: 'Clé de comptabilisation',
  19: 'Ledgers parallèles',
  20: 'Équilibre d’une pièce',
  21: 'Type de pièce',
};

/**
 * Mockup-shaped SAP formation: 7 modules, 23 mastered notions in modules 1 to 3 and the four gaps
 * of `Lacunes.dc.html` (three in module 3, the forgetting one in module 2), with the 14 due notion
 * states and the 12-day streak of SPEC-115. The next review is 16:00Z, displayed 17:00 in Paris.
 */
async function seedGaps(userId: string): Promise<SeededGaps> {
  return serviceDb().transaction(async (tx) => {
    // The extra notions of the last modules receive no state: the statistics only cover modules
    // 1 to 3, as in the mockup.
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 9,
      title: 'SAP S/4HANA Finance',
    });
    const moduleTitles = [
      'Fondamentaux de la comptabilité',
      'Devises et variantes d’exercice',
      'Saisie des pièces comptables',
      'Module 4',
      'Module 5',
      'Module 6',
      'Module 7',
    ];
    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const status = index < 2 ? 'validated' : index === 2 ? 'open' : 'locked';
      await tx.execute(sql`
        update public.modules
        set title = ${moduleTitles[index] ?? `Module ${String(index + 1)}`},
            status = ${status}::public.module_status,
            opened_at = ${index <= 2 ? NOW : null}::timestamptz,
            validated_at = ${index < 2 ? NOW : null}::timestamptz
        where id = ${moduleId}::uuid
      `);
    }
    for (const [index, chapterId] of programme.chapterIds.entries()) {
      const modulePosition = Math.floor(index / 9);
      await tx.execute(sql`
        update public.chapters
        set title = ${modulePosition === 2 ? 'Chapitre 1 · Saisie' : 'Chapitre 1'}
        where id = ${chapterId}::uuid
      `);
    }
    for (const [index, label] of Object.entries(NOTION_LABELS)) {
      await tx.execute(sql`
        update public.notions set label = ${label} where id = ${programme.notionIds[Number(index)]}::uuid
      `);
    }

    const gapIndices = new Set(GAP_SEEDS.map((gap) => gap.index));
    const dueIndices = new Set<number>([0, 1, 2, 10, 11, 12, 21, 22, 23, 24]);
    let dueCount = 0;
    for (const index of [...Array(27).keys()]) {
      if (gapIndices.has(index)) continue;
      const notionId = programme.notionIds[index];
      if (notionId === undefined) throw new Error('notion SAP absente');
      const inReview = dueCount < 10 && dueIndices.has(index);
      if (inReview) dueCount += 1;
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: 84 + (index % 8),
        inReview,
        dueAt: new Date('2026-11-11T16:00:00Z'),
      });
    }
    for (const gap of GAP_SEEDS) {
      const notionId = programme.notionIds[gap.index];
      if (notionId === undefined) throw new Error('notion de lacune absente');
      await createNotionState(tx, {
        userId,
        notionId,
        gapNature: gap.nature,
        mastery: gap.mastery,
        evidence: gap.evidence,
        inReview: true,
        dueAt: new Date('2026-11-11T16:00:00Z'),
        ...(gap.nature === 'confusion'
          ? {
              confusedWith: programme.notionIds[21] ?? null,
            }
          : {}),
      });
      await tx.execute(sql`
        insert into public.gap_events (user_id, notion_id, kind, nature, evidence)
        values (
          ${userId}::uuid,
          ${notionId}::uuid,
          'detected',
          ${gap.nature}::public.gap_nature,
          ${JSON.stringify({ summary: gap.evidence })}::jsonb
        )
      `);
    }

    const module3 = programme.moduleIds[2];
    const module2 = programme.moduleIds[1];
    if (module3 === undefined || module2 === undefined) throw new Error('module SAP absent');
    const course3 = await createTestCourse(tx, {
      ownerId: userId,
      moduleId: module3,
      sectionsPerChapter: 3,
    });
    const course2 = await createTestCourse(tx, {
      ownerId: userId,
      moduleId: module2,
      sectionsPerChapter: 1,
    });
    const sections = [
      { id: course3.sectionIds[0], notion: programme.notionIds[18], anchor: 'cle-de-comptabilisation' },
      { id: course3.sectionIds[1], notion: programme.notionIds[19], anchor: 'ledgers-paralleles' },
      { id: course3.sectionIds[2], notion: programme.notionIds[20], anchor: 'equilibre-d-une-piece' },
      { id: course2.sectionIds[0], notion: programme.notionIds[9], anchor: 'variante-d-exercice' },
    ];
    for (const section of sections) {
      if (section.id === undefined || section.notion === undefined) {
        throw new Error('section de cours absente');
      }
      await tx.execute(sql`
        update public.course_sections
        set anchor = ${section.anchor}, notion_ids = array[${section.notion}]::uuid[]
        where id = ${section.id}::uuid
      `);
    }

    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values ${sql.join(
        REGULARITY_DAYS.map(
          (day) => sql`(${userId}::uuid, ${day}::date, 60, true, array['e2e']::text[])`,
        ),
        sql`, `,
      )}
      on conflict (user_id, day) do nothing
    `);
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${programme.formationId}::uuid,
          onboarding_step = 'done',
          timezone = 'Europe/Paris',
          streak_days = 12
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations set last_opened_at = ${NOW}::timestamptz
      where id = ${programme.formationId}::uuid
    `);

    return {
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      chapterIds: programme.chapterIds,
      notionIds: programme.notionIds,
      sectionIds: [...course3.sectionIds, ...course2.sectionIds],
    };
  });
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`élément ${String(index)} absent`);
  return value;
}

function gapUrl(formationId: string, nature?: string): string {
  const base = `/formations/${formationId}/lacunes`;
  return nature === undefined ? base : `${base}?nature=${nature}`;
}

test('filtre et entraîne une lacune @SPEC-615', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seed = await seedGaps(session.userId);
  await page.goto(gapUrl(seed.formationId));

  await expect(page.getByRole('heading', { level: 1, name: 'Mes lacunes' })).toBeVisible();
  await expect(page.getByTestId('gaps-summary')).toContainText('4 notions');
  await expect(page.getByTestId('gaps-summary')).toContainText('23 notions');
  await expect(page.getByTestId('gaps-summary')).toContainText('17:00');
  await expect(page.getByTestId('gap-card')).toHaveCount(4);
  await expect(page.getByTestId('gaps-filter-count-all')).toHaveText('4');

  // CA-2 — Oubli then Confusion update `?nature=`, the cards and the URL, not the counters.
  await page.getByTestId('gaps-filter-forgetting').click();
  await expect(page).toHaveURL(new RegExp(`/lacunes\\?nature=forgetting$`));
  await expect(page.getByTestId('gap-card')).toHaveCount(1);
  await expect(page.getByTestId('gap-card')).toContainText('Variante d’exercice');
  await expect(page.getByTestId('gaps-filter-count-all')).toHaveText('4');
  await expect(page.getByTestId('gaps-filter-count-confusion')).toHaveText('1');

  await page.getByTestId('gaps-filter-confusion').click();
  await expect(page).toHaveURL(new RegExp(`/lacunes\\?nature=confusion$`));
  await expect(page.getByTestId('gap-card')).toHaveCount(1);
  await expect(page.getByTestId('gap-card')).toContainText('Clé de comptabilisation');
  await expect(page.getByTestId('gap-card')).toContainText('35 %');
  await expect(page.getByTestId('gap-card')).toContainText('Seuil de maîtrise : 80 %');
  await expect(page.getByTestId('gap-card')).toContainText(
    'confondue avec le type de pièce dans 2 réponses',
  );

  expect(consoleErrors).toEqual([]);

  // CA-3 — the targeted global quiz of the stored nature.
  await page.getByTestId('gap-train').click();
  await expect(page).toHaveURL(
    new RegExp(`/formations/${seed.formationId}/quiz-global\\?cible=${at(seed.notionIds, 18)}$`),
  );
  await page.goBack();
  await expect(page.getByTestId('gap-card')).toContainText('Clé de comptabilisation');

  // CA-2 — no counter changed in the database while switching filters.
  const rows = await serviceDb().execute<{ nature: string; count: number }>(sql`
    select gap_nature::text as nature, count(*)::int as count
    from public.notion_states
    where user_id = ${session.userId}::uuid and gap_nature is not null
    group by gap_nature
    order by gap_nature
  `);
  expect(rows).toEqual([
    { nature: 'forgetting', count: 1 },
    { nature: 'confusion', count: 1 },
    { nature: 'misunderstanding', count: 1 },
    { nature: 'application', count: 1 },
  ]);

  await axeCheck();
  await captureEvidence('spec-615-lacunes-filtre');
});

test('revoit la lacune dans le cours @SPEC-615', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedGaps(session.userId);
  await page.goto(gapUrl(seed.formationId, 'forgetting'));

  const card = page.getByTestId('gap-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Variante d’exercice');
  await expect(card).toContainText('Module 2 · Devises et variantes d’exercice');
  await expect(page.getByTestId('gaps-filter-forgetting')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByTestId('gap-course-link').click();
  await expect(page).toHaveURL(
    new RegExp(
      `/formations/${seed.formationId}/modules/${at(seed.moduleIds, 1)}/cours\\?chapitre=${at(seed.chapterIds, 1)}#variante-d-exercice$`,
    ),
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/lacunes\\?nature=forgetting$`));
  await expect(page.getByTestId('gap-card')).toContainText('Variante d’exercice');

  await axeCheck();
  await captureEvidence('spec-615-retour-cours');
});

test('refuse les lacunes d’un autre apprenant @SPEC-615', async ({ browser, baseURL }) => {
  const seed = await seedGaps(session.userId);
  const stranger = await createTestSession();
  const context = await browser.newContext(
    baseURL === undefined ? {} : { baseURL },
  );
  try {
    await context.addCookies(
      stranger.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
    );
    await serviceDb().execute(
      sql`update public.profiles set onboarding_step = 'done' where id = ${stranger.userId}::uuid`,
    );
    const page = await context.newPage();
    const response = await page.goto(gapUrl(seed.formationId));
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('system-not-found')).toBeVisible();
  } finally {
    await context.close();
    await deleteTestSession(stranger);
  }
});

/** Compares the real content element with the normalised region of the mockup reference. */
async function compareContent(
  page: import('@playwright/test').Page,
  referenceName: string,
  reference: { x: number; y: number; width: number; height: number },
  testInfo: import('@playwright/test').TestInfo,
  name: string,
): Promise<number> {
  const content = page.getByTestId('gaps-content');
  const actual = await content.screenshot({ animations: 'disabled', scale: 'css' });
  const comparison = compareWithReferenceRegion(
    actual,
    `${REFERENCE_DIR}${referenceName}`,
    reference,
    testInfo.outputPath('visual'),
    name,
  );
  await testInfo.attach(`${name}-side-by-side`, {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: `${name}:${comparison.ratio.toFixed(4)}`,
  });
  return comparison.ratio;
}

test('conformité SPEC-615 @SPEC-615 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = await seedGaps(session.userId);

  // Reference capture at 1600 × 1341, the exact viewport of SCR-13-base-desktop.png.
  await page.setViewportSize({ width: 1600, height: 1341 });
  await page.goto(gapUrl(seed.formationId));
  await expect(page.getByTestId('gap-card')).toHaveCount(4);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="gaps-stat-open"]': {
      'background-color': colors.ink,
      'border-radius': '19.8px',
    },
    '[data-testid="gaps-stat-open"] span:first-child': { color: colors.lime },
    '[data-testid="gaps-stat-mastered"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '19.8px',
    },
    '[data-testid="gaps-filter-all"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="gaps-filter-count-all"]': {
      'background-color': colors.lime,
      color: colors.ink,
    },
    '[data-testid="gap-course-link"]': {
      'background-color': colors.surface,
      'border-color': colors['border-strong'],
      'border-radius': '10.8px',
    },
    '[data-testid="gap-train"]': {
      'background-color': colors.ink,
      color: colors.white,
      'border-radius': '10.8px',
    },
  });
  const ratio = await compareContent(
    page,
    'SCR-13-base-desktop.png',
    REFERENCE_DESKTOP,
    testInfo,
    'spec-615-desktop',
  );
  expect(ratio, 'écart à la maquette desktop').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);

  // The 1440 × 900 baseline of the definition of done.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(gapUrl(seed.formationId));
  await expect(page.getByTestId('gap-card')).toHaveCount(4);
  await expectScreenshotBaseline(page, 'SCR-13-desktop.png', { fullPage: true });

  // Injecting a wrong nature keeps « Toutes » and shows the controlled message (CL-4).
  await page.goto(gapUrl(seed.formationId, 'inconnue'));
  await expect(page.getByTestId('gaps-invalid-nature')).toBeVisible();
  await expect(page.getByTestId('gaps-filter-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gap-card')).toHaveCount(4);

  await axeCheck();
});

test('conformité SPEC-615 mobile @SPEC-615 @visual @mobile', async ({
  page,
  axeCheck,
}, testInfo) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = await seedGaps(session.userId);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gapUrl(seed.formationId));
  await expect(page.getByTestId('gaps-content')).toBeVisible();
  await expect(page.getByTestId('gap-card')).toHaveCount(4);
  await expect(page.getByTestId('gaps-summary')).toContainText('4 notions');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-13-mobile.png', { fullPage: false });

  // Same content at the 390-wide logical viewport of SCR-13-base-mobile.png.
  await page.setViewportSize({ width: 390, height: 3260 });
  await page.goto(gapUrl(seed.formationId));
  await expect(page.getByTestId('gaps-content')).toBeVisible();
  await expect(page.getByTestId('gap-card')).toHaveCount(4);
  const ratio = await compareContent(
    page,
    'SCR-13-base-mobile.png',
    REFERENCE_MOBILE,
    testInfo,
    'spec-615-mobile',
  );
  expect(ratio, 'écart à la maquette mobile').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);

  await axeCheck();
});
