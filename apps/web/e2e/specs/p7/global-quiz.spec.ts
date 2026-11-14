import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReferenceRegion,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const NOW = '2026-11-11T12:20:00Z';
const REFERENCE_DIR = fileURLToPath(
  new URL('../../../../../design/references/', import.meta.url),
);
/** Content region of `SCR-10-base-desktop.png` (1600 × 1000): eyebrow to card bottom. */
const REFERENCE_DESKTOP = { x: 311, y: 86, width: 1042, height: 752 } as const;

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
    states: states.map((row) => ({ ...row })),
    streakDays: profiles[0]?.streak_days ?? 0,
    streakComputedOn: profiles[0]?.streak_computed_on ?? null,
    daily: daily.map((row) => ({ ...row, sources: [...row.sources] })),
  };
}

/** Restores the demonstration day after a test answered or closed the session. */
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
  await serviceDb().transaction(async (tx) => {
    // Lock the rows first: a late answer transaction of the previous test commits before this one,
    // so the restored FSRS values are the last write (the test clock is frozen).
    await tx.execute(sql`
      select 1 from public.notion_states
      where user_id = ${demoUserId('alex')}::uuid
      for update
    `);
    for (const state of snapshot.states) {
      await tx.execute(sql`
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
  });
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
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3110' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

function quizUrl(formationId = SAP): string {
  return `/formations/${formationId}/quiz-global`;
}

test('session du jour et carte de rappel @SPEC-701', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/accueil');
  await page.getByRole('link', { name: 'Jouer maintenant' }).click();
  await expect(page).toHaveURL(new RegExp(`${quizUrl()}$`));

  const header = page.getByTestId('gq-header');
  await expect(header).toContainText('SAP S/4HANA Finance · session du mercredi 11 novembre');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quiz global');
  await expect(page.getByTestId('gq-pill-notions')).toHaveText('14 notions');
  await expect(page.getByTestId('gq-pill-modules')).toHaveText('Modules 1 et 2 mêlés');
  await expect(page.getByTestId('gq-pill-duration')).toHaveText('≈ 10 min');

  await expect(page.getByTestId('gq-mode-full')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-micro')).toBeEnabled();
  await expect(page.getByTestId('gq-mode-note')).toContainText(
    '18 notions étaient dues aujourd’hui : 4 sont reportées à jeudi pour que vos révisions restent sous 15 min.',
  );
  await expect(page.getByTestId('gq-mode-note')).toContainText('Régler');
  await expect(page.getByTestId('gq-progress-label')).toHaveText('Jeu 1 sur 5');

  const rail = page.getByTestId('gq-rail');
  await expect(rail.getByRole('button')).toHaveCount(5);
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Carte de rappel');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Variante d’exercice');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Choisi pour votre oubli');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('En cours');
  await expect(page.getByTestId('gq-rail-item-2')).toContainText('Association');
  await expect(page.getByTestId('gq-rail-item-3')).toContainText('Remise en ordre');
  await expect(page.getByTestId('gq-rail-item-4')).toContainText('Classement');
  await expect(page.getByTestId('gq-rail-item-5')).toContainText('Texte à trous');
  await expect(page.getByTestId('gq-rail-item-5')).toContainText('À venir');

  const rationale = page.getByTestId('gq-rationale');
  await expect(rationale).toContainText('Réglé par le tuteur');
  await expect(rationale).toContainText(
    'Lacune en priorité : la variante d’exercice, oubliée depuis le 6 nov., revient en carte de rappel.',
  );
  await expect(rationale).toContainText(
    'Charge lissée : 4 notions sur 18 reportées à jeudi, pour rester sous 15 min par jour.',
  );
  await expect(rationale).toContainText(
    'Modules mêlés : retrouver la bonne notion parmi d’autres la fixe mieux.',
  );

  await expect(page.getByTestId('gq-game-title')).toHaveText('Carte de rappel');
  await expect(page.getByTestId('gq-game')).toContainText('Variante d’exercice · Module 2');
  await expect(page.getByTestId('gq-game-tech')).toHaveText('Rappel actif');
  await expect(page.getByTestId('recall-card-front')).toContainText('Recto · cherchez de tête');
  await expect(page.getByTestId('recall-card-front')).toContainText(
    'Que définit une variante d’exercice comptable ?',
  );
  await captureEvidence('spec-701-recto');

  await page.getByTestId('recall-card-flip').click();
  await expect(page.getByTestId('recall-card-back')).toContainText('Verso · réponse');
  await expect(page.getByTestId('recall-card-back')).toContainText(
    'Le nombre de périodes comptables d’un exercice, et leurs dates de début et de fin.',
  );
  await expect(page.getByTestId('recall-card-back')).toContainText(
    'Source : votre cours du module 2, chapitre 2',
  );
  await expect(page.getByTestId('recall-grade-again')).toContainText('Raté');
  await expect(page.getByTestId('recall-grade-hard')).toContainText('Difficile');
  await expect(page.getByTestId('recall-grade-good')).toContainText('Bon');
  await expect(page.getByTestId('recall-grade-easy')).toContainText('Facile');
  await expect(page.getByTestId('recall-grade-good')).toContainText(
    /Aujourd’hui|Demain|Dans \d+ (jours|semaines|mois)/,
  );
  await captureEvidence('spec-701-verso');

  await page.getByTestId('recall-grade-good').click();
  await expect(page.getByTestId('recall-grade-good')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('recall-grade-again')).toBeDisabled();
  await expect(page.getByTestId('recall-grade-hard')).toBeDisabled();
  await expect(page.getByTestId('recall-grade-easy')).toBeDisabled();
  await expect(page.getByTestId('gq-skip')).toBeDisabled();
  await expect(page.getByTestId('gq-next')).toBeEnabled();

  await page.getByTestId('gq-next').click();
  await expect(page.getByTestId('gq-game-title')).toHaveText('Association');
  await expect(page.getByTestId('gq-progress-label')).toHaveText('Jeu 2 sur 5');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Fait');
  await expect(page.getByTestId('gq-rail-item-2')).toContainText('En cours');

  for (const index of [2, 3, 4, 5]) {
    await page.getByTestId('gq-skip').click();
    await expect(page.getByTestId(`gq-rail-item-${String(index)}`)).toContainText('Fait');
  }
  await expect(page.getByTestId('gq-next')).toHaveText('Terminer la session');
  await page.getByTestId('gq-next').click();

  await expect(page.getByTestId('gq-end')).toBeVisible();
  await expect(page.getByTestId('gq-end-title')).toHaveText('14 notions revues en 1 minute');
  await expect(page.getByTestId('gq-end-ok')).toHaveText('1');
  await expect(page.getByTestId('gq-end-soon')).toHaveText('13');
  await expect(page.getByTestId('gq-end-streak')).toHaveText('13 j');
  await expect(page.getByTestId('gq-end-next')).toHaveText('Prochaine session : demain, 17:00.');
  await captureEvidence('spec-701-fin');

  await axeCheck();
});

test('écran de fin de démonstration @SPEC-701', async ({
  page,
  axeCheck,
  captureEvidence,
  baseURL,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3110';
  // The scripted answers of positions 1, 2 and 3 (zero-based) leave the matching game skipped:
  // 1 + 4 + 3 + 3 = 11 successful notions, 3 coming back sooner. The time spent totals nine
  // minutes, as the demonstration requires.
  const today = await page.request.get(
    `/api/v1/formations/${SAP}/global-quiz/today?mode=full`,
    { headers: { origin } },
  );
  expect(today.status()).toBe(200);
  const dto = (await today.json()) as { sessionId: string };
  const answersUrl = `/api/v1/review-sessions/${dto.sessionId}/answers`;
  const scripted: { position: number; response: unknown }[] = [
    { position: 2, response: { order: ['o1', 'o2', 'o3', 'o4'] } },
    {
      position: 3,
      response: {
        assignments: { i1: 'c1', i2: 'c1', i3: 'c2', i4: 'c2', i5: 'c1', i6: 'c2' },
      },
    },
    { position: 4, response: { gaps: { '1': 'tuile', '2': 'interne' } } },
  ];
  for (const entry of scripted) {
    const response = await page.request.post(answersUrl, {
      headers: { origin },
      data: {
        position: entry.position,
        clientAnswerId: randomUUID(),
        timeMs: 177_000,
        response: entry.response,
      },
    });
    expect(response.status()).toBe(200);
  }

  await page.goto(quizUrl());
  await page.getByTestId('recall-card-flip').click();
  await page.getByTestId('recall-grade-good').click();
  await expect(page.getByTestId('recall-grade-good')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('gq-next').click();
  await expect(page.getByTestId('gq-game-title')).toHaveText('Association');
  await page.getByTestId('gq-skip').click();
  await expect(page.getByTestId('gq-game-title')).toHaveText('Remise en ordre');
  await page.getByTestId('gq-next').click();
  await page.getByTestId('gq-next').click();
  await expect(page.getByTestId('gq-next')).toHaveText('Terminer la session');
  await page.getByTestId('gq-next').click();

  await expect(page.getByTestId('gq-end-title')).toHaveText('14 notions revues en 9 minutes');
  await expect(page.getByTestId('gq-end-ok')).toHaveText('11');
  await expect(page.getByTestId('gq-end-soon')).toHaveText('3');
  await expect(page.getByTestId('gq-end-streak')).toHaveText('13 j');
  await expect(page.getByTestId('gq-end-next')).toHaveText('Prochaine session : demain, 17:00.');
  await expect(page.getByTestId('gq-end-home')).toHaveAttribute('href', '/accueil');
  await expectScreenshotBaseline(page, 'global-quiz-fin.png');
  await captureEvidence('spec-701-demo-fin');
  await axeCheck();
});

test('état vide @SPEC-701', async ({ browser, baseURL }) => {
  const emptySession = await createTestSession();
  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    await context.addCookies(
      emptySession.cookies.map((cookie) => ({
        ...cookie,
        url: baseURL ?? 'http://127.0.0.1:3110',
      })),
    );
    const formation = await serviceDb().transaction(async (tx) => {
      await tx.execute(sql`
        update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris'
        where id = ${emptySession.userId}::uuid
      `);
      const programme = await createTestProgramme(tx, emptySession.userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      await tx.execute(sql`
        update public.modules set status = 'validated'
        where formation_id = ${programme.formationId}::uuid
      `);
      return programme;
    });
    const page = await context.newPage();
    await page.goto(quizUrl(formation.formationId));
    await expect(page.getByTestId('gq-empty')).toBeVisible();
    await expect(page.getByTestId('gq-empty')).toContainText('Rien à revoir aujourd’hui');
    await expect(page.getByTestId('gq-empty')).toContainText(
      'Toutes vos notions sont à jour. Le prochain quiz global sera prêt dès que des notions seront dues.',
    );
  } finally {
    await context.close();
    await deleteTestSession(emptySession);
  }
});

test('conformité visuelle du quiz global @SPEC-701 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(quizUrl());
  await expect(page.getByTestId('gq-rail')).toBeVisible();

  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="gq-pill-notions"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '999px',
    },
    '[data-testid="gq-mode-full"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="gq-rationale"]': { 'background-color': colors.ink },
    '[data-testid="gq-rationale"] h2': { color: colors.lime },
    '[data-testid="gq-rail"]': {
      'background-color': colors.surface,
      'border-radius': '21.6px',
    },
    '[data-testid="gq-game"]': {
      'background-color': colors.surface,
      'border-radius': '21.6px',
    },
    '[data-testid="gq-game-tech"]': {
      'background-color': colors['violet-soft'],
      color: colors['violet-ink'],
    },
    '[data-testid="gq-next"]': { 'background-color': colors.lime },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '30.6px');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-weight', '600');

  const content = page.getByTestId('global-quiz-page');
  const actual = await content.screenshot({ animations: 'disabled', scale: 'css' });
  const comparison = compareWithReferenceRegion(
    actual,
    `${REFERENCE_DIR}SCR-10-base-desktop.png`,
    REFERENCE_DESKTOP,
    testInfo.outputPath('visual'),
    'spec-701-desktop',
  );
  await testInfo.attach('spec-701-desktop-side-by-side', {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('spec-701-desktop-diff', {
    path: comparison.diffPath,
    contentType: 'image/png',
  });
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: `spec-701-desktop:${comparison.ratio.toFixed(4)}`,
  });
  expect(comparison.ratio, 'écart à la maquette').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(quizUrl());
  await expect(page.getByTestId('gq-rail')).toBeVisible();
  await expectScreenshotBaseline(page, 'global-quiz-recto.png');
  await axeCheck();
});
