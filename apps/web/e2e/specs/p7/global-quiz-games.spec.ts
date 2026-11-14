// SPEC-702 — les quatre jeux du quiz global (SCR-10) : association, remise en ordre, classement
// et texte à trous. Parcours souris, parcours clavier et conformité visuelle (CA-1 à CA-9).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReference,
  cropPng,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const NOW = '2026-11-11T12:20:00Z';
const MAQUETTE = fileURLToPath(
  new URL('../../../../../design/maquettes/QuizGlobal.dc.html', import.meta.url),
);

interface StateSnapshot {
  [key: string]: unknown;
  notion_id: string;
  fsrs: unknown;
  due_at: string;
  mastery: string;
  first_seen_at: string;
  last_seen_at: string;
  success_count: number;
  gap_nature: string | null;
  gap_confused_with: string | null;
  gap_detected_at: string | null;
  gap_evidence: string | null;
  gap_cleared_at: string | null;
  suspended: boolean;
  in_review: boolean;
  revision: number;
}

interface DemoSnapshot {
  states: StateSnapshot[];
  streakDays: number;
  streakComputedOn: string | null;
  daily: { day: string; minutes: number; qualifying: boolean; sources: string[] }[];
}

let snapshot: DemoSnapshot;
let session: TestSession;

async function captureSnapshot(): Promise<DemoSnapshot> {
  const states = await serviceDb().execute<StateSnapshot>(sql`
    select
      notion_id::text as notion_id, fsrs, due_at::text as due_at, mastery::text as mastery,
      first_seen_at::text as first_seen_at, last_seen_at::text as last_seen_at, success_count,
      gap_nature::text as gap_nature, gap_confused_with::text as gap_confused_with,
      gap_detected_at::text as gap_detected_at, gap_evidence, gap_cleared_at::text as gap_cleared_at,
      suspended, in_review, revision
    from public.notion_states
    where user_id = ${demoUserId('alex')}::uuid
      and notion_id in (select id from public.notions where formation_id = ${SAP}::uuid)
  `);
  const profiles = await serviceDb().execute<{
    [key: string]: unknown;
    streak_days: number;
    streak_computed_on: string | null;
  }>(sql`
    select streak_days, streak_computed_on::text as streak_computed_on
    from public.profiles where id = ${demoUserId('alex')}::uuid
  `);
  const daily = await serviceDb().execute<{
    [key: string]: unknown;
    day: string;
    minutes: number;
    qualifying: boolean;
    sources: string[];
  }>(sql`
    select day::text as day, minutes, qualifying, sources
    from public.daily_activity where user_id = ${demoUserId('alex')}::uuid
  `);
  return {
    states,
    streakDays: profiles[0]?.streak_days ?? 0,
    streakComputedOn: profiles[0]?.streak_computed_on ?? null,
    daily,
  };
}

/** Deletes the day's session and restores the FSRS/gap/streak snapshot of the demonstration. */
async function restoreDemoSession(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.activities
    where owner_id = ${demoUserId('alex')}::uuid
      and kind = 'global_quiz_session'::public.activity_kind
  `);
  await serviceDb().execute(sql`
    delete from public.review_logs
    where user_id = ${demoUserId('alex')}::uuid
      and reviewed_at >= ${NOW}::timestamptz
  `);
  for (const state of snapshot.states) {
    await serviceDb().execute(sql`
      update public.notion_states set
        fsrs = ${JSON.stringify(state.fsrs)}::jsonb,
        due_at = ${state.due_at}::timestamptz,
        mastery = ${state.mastery}::numeric,
        first_seen_at = ${state.first_seen_at}::timestamptz,
        last_seen_at = ${state.last_seen_at}::timestamptz,
        success_count = ${state.success_count},
        gap_nature = ${state.gap_nature}::public.gap_nature,
        gap_confused_with = ${state.gap_confused_with}::uuid,
        gap_detected_at = ${state.gap_detected_at}::timestamptz,
        gap_evidence = ${state.gap_evidence},
        gap_cleared_at = ${state.gap_cleared_at}::timestamptz,
        suspended = ${state.suspended},
        in_review = ${state.in_review},
        revision = ${state.revision}
      where user_id = ${demoUserId('alex')}::uuid and notion_id = ${state.notion_id}::uuid
    `);
  }
  await serviceDb().execute(sql`
    update public.profiles
    set streak_days = ${snapshot.streakDays},
        streak_computed_on = ${snapshot.streakComputedOn}::date
    where id = ${demoUserId('alex')}::uuid
  `);
  for (const entry of snapshot.daily) {
    await serviceDb().execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values (
        ${demoUserId('alex')}::uuid, ${entry.day}::date, ${entry.minutes}, ${entry.qualifying},
        ${`{${entry.sources.join(',')}}`}::text[]
      )
      on conflict (user_id, day) do update set
        minutes = excluded.minutes,
        qualifying = excluded.qualifying,
        sources = excluded.sources
    `);
  }
}

test.beforeAll(async () => {
  snapshot = await captureSnapshot();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await restoreDemoSession();
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3116' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

function quizUrl(): string {
  return `/formations/${SAP}/quiz-global`;
}

/** Focuses the element carrying `data-testid` using Tab only (CA-8). */
async function tabTo(
  page: import('@playwright/test').Page,
  testId: string,
  maxPresses = 800,
): Promise<void> {
  for (let index = 0; index < maxPresses; index += 1) {
    const found = await page.evaluate(
      (id) => document.activeElement?.getAttribute('data-testid') === id,
      testId,
    );
    if (found) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Élément ${testId} inaccessible au clavier.`);
}

/** Focuses the first button whose text contains `text` using Tab only (CA-8). */
async function tabToButtonText(
  page: import('@playwright/test').Page,
  text: string,
  maxPresses = 800,
): Promise<void> {
  for (let index = 0; index < maxPresses; index += 1) {
    const found = await page.evaluate((wanted) => {
      const active = document.activeElement;
      return (
        active instanceof HTMLElement &&
        active.tagName === 'BUTTON' &&
        (active.textContent).includes(wanted)
      );
    }, text);
    if (found) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Bouton « ${text} » inaccessible au clavier.`);
}

async function itemLabels(page: import('@playwright/test').Page, prefix: string): Promise<string[]> {
  return page.locator(`[data-testid^="${prefix}"]`).allTextContents();
}

async function sortOrderingWithKeyboard(page: import('@playwright/test').Page): Promise<void> {
  const expected = ['Mandant', 'Société', 'Division', 'Magasin'];
  for (const [target, label] of expected.entries()) {
    for (;;) {
      const labels = await itemLabels(page, 'ordering-item-');
      const index = labels.findIndex((text) => text.includes(label));
      if (index <= target) break;
      await tabTo(page, `ordering-up-${String(index + 1)}`);
      await page.keyboard.press('Enter');
    }
  }
}

async function sortOrderingWithMouse(page: import('@playwright/test').Page): Promise<void> {
  const expected = ['Mandant', 'Société', 'Division', 'Magasin'];
  for (const [target, label] of expected.entries()) {
    for (;;) {
      const labels = await itemLabels(page, 'ordering-item-');
      const index = labels.findIndex((text) => text.includes(label));
      if (index <= target) break;
      await page.getByTestId(`ordering-up-${String(index + 1)}`).click();
    }
  }
}

async function answerMatching(
  page: import('@playwright/test').Page,
  pairs: Array<[number, string]>,
  mouse = true,
): Promise<void> {
  for (const [left, definition] of pairs) {
    if (mouse) {
      await page.getByTestId(`matching-left-${String(left)}`).click();
      await page.getByRole('button', { name: new RegExp(definition) }).first().click();
    } else {
      await tabTo(page, `matching-left-${String(left)}`);
      await page.keyboard.press('Enter');
      await tabToButtonText(page, definition);
      await page.keyboard.press('Enter');
    }
  }
  if (mouse) await page.getByTestId('matching-verify').click();
  else {
    await tabTo(page, 'matching-verify');
    await page.keyboard.press('Enter');
  }
}

async function answerCategorization(
  page: import('@playwright/test').Page,
  wrongLabel: string | null,
  mouse = true,
): Promise<void> {
  const rows = page.locator('[data-testid^="categorization-row-"]');
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const label = await rows.nth(index).locator('span').first().textContent();
    const base = ['Compte général', 'Fournisseur', 'Client'].includes(label ?? '');
    const wrong = wrongLabel !== null && label === wrongLabel;
    const target = wrong ? !base : base;
    const choice = target ? 1 : 2;
    if (mouse) {
      await page.getByTestId(`categorization-choice-${String(index + 1)}-${String(choice)}`).click();
    } else {
      await tabTo(page, `categorization-choice-${String(index + 1)}-${String(choice)}`);
      await page.keyboard.press('Enter');
    }
  }
  if (mouse) await page.getByTestId('categorization-verify').click();
  else {
    await tabTo(page, 'categorization-verify');
    await page.keyboard.press('Enter');
  }
}

async function fillCloze(
  page: import('@playwright/test').Page,
  values: [string, string],
  mouse = true,
): Promise<void> {
  if (mouse) {
    await page.getByTestId('cloze-gap-1').fill(values[0]);
    await page.getByTestId('cloze-gap-2').fill(values[1]);
    await page.getByTestId('cloze-verify').click();
  } else {
    await tabTo(page, 'cloze-gap-1');
    await page.keyboard.type(values[0]);
    await tabTo(page, 'cloze-gap-2');
    await page.keyboard.type(values[1]);
    await page.keyboard.press('Enter');
  }
}

test('association, ordre, classement, trous @SPEC-702', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(quizUrl());
  await page.getByTestId('recall-card-flip').click();
  await page.getByTestId('recall-grade-good').click();
  await expect(page.getByTestId('gq-next')).toBeEnabled();
  await page.getByTestId('gq-next').click();

  // EF-1 — association : une erreur volontaire (Société → plan comptable).
  await expect(page.getByTestId('gq-game-title')).toHaveText('Association');
  await expect(page.getByTestId('game-matching')).toContainText(
    'Touchez une notion, puis la définition qui lui correspond.',
  );
  await expect(page.getByTestId('matching-verify')).toBeDisabled();
  await expect(page.getByTestId('matching-left-1')).toContainText('Société');
  await expect(page.getByTestId('matching-left-1').locator('span').first()).toHaveText('1');
  await captureEvidence('association-avant');
  await answerMatching(page, [
    [1, 'Liste des comptes généraux utilisables'],
    [2, 'Entité juridique qui tient sa propre comptabilité'],
    [3, 'Page d’accueil qui regroupe les applications'],
  ]);
  await expect(page.getByTestId('matching-left-1')).toHaveCSS(
    'background-color',
    'rgb(255, 237, 224)',
  );
  await expect(page.getByTestId('matching-left-3')).toHaveCSS(
    'background-color',
    'rgb(225, 244, 239)',
  );
  await expect(page.getByTestId('game-matching')).toContainText('Attendu : Plan comptable');
  await expect(page.getByTestId('game-explanation')).toContainText(
    'La société porte les comptes, le plan comptable les liste et le launchpad les expose.',
  );
  await expect(page.getByTestId('matching-left-1')).toBeDisabled();
  await expect(page.getByTestId('matching-reset')).toBeDisabled();
  await expect(page.getByTestId('gq-next')).toBeEnabled();
  await expect(page.getByTestId('gq-skip')).toBeDisabled();
  await expect(page.getByTestId('gq-rail-item-2')).toContainText('Fait');
  await captureEvidence('association-apres');

  // EF-7 — rechargement : la correction enregistrée reste affichée en lecture seule.
  await page.reload();
  await page.getByTestId('gq-rail-item-2').click();
  await expect(page.getByTestId('matching-left-1')).toBeDisabled();
  await expect(page.getByTestId('game-matching')).toContainText('Attendu : Plan comptable');

  // EF-2 — remise en ordre jusqu'à Mandant, Société, Division, Magasin.
  await page.getByTestId('gq-rail-item-3').click();
  await expect(page.getByTestId('game-ordering')).toBeVisible();
  await expect(page.getByTestId('ordering-up-1')).toBeDisabled();
  await expect(page.getByTestId('ordering-down-4')).toBeDisabled();
  await captureEvidence('ordre-avant');
  await sortOrderingWithMouse(page);
  await page.getByTestId('ordering-verify').click();
  for (let index = 1; index <= 4; index += 1) {
    await expect(page.getByTestId(`ordering-item-${String(index)}`)).toHaveCSS(
      'background-color',
      'rgb(225, 244, 239)',
    );
  }
  await expect(page.getByTestId('game-ordering')).not.toContainText('Position attendue');
  await expect(page.getByTestId('ordering-up-2')).toBeDisabled();
  await expect(page.getByTestId('gq-rail-item-3')).toContainText('Fait');
  await captureEvidence('ordre-apres');

  // EF-3, EF-5 — classement avec une erreur volontaire.
  await page.getByTestId('gq-rail-item-4').click();
  await expect(page.getByTestId('game-categorization')).toBeVisible();
  await expect(page.getByTestId('categorization-verify')).toBeDisabled();
  await captureEvidence('classement-avant');
  await answerCategorization(page, 'Compte général');
  const wrongRow = page
    .locator('[data-testid^="categorization-row-"]')
    .filter({ hasText: 'Compte général' });
  await expect(wrongRow).toContainText('Attendu : Donnée de base');
  await expect(wrongRow).toHaveCSS('background-color', 'rgb(255, 237, 224)');
  await expect(page.getByTestId('categorization-bucket-1')).toContainText('Fournisseur');
  await expect(page.getByTestId('categorization-bucket-2')).toContainText('Facture d’achat');
  await expect(page.getByTestId('gq-rail-item-4')).toContainText('Fait');
  await captureEvidence('classement-apres');

  // EF-4 — texte à trous sans liste de choix.
  await page.getByTestId('gq-rail-item-5').click();
  await expect(page.getByTestId('game-cloze')).toContainText(
    'Complétez de tête, sans liste de choix.',
  );
  await expect(page.getByRole('textbox', { name: 'Premier mot manquant' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Second mot manquant' })).toBeVisible();
  await expect(page.getByTestId('cloze-verify')).toBeDisabled();
  await captureEvidence('trous-avant');
  await fillCloze(page, ['Tuile', 'interne']);
  await expect(page.getByTestId('cloze-expected')).toHaveText(
    'Réponses attendues : tuile et interne.',
  );
  await expect(page.getByTestId('cloze-gap-1')).toHaveCSS('background-color', 'rgb(225, 244, 239)');
  await expect(page.getByTestId('cloze-gap-2')).toHaveCSS('background-color', 'rgb(225, 244, 239)');
  await expect(page.getByTestId('cloze-gap-1')).toBeDisabled();
  await expect(page.getByTestId('gq-rail-item-5')).toContainText('Fait');
  await captureEvidence('trous-apres');

  await expect(page.getByTestId('gq-next')).toHaveText('Terminer la session');
  await page.getByTestId('gq-next').click();
  await expect(page.getByTestId('gq-end')).toBeVisible();
  await axeCheck();
});

test('jeux au clavier @SPEC-702', async ({ page, axeCheck }) => {
  await page.goto(quizUrl());
  await tabTo(page, 'recall-card-flip');
  await page.keyboard.press('Enter');
  await tabTo(page, 'recall-grade-good');
  await page.keyboard.press('Enter');
  await tabTo(page, 'gq-next');
  await page.keyboard.press('Enter');

  // Association au clavier.
  await expect(page.getByTestId('gq-game-title')).toHaveText('Association');
  await answerMatching(
    page,
    [
      [1, 'Entité juridique qui tient sa propre comptabilité'],
      [2, 'Liste des comptes généraux utilisables'],
      [3, 'Page d’accueil qui regroupe les applications'],
    ],
    false,
  );
  await expect(page.getByTestId('matching-left-1')).toHaveCSS(
    'background-color',
    'rgb(225, 244, 239)',
  );
  await tabTo(page, 'gq-next');
  await page.keyboard.press('Enter');

  // Remise en ordre au clavier, avec suivi du focus.
  await expect(page.getByTestId('ordering-item-1')).toBeVisible();
  await sortOrderingWithKeyboard(page);
  await tabTo(page, 'ordering-verify');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ordering-item-1')).toHaveCSS(
    'background-color',
    'rgb(225, 244, 239)',
  );
  await tabTo(page, 'gq-next');
  await page.keyboard.press('Enter');

  // Classement au clavier.
  await expect(page.getByTestId('game-categorization')).toBeVisible();
  await answerCategorization(page, null, false);
  await expect(page.getByTestId('categorization-verify')).toBeDisabled();
  await tabTo(page, 'gq-next');
  await page.keyboard.press('Enter');

  // Texte à trous au clavier : Entrée dans le dernier trou vérifie.
  await expect(page.getByTestId('game-cloze')).toBeVisible();
  await fillCloze(page, ['Tuile', 'INTERNE'], false);
  await expect(page.getByTestId('cloze-expected')).toHaveText(
    'Réponses attendues : tuile et interne.',
  );
  await tabTo(page, 'gq-next');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('gq-end')).toBeVisible();
  await axeCheck();
});

/** Captures one game state of the mockup, at the same viewport as the application. */
async function mockupGame(
  browser: import('@playwright/test').Browser,
  railIndex: number,
  output: string,
): Promise<{ width: number; height: number }> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto(`file://${MAQUETTE}`);
    await page.locator('nav[aria-label="Jeux de la session"] button').nth(railIndex).click();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const region = page.locator('section[aria-labelledby="t-jeu"]');
    await region.screenshot({ path: output, animations: 'disabled', scale: 'css' });
    const box = await region.boundingBox();
    return { width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
  } finally {
    await context.close();
  }
}

test('conformité des jeux @SPEC-702 @visual', async ({
  page,
  browser,
  axeCheck,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(quizUrl());
  const games = [
    {
      name: 'association',
      rail: 1,
      tokens: {
        '[data-testid="matching-left-1"]': {
          'background-color': colors.surface,
          'border-color': colors['border-strong'],
          'border-radius': '14.4px',
          'min-height': '57.6px',
        },
        '[data-testid="matching-right-2"]': {
          'background-color': colors.surface,
          'border-color': colors['border-dashed'],
        },
      },
    },
    {
      name: 'ordre',
      rail: 2,
      tokens: {
        '[data-testid="ordering-item-1"]': {
          'background-color': colors['surface-subtle'],
          'border-color': colors.border,
          'border-radius': '16.2px',
        },
      },
    },
    {
      name: 'classement',
      rail: 3,
      tokens: {
        '[data-testid="categorization-bucket-1"]': {
          'border-color': colors['border-dashed'],
          'border-radius': '16.2px',
        },
        '[data-testid="categorization-row-1"]': {
          'background-color': colors.surface,
          'border-color': colors.border,
        },
      },
    },
    {
      name: 'trous',
      rail: 4,
      tokens: {
        '[data-testid="cloze-gap-1"]': {
          'background-color': colors.canvas,
          'width': '135px',
          'font-size': '18px',
        },
      },
    },
  ] as const;

  for (const game of games) {
    await page.getByTestId(`gq-rail-item-${String(game.rail + 1)}`).click();
    await expect(page.getByTestId('gq-game')).toBeVisible();
    await expectTokens(page, game.tokens);
    if (game.name === 'trous') {
      await expect(page.getByTestId('cloze-text')).toHaveCSS('font-family', /Space Grotesk/);
      await expect(page.getByTestId('cloze-text')).toHaveCSS('font-size', '21.6px');
    }
    const appRegion = page.getByTestId('gq-game');
    const appBox = await appRegion.boundingBox();
    const mockupPath = testInfo.outputPath(`maquette-${game.name}.png`);
    const mockupBox = await mockupGame(browser, game.rail, mockupPath);
    const width = Math.min(Math.round(appBox?.width ?? 0), mockupBox.width);
    const height = Math.min(Math.round(appBox?.height ?? 0), mockupBox.height);
    const actual = cropPng(await appRegion.screenshot({ animations: 'disabled', scale: 'css' }), width, height);
    const reference = cropPng(mockupPath, width, height);
    const referenceFile = testInfo.outputPath(`reference-${game.name}.png`);
    await testInfo.attach(`reference-${game.name}`, {
      body: reference,
      contentType: 'image/png',
    });
    fs.writeFileSync(referenceFile, reference);
    const comparison = compareWithReference(
      actual,
      referenceFile,
      testInfo.outputPath('visual'),
      `spec-702-${game.name}`,
    );
    await testInfo.attach(`spec-702-${game.name}-side-by-side`, {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`spec-702-${game.name}-diff`, {
      path: comparison.diffPath,
      contentType: 'image/png',
    });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `spec-702-${game.name}:${comparison.ratio.toFixed(4)}`,
    });
    expect(comparison.ratio, `écart maquette ${game.name}`).toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );

    await expectScreenshotBaseline(appRegion, `jeux-${game.name}-avant.png`);
    if (game.name === 'association') {
      await answerMatching(page, [
        [1, 'Entité juridique qui tient sa propre comptabilité'],
        [2, 'Liste des comptes généraux utilisables'],
        [3, 'Page d’accueil qui regroupe les applications'],
      ]);
      await expect(page.getByTestId('game-explanation')).toBeVisible();
    } else if (game.name === 'ordre') {
      await sortOrderingWithMouse(page);
      await page.getByTestId('ordering-verify').click();
      await expect(page.getByTestId('ordering-item-1')).toHaveCSS(
        'background-color',
        'rgb(225, 244, 239)',
      );
    } else if (game.name === 'classement') {
      await answerCategorization(page, null);
      await expect(page.getByTestId('game-explanation')).toBeVisible();
    } else {
      await fillCloze(page, ['Tuile', 'interne']);
      await expect(page.getByTestId('cloze-expected')).toBeVisible();
    }
    await expectScreenshotBaseline(appRegion, `jeux-${game.name}-apres.png`);
  }
  await axeCheck();
});
