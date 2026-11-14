import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { createBrick } from '@learny/testing';
import {
  expect,
  test,
} from '@learny/testing/playwright';
import {
  createDemoSession,
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
const REFERENCE_DESKTOP = { x: 311, y: 86, width: 1042, height: 752 } as const;
const MICRO_BRICK = '70300000-0000-4000-8000-000000000001';

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
let microQuestionNotionIds: string[] = [];

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

/** Restores the demonstration day after a test answered or closed a session. */
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

/**
 * SPEC-703 §8.5 — the seed gives the recall card of the demonstration but no review question
 * covering four priority notions (the SPEC-115 cloze covers three and SPEC-702 is not delivered
 * yet). The test inserts its own choice question, deterministic and removed after the run.
 */
async function createMicroQuestion(): Promise<void> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    select distinct on (ns.notion_id) ns.notion_id::text as id
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${demoUserId('alex')}::uuid
      and n.formation_id = ${SAP}::uuid
      and not ns.suspended
      and ns.in_review
      and ns.due_at <= ${NOW}::timestamptz
      and n.label <> 'Variante d’exercice'
    order by ns.notion_id, ns.gap_nature nulls last, ns.due_at asc
    limit 4
  `);
  microQuestionNotionIds = rows.map((row) => row.id);
  await serviceDb().execute(sql`delete from public.bricks where id = ${MICRO_BRICK}::uuid`);
  await serviceDb().transaction(async (tx) => {
    await createBrick(tx, {
      id: MICRO_BRICK,
      ownerId: demoUserId('alex'),
      formationId: SAP,
      type: 'choice_question',
      purpose: 'review',
      notionIds: microQuestionNotionIds,
      payload: {
        stem: 'Quelle notion prioritaire la micro-séance doit-elle consolider ?',
        mode: 'single',
        options: microQuestionNotionIds.slice(0, 4).map((notionId, index) => ({
          id: `m${String(index + 1)}`,
          text: `La notion prioritaire ${String(index + 1)}`,
          correct: index === 0,
          notionId,
          rationale: 'Une seule réponse couvre la notion prioritaire.',
        })),
        explanation: 'La première réponse est la seule correcte pour cette notion prioritaire.',
        objective: 'Reconnaître la notion prioritaire de la micro-séance',
        sources: [],
      },
    });
  });
}

test.beforeAll(async () => {
  snapshot = await captureSnapshot();
  await createMicroQuestion();
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
  await serviceDb().execute(sql`delete from public.bricks where id = ${MICRO_BRICK}::uuid`);
  await closeDb();
});

function quizUrl(formationId = SAP): string {
  return `/formations/${formationId}/quiz-global`;
}

test('micro-séance de démonstration @SPEC-703', async ({
  page,
  axeCheck,
  captureEvidence,
  baseURL,
}) => {
  await page.goto(quizUrl());
  await page.getByTestId('gq-mode-micro').click();
  await expect(page).toHaveURL(new RegExp(`${quizUrl()}\\?mode=micro$`));
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-full')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('gq-mode-micro')).toHaveText('Micro-séance · 5 min');
  await expect(page.getByTestId('gq-mode-note')).toContainText(
    'Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés.',
  );
  await expect(page.getByTestId('gq-mode-note')).toContainText('Régler');
  await expect(page.getByTestId('gq-pill-notions')).toHaveText('5 notions');
  await expect(page.getByTestId('gq-pill-duration')).toHaveText('≈ 5 min');
  await expect(page.getByTestId('gq-progress-label')).toHaveText('Jeu 1 sur 2');
  const rail = page.getByTestId('gq-rail');
  await expect(rail.getByRole('button')).toHaveCount(2);
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Carte de rappel');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Variante d’exercice');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('En cours');
  await expect(page.getByTestId('gq-rail-item-2')).toContainText('Question');
  await expect(page.getByTestId('gq-rail-item-2')).toContainText('À venir');
  await expect(page.getByTestId('gq-rationale')).toContainText('Micro-séance');
  await expect(page.getByTestId('gq-rationale')).toContainText(
    'la notion la plus urgente en carte de rappel, puis une question qui en mêle plusieurs.',
  );
  await captureEvidence('spec-703-micro-recto');

  // CA-7 — the demonstration answers through the API so the frozen clock and the scripted
  // durations reproduce « 5 notions revues en 5 minutes » (4 réussies, 1 à revoir plus tôt).
  const origin = baseURL ?? 'http://127.0.0.1:3110';
  const today = await page.request.get(
    `/api/v1/formations/${SAP}/global-quiz/today?mode=micro`,
    { headers: { origin } },
  );
  expect(today.status()).toBe(200);
  const dto = (await today.json()) as {
    sessionId: string;
    items: { position: number; type: string; brickVersionId: string }[];
  };
  const answersUrl = `/api/v1/review-sessions/${dto.sessionId}/answers`;
  const card = dto.items.find((item) => item.type === 'recall_card');
  const question = dto.items.find((item) => item.type !== 'recall_card');
  if (card === undefined || question === undefined) throw new Error('micro-séance incomplète');
  const payloadRows = await serviceDb().execute<{ payload: { options: { id: string; correct: boolean }[] } }>(
    sql`select payload from public.brick_versions where id = ${question.brickVersionId}::uuid`,
  );
  const correct = payloadRows[0]?.payload.options.find((option) => option.correct)?.id;
  if (correct === undefined) throw new Error('option correcte absente');
  const scripted = [
    { position: card.position, timeMs: 120_000, response: { selfRating: 'again' } },
    { position: question.position, timeMs: 180_000, response: { optionIds: [correct] } },
  ];
  for (const entry of scripted) {
    const response = await page.request.post(answersUrl, {
      headers: { origin },
      data: { ...entry, clientAnswerId: crypto.randomUUID() },
    });
    expect(response.status()).toBe(200);
  }
  const complete = await page.request.post(
    `/api/v1/review-sessions/${dto.sessionId}/complete`,
    { headers: { origin } },
  );
  expect(complete.status()).toBe(200);

  await page.reload();
  await expect(page.getByTestId('gq-end')).toBeVisible();
  await expect(page.getByTestId('gq-end-title')).toHaveText('5 notions revues en 5 minutes');
  await expect(page.getByTestId('gq-end-ok')).toHaveText('4');
  await expect(page.getByTestId('gq-end-soon')).toHaveText('1');
  await expect(page.getByTestId('gq-end-streak')).toHaveText('13 j');
  await expect(page.getByTestId('gq-end-home')).toHaveAttribute('href', '/accueil');
  await expectScreenshotBaseline(page, 'micro-session-fin.png');
  await captureEvidence('spec-703-micro-fin');
  await axeCheck();
});

test('retour à la séance complète @SPEC-703', async ({ page }) => {
  await page.goto(quizUrl());
  await expect(page.getByTestId('gq-mode-full')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('recall-card-flip').click();
  await page.getByTestId('recall-grade-good').click();
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Fait');

  await page.getByTestId('gq-mode-micro').click();
  await expect(page).toHaveURL(new RegExp(`${quizUrl()}\\?mode=micro$`));
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-note')).toContainText('Version courte de secours');

  await page.getByTestId('gq-mode-full').click();
  await expect(page).toHaveURL(new RegExp(`${quizUrl()}$`));
  await expect(page.getByTestId('gq-mode-full')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Fait');
});

test('lien direct ?mode=micro @SPEC-703', async ({ page }) => {
  await page.goto(`${quizUrl()}?mode=micro`);
  await expect(page).toHaveURL(new RegExp(`${quizUrl()}\\?mode=micro$`));
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-note')).toContainText(
    'Version courte de secours : une carte de rappel et une question.',
  );
  await expect(page.getByTestId('gq-progress-label')).toHaveText('Jeu 1 sur 2');
});

test('micro-séance conforme @SPEC-703 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(quizUrl());
  await page.getByTestId('gq-mode-micro').click();
  await expect(page.getByTestId('gq-rail')).toBeVisible();
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');

  await expectTokens(page, {
    '[data-testid="gq-mode-micro"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="gq-mode-full"]': {
      'background-color': 'rgba(0, 0, 0, 0)',
      color: colors['ink-muted'],
    },
    '[data-testid="gq-pill-notions"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '999px',
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
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '30.6px');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-weight', '600');

  const content = page.getByTestId('global-quiz-page');
  const actual = await content.screenshot({ animations: 'disabled', scale: 'css' });
  const comparison = compareWithReferenceRegion(
    actual,
    `${REFERENCE_DIR}SCR-10-micro-desktop.png`,
    REFERENCE_DESKTOP,
    testInfo.outputPath('visual'),
    'spec-703-micro',
  );
  await testInfo.attach('spec-703-micro-side-by-side', {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach('spec-703-micro-diff', {
    path: comparison.diffPath,
    contentType: 'image/png',
  });
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: `spec-703-micro:${comparison.ratio.toFixed(4)}`,
  });
  expect(comparison.ratio, 'écart à la maquette').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(quizUrl());
  await page.getByTestId('gq-mode-micro').click();
  await expect(page.getByTestId('gq-rail')).toBeVisible();
  await expectScreenshotBaseline(page, 'micro-session.png');
  await axeCheck();
});
