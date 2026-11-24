// SPEC-807 EF-5, CA-2 — mock exam journey: the learner confirms the official format proposed from
// the guide, starts a help-free exam, answers, is interrupted and comes back, submits and reads a
// diagnostic result linked to the gaps and to the tutor's plan. The timer is computed by the
// server from the frozen clock (ADR-0047): coming back never grants extra time (SPEC-614 ET-4,
// BR-PRA-03, ADR-0172). Owner specifications: SPEC-614 (exam), SPEC-615 (Mes lacunes).
import type { Page } from '@playwright/test';

import { closeDb } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

import {
  CORRECT_PREFIX,
  GUIDE_FORMAT,
  MISSED_NOTION,
  MODULES,
  WRONG_PREFIX,
  elapseExamMinutes,
  questionStem,
  readExamAttempts,
  seedMockExamJourney,
} from './support/mock-exam';

test.setTimeout(240_000);

const TOTAL = GUIDE_FORMAT.questions;
/** Minutes spent away from the exam during the interruption. */
const AWAY_MINUTES = 6;
/** Deadline fixed at the start: 12:20 frozen server time + 16 min. */
const DEADLINE_AT_START = /^2026-11-11T12:36:00(\.000)?Z$/;
/** Same deadline seen after the interruption (both instants moved back by AWAY_MINUTES). */
const DEADLINE_AFTER_AWAY = /^2026-11-11T12:30:00(\.000)?Z$/;
/** Device clock of the reconnected tab, one hour behind: the timer must not trust it. */
const REWOUND_DEVICE_TIME = '2026-11-11T11:20:00Z';

let session: TestSession;

interface AttemptView {
  id: string;
  status: string;
  deadlineAt: string;
  serverTime: string;
  remainingSeconds: number;
  answeredCount: number;
  markedCount: number;
}

function notionOfStem(stem: string): { label: string; studied: boolean } {
  for (const entry of MODULES) {
    for (const label of entry.notions) {
      if (stem.trim() === questionStem(label)) return { label, studied: entry.studied };
    }
  }
  throw new Error(`question inattendue : ${stem}`);
}

/**
 * Answers the displayed question: every studied notion correctly except MISSED_NOTION, every
 * diagnostic notion wrongly. Waits for the server acknowledgement of the write.
 */
async function answerCurrent(page: Page, position: number): Promise<string> {
  await expect(page.getByText(`Question ${String(position)} sur ${String(TOTAL)}`)).toBeVisible();
  const stem = (await page.getByRole('heading', { level: 2 }).textContent()) ?? '';
  const notion = notionOfStem(stem);
  const right = notion.studied && notion.label !== MISSED_NOTION;
  const option = page.getByRole('radio', {
    name: `${right ? CORRECT_PREFIX : WRONG_PREFIX} sur ${notion.label}`,
  });
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/answers/${String(position)}`),
  );
  await option.click();
  expect((await saved).status(), `réponse ${String(position)} enregistrée`).toBe(200);
  await expect(option).toHaveAttribute('aria-checked', 'true');
  return notion.label;
}

/** Full-page evidence of any tab of the journey (the reconnected tab is not the fixture page). */
async function capture(target: Page, name: string): Promise<void> {
  const file = test.info().outputPath(`${name}.png`);
  await target.screenshot({ path: file, fullPage: true });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

async function readAttempt(page: Page, attemptId: string): Promise<AttemptView> {
  const response = await page.request.get(`/api/v1/mock-exams/${attemptId}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as AttemptView;
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
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

test('examen blanc : format, épreuve sans aide, reprise sans gain de temps, diagnostic @SPEC-807 @SPEC-614 @SPEC-615', async ({
  page,
  context,
}) => {
  const seed = await seedMockExamJourney(session.userId);
  const introUrl = `/formations/${seed.formationId}/examen-blanc`;

  // 1. Introduction — the format extracted from the guide is only proposed.
  await page.goto(introUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Examen blanc' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('exam-format-questions')).toHaveText(String(TOTAL));
  await expect(page.getByTestId('exam-format-duration')).toHaveText(
    `${String(GUIDE_FORMAT.durationMin)} min`,
  );
  await expect(page.getByTestId('exam-format-threshold')).toHaveText(
    `${String(GUIDE_FORMAT.threshold)} %`,
  );
  await expect(page.getByText(/Confirmez ce format proposé depuis votre guide/)).toBeVisible();
  // BR-PRA-05 — the planning already carries the next mock exams of the formation.
  await expect(page.getByText(/^Prochains examens blancs : .+ et .+\.$/)).toBeVisible();
  const start = page.getByRole('button', { name: "Commencer l'examen" });
  await expect(start).toBeDisabled();
  expect(await readExamAttempts(seed.formationId)).toEqual([]);
  await capture(page, 'examen-format-propose');

  // 2. Confirmation of the format, then start.
  await page.getByRole('button', { name: 'Confirmer le format' }).click();
  await expect(page.getByRole('button', { name: 'Confirmer le format' })).toHaveCount(0);
  await expect(page.getByText(/Confirmez ce format proposé/)).toHaveCount(0);
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page).toHaveURL(new RegExp(`/examen-blanc/[0-9a-f-]{36}$`), { timeout: 30_000 });
  const attemptId = page.url().split('/').at(-1) ?? '';
  await expect(page.getByRole('timer')).toHaveAttribute(
    'aria-label',
    `Temps restant : ${String(GUIDE_FORMAT.durationMin)} minutes`,
  );
  await expect(page.getByText(`0 répondue sur ${String(TOTAL)}`)).toBeVisible();
  // Sans aide (BR-PRA-03): no application menu, tutor or course during the exam.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /tuteur|cours/i })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Questions' })).toBeVisible();

  // ET-4 — the server fixed the absolute deadline once: frozen now + official duration.
  const started = await readAttempt(page, attemptId);
  expect(started.status).toBe('in_progress');
  expect(started.deadlineAt).toMatch(DEADLINE_AT_START);
  expect(started.remainingSeconds).toBe(GUIDE_FORMAT.durationMin * 60);
  expect(started.serverTime).toMatch(/^2026-11-11T12:20:00(\.000)?Z$/);

  // 3. Answers 1–3, the third one marked « à revoir ».
  const played: string[] = [];
  for (let position = 1; position <= 3; position += 1) {
    played.push(await answerCurrent(page, position));
    if (position < 3) await page.getByRole('button', { name: 'Suivante', exact: true }).click();
  }
  const markSaved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().endsWith('/marks/3'),
  );
  await page.getByRole('button', { name: 'Marquer pour revoir' }).click();
  expect((await markSaved).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Ne plus marquer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(`3 répondues sur ${String(TOTAL)} · 1 à revoir`)).toBeVisible();
  await capture(page, 'examen-avant-interruption');

  // 4. Interruption: the tab is closed and AWAY_MINUTES pass on the server clock.
  await page.close();
  await elapseExamMinutes(attemptId, AWAY_MINUTES);

  // 5. Reconnection in a new tab whose device clock is one hour behind, through the intro.
  const resumed = await context.newPage();
  await resumed.clock.setFixedTime(REWOUND_DEVICE_TIME);
  await resumed.goto(introUrl);
  // The confirmation is persisted: the format is no longer proposed, the start is open.
  await expect(resumed.getByRole('button', { name: 'Confirmer le format' })).toHaveCount(0);
  await resumed.getByRole('button', { name: "Commencer l'examen" }).click();
  // The start resumes the in-progress attempt instead of opening a fresh one with a new delay.
  await expect(resumed).toHaveURL(new RegExp(`/examen-blanc/${attemptId}$`), { timeout: 30_000 });
  const remainingAfter = GUIDE_FORMAT.durationMin - AWAY_MINUTES;
  await expect(resumed.getByRole('timer')).toHaveAttribute(
    'aria-label',
    `Temps restant : ${String(remainingAfter)} minutes`,
  );
  const reconnected = await readAttempt(resumed, attemptId);
  expect(reconnected.deadlineAt).toMatch(DEADLINE_AFTER_AWAY);
  expect(reconnected.remainingSeconds).toBe(remainingAfter * 60);
  expect(reconnected.remainingSeconds).toBeLessThan(started.remainingSeconds);
  expect(reconnected.answeredCount).toBe(3);
  expect(reconnected.markedCount).toBe(1);
  const persisted = await readExamAttempts(seed.formationId);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({ id: attemptId, status: 'in_progress' });
  expect(persisted[0]?.deadlineAt).toMatch(DEADLINE_AFTER_AWAY);

  // Answers and marks are restored on the server side.
  await expect(resumed.getByText(`3 répondues sur ${String(TOTAL)} · 1 à revoir`)).toBeVisible();
  await expect(resumed.getByRole('button', { name: 'Question 1, répondue' })).toBeVisible();
  await expect(
    resumed.getByRole('button', { name: 'Question 3, répondue, à revoir' }),
  ).toBeVisible();
  await expect(resumed.getByRole('button', { name: 'Question 4, sans réponse' })).toBeVisible();
  await capture(resumed, 'examen-apres-reprise');

  // 6. Remaining answers, reached from the question palette.
  await resumed.getByRole('button', { name: 'Question 4, sans réponse' }).click();
  for (let position = 4; position <= TOTAL; position += 1) {
    played.push(await answerCurrent(resumed, position));
    if (position < TOTAL) {
      await resumed.getByRole('button', { name: 'Suivante', exact: true }).click();
    }
  }
  expect(new Set(played).size).toBe(TOTAL);
  await expect(
    resumed.getByText(`${String(TOTAL)} répondues sur ${String(TOTAL)} · 1 à revoir`),
  ).toBeVisible();

  // 7. Submission with one confirmation.
  await resumed.getByRole('button', { name: "Terminer l'examen" }).click();
  const dialog = resumed.getByRole('alertdialog', { name: "Terminer l'examen ?" });
  await expect(dialog).toContainText(
    `Toutes les questions ont une réponse et 1 marquée pour revoir. Il vous reste ${String(remainingAfter)} min.`,
  );
  const submitted = resumed.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/submit'),
  );
  const resultRead = resumed.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().endsWith('/result'),
  );
  await dialog.getByRole('button', { name: 'Terminer', exact: true }).click();
  expect((await submitted).status()).toBe(200);
  expect((await resultRead).status()).toBe(200);

  // 8. Diagnostic result: studied and diagnostic scores separated, gap, plan.
  await expect(
    resumed.getByRole('heading', { level: 1, name: "Résultats de l'examen blanc" }),
  ).toBeVisible({ timeout: 30_000 });
  // Time used is measured from the server instants: the interruption counts.
  await expect(
    resumed.getByText(
      `Terminé en ${String(AWAY_MINUTES)} min sur ${String(GUIDE_FORMAT.durationMin)} · ${String(TOTAL)} réponses sur ${String(TOTAL)}`,
    ),
  ).toBeVisible();
  // 3 correct of 8 → 38 %; studied 3/4 → 75 %; diagnostic 0/4 → 0 %.
  await expect(resumed.getByTestId('exam-result-score')).toHaveText('38 %');
  await expect(
    resumed.getByText(`Sous le seuil de ${String(GUIDE_FORMAT.threshold)} %`),
  ).toBeVisible();
  await expect(resumed.getByTestId('exam-result-studied')).toHaveText('75 %');
  await expect(resumed.getByTestId('exam-result-diagnostic')).toHaveText('0 %');
  await expect(resumed.getByText('Modules étudiés · 1 à 2')).toBeVisible();
  await expect(resumed.getByText('Diagnostic · 3 à 4')).toBeVisible();
  const gaps = resumed.getByRole('region', { name: 'Erreurs sur les modules étudiés · 1' });
  await expect(gaps).toContainText(`${MISSED_NOTION} · Structure organisationnelle`);
  // Diagnostic failures are never reported as gaps (BR-PRA-04).
  for (const label of MODULES.filter((entry) => !entry.studied).flatMap((entry) => entry.notions)) {
    await expect(gaps).not.toContainText(label);
  }
  const plan = resumed.getByRole('heading', { name: 'Ce que le tuteur prévoit' }).locator('..');
  await expect(plan.getByRole('listitem')).toHaveText([
    '1 notion ajoutée en priorité dans vos prochains quiz globaux.',
    'Un sprint de révision sera proposé avant le prochain quiz de validation de les modules 1 à 2.',
    'Les modules diagnostiques seront travaillés dans l’ordre du programme, sans pénaliser les modules 1 à 2.',
  ]);
  await capture(resumed, 'examen-resultat-diagnostique');

  // Review of the errors: the missed studied notion and the four diagnostic questions.
  await resumed.getByRole('button', { name: 'Revoir mes réponses' }).click();
  const review = resumed.getByRole('region', { name: 'Vos réponses' });
  await expect(review.getByRole('listitem')).toHaveCount(TOTAL);
  await review.getByRole('button', { name: 'Erreurs seulement' }).click();
  await expect(review.getByRole('listitem')).toHaveCount(5);
  await expect(
    review.getByRole('listitem').filter({ hasText: questionStem(MISSED_NOTION) }),
  ).toContainText(`Bonne réponse : ${CORRECT_PREFIX} sur ${MISSED_NOTION}`);

  // A single graded attempt; reopening it shows the same result (no second submission).
  const graded = await readExamAttempts(seed.formationId);
  expect(graded).toHaveLength(1);
  expect(graded[0]).toMatchObject({ id: attemptId, status: 'graded' });
  await resumed.reload();
  await expect(resumed.getByTestId('exam-result-score')).toHaveText('38 %', { timeout: 30_000 });

  // 9. The gap is carried to « Mes lacunes ».
  await resumed.getByRole('link', { name: 'Voir Mes lacunes' }).click();
  await expect(resumed).toHaveURL(new RegExp(`/formations/${seed.formationId}/lacunes$`));
  await expect(resumed.getByRole('heading', { level: 1, name: 'Mes lacunes' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(resumed.getByTestId('gap-card').filter({ hasText: MISSED_NOTION })).toHaveCount(1);
  await capture(resumed, 'examen-lacunes');
});
