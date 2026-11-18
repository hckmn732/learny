// SPEC-807 EF-3, CA-2, CL-3 — revisions, offline review and automations, end to end, on an
// isolated learner (ET-2). The declared fixture (`support/review-automations.ts`) writes the
// learner's last reviews four days before the frozen instant: at 2026-11-11T12:20:00Z the notions
// are due, without ever moving the machine clock (ET-1, ADR-0047). Every later state change goes
// through the product: the global quiz screen (online answer, skips, closure), the offline pack
// and queue of the service worker, the settings screen and the automation engine ticked with an
// injectable clock (`createFixedClock`), exactly as the hourly cron would call it.
import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { runAutomation, type AutomationEngineContext } from '@learny/automations';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb } from '@learny/db';
import { createFixedClock } from '@learny/testing/clock';
import { expect, test } from '@learny/testing/playwright';

import {
  NOW_ISO,
  automationActions,
  automationSetting,
  deleteReviewLearner,
  learnerCounters,
  notificationsOf,
  notionState,
  queuedEntries,
  quizUrl,
  reviewLogs,
  seedReviewLearner,
  sentDeliveriesOn,
  signInLearner,
  storedPackFormations,
  todaySession,
  type ReviewLearner,
} from './support/review-automations';

const CAP_MINUTES = 15;

let learner: ReviewLearner | null = null;

test.setTimeout(300_000);

test.beforeEach(async ({ context, baseURL }) => {
  learner = await seedReviewLearner({ prefix: 'sdd-807-review-', bank: 'recall' });
  await signInLearner(context, learner, baseURL);
});

test.afterEach(async () => {
  await deleteReviewLearner(learner);
  learner = null;
});

test.afterAll(async () => {
  await closeDb();
});

/** Engine context of a cron tick at `iso` (injectable clock, never the system time). */
function engineAt(iso: string): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock: createFixedClock(iso),
    logger: createLogger({ level: 'error' }),
  };
}

function isAnswerPost(url: string, method: string): boolean {
  return method === 'POST' && /\/api\/v1\/review-sessions\/[^/]+\/answers$/u.test(url);
}

/** Skips every remaining game through the screen, then closes the session. */
async function finishSession(page: Page): Promise<void> {
  const next = page.getByTestId('gq-next');
  const skip = page.getByTestId('gq-skip');
  const progress = page.getByTestId('gq-progress-label');
  const closing = async (): Promise<boolean> =>
    (await next.isEnabled()) && (await next.textContent())?.includes('Terminer') === true;
  for (let guard = 0; guard < 60; guard += 1) {
    // Wait for a settled screen: either the game can be skipped or « Suivant » is available.
    await expect(async () => {
      expect((await skip.isEnabled()) || (await next.isEnabled())).toBe(true);
    }).toPass({ timeout: 15_000 });
    if (await skip.isEnabled()) {
      const before = await progress.textContent();
      const answered = page.waitForResponse((response) =>
        isAnswerPost(response.url(), response.request().method()),
      );
      await skip.click();
      expect((await answered).status()).toBe(200);
      // A skip moves to the next game, except on the last one where « Terminer » appears.
      await expect(async () => {
        expect((await progress.textContent()) !== before || (await closing())).toBe(true);
      }).toPass({ timeout: 15_000 });
      continue;
    }
    if (await closing()) break;
    await next.click();
  }
  await expect(next).toHaveText('Terminer la session');
  await next.click();
  await expect(page.getByTestId('gq-end')).toBeVisible({ timeout: 30_000 });
}

test('révisions, hors ligne et automatismes @SPEC-807 @SPEC-701 @SPEC-704 @SPEC-711 @SPEC-713 @SPEC-718 @SPEC-720 @SPEC-801', async ({
  page,
  context,
  axeCheck,
  captureEvidence,
  baseURL,
}, testInfo) => {
  const current = learner;
  if (current === null) throw new Error('apprenant de fixture absent');
  const userId = current.session.userId;
  const origin = baseURL ?? 'http://127.0.0.1:3100';

  await test.step('le paquet hors ligne du jour est préchargé (SPEC-801)', async () => {
    await page.goto('/accueil');
    await expect(page).toHaveURL(/\/accueil$/u);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(async () => storedPackFormations(page), { timeout: 30_000 })
      .toContain(current.formationId);
  });

  const session = await todaySession(userId);
  if (session === null) throw new Error('session du jour absente');
  const config = session.config;
  const selected = config.items.reduce((sum, item) => sum + item.notionIds.length, 0);

  await test.step('les notions dues apparaissent, sous le plafond (SPEC-701, SPEC-718)', async () => {
    // 36 notions are due at the frozen instant; the default cap keeps the day under 15 minutes.
    expect(config.mode).toBe('full');
    expect(config.dueCount).toBe(current.notionIds.length);
    expect(config.capMinutes).toBe(CAP_MINUTES);
    expect(config.estimatedSec).toBeLessThanOrEqual(CAP_MINUTES * 60);
    expect(config.deferredCount).toBe(config.dueCount - selected);
    expect(config.deferredCount).toBeGreaterThan(0);

    await page.goto(quizUrl(current));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quiz global');
    await expect(page.getByTestId('gq-header')).toContainText(current.formationTitle);
    await expect(page.getByTestId('gq-pill-notions')).toHaveText(`${String(selected)} notions`);
    await expect(page.getByTestId('gq-rail').getByRole('button')).toHaveCount(config.items.length);
    await expect(page.getByTestId('gq-progress-label')).toHaveText(
      `Jeu 1 sur ${String(config.items.length)}`,
    );
    await expect(page.getByTestId('review-cap')).toHaveText(
      `Durée maximale : ${String(CAP_MINUTES)} min par jour.`,
    );
    await expect(page.getByTestId('review-deferred')).toContainText('reportées à jeudi');

    // The `plafond_quiz` automation journaled the smoothing once, without consent (BR-AUT-07).
    const smoothing = (await automationActions(userId)).filter(
      (action) => action.automation === 'plafond_quiz',
    );
    expect(smoothing).toHaveLength(1);
    expect(smoothing[0]).toMatchObject({
      kind: 'quiz_smoothed',
      status: 'applied',
      requires_consent: false,
      summary: `${String(config.dueCount)} notions étaient dues aujourd’hui : ${String(config.deferredCount)} sont reportées à jeudi pour rester sous ${String(CAP_MINUTES)} min.`,
    });
    expect(Number(smoothing[0]?.payload.estimatedMinutes)).toBeLessThanOrEqual(CAP_MINUTES);
    await axeCheck();
    await captureEvidence('spec-807-revisions-quiz');
  });

  const first = config.items[0];
  const second = config.items[1];
  const notionA = first?.notionIds[0];
  const notionB = second?.notionIds[0];
  if (notionA === undefined || notionB === undefined) throw new Error('jeux de la séance absents');

  await test.step('une réponse en ligne met à jour FSRS et la maîtrise (SPEC-701)', async () => {
    const before = await notionState(userId, notionA);
    await expect(page.getByTestId('gq-recall')).toBeVisible();
    await page.getByTestId('recall-card-flip').click();
    await expect(page.getByTestId('recall-card-back')).toBeVisible();
    const answered = page.waitForResponse((response) =>
      isAnswerPost(response.url(), response.request().method()),
    );
    await page.getByTestId('recall-grade-good').click();
    expect((await answered).status()).toBe(200);
    await expect(page.getByTestId('recall-grade-good')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gq-next')).toBeEnabled();

    const after = await notionState(userId, notionA);
    expect(after.reps).toBe(before.reps + 1);
    expect(Date.parse(after.due_at)).toBeGreaterThan(Date.parse(NOW_ISO));
    expect(Date.parse(after.due_at)).toBeGreaterThan(Date.parse(before.due_at));
    expect(Date.parse(after.last_seen_at)).toBe(Date.parse(NOW_ISO));
    expect(after.mastery).not.toBe(before.mastery);
    const logs = await reviewLogs(userId, notionA);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ source: 'global_quiz', grade: 'good' });
  });

  const stateBBefore = await notionState(userId, notionB);
  let queued: Record<string, unknown>[] = [];

  await test.step('une réponse hors ligne est stockée sur l’appareil (SPEC-801)', async () => {
    const before = await learnerCounters(userId);
    await context.setOffline(true);
    await page.goto(quizUrl(current));
    await expect(page.getByTestId('offline-banner')).toContainText('Mode hors ligne');
    await page.getByTestId('gq-rail-item-2').click();
    await expect(page.getByTestId('gq-recall')).toBeVisible();
    await page.getByTestId('recall-card-flip').click();
    await page.getByTestId('recall-grade-good').click();
    await expect(page.getByTestId('offline-pending-count')).toHaveText('1 en attente');
    queued = await queuedEntries(page);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      kind: 'answer',
      formationId: current.formationId,
      sessionId: session.id,
      position: 1,
    });
    // Nothing reached the server while offline.
    expect(await learnerCounters(userId)).toEqual(before);
    expect(await reviewLogs(userId, notionB)).toHaveLength(0);
    await captureEvidence('spec-807-revisions-hors-ligne');
  });

  await test.step('la reconnexion synchronise une seule fois (CL-3)', async () => {
    const before = await learnerCounters(userId);
    await page.goto('/agenda');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
    await context.setOffline(false);
    await expect(page.getByText('1 réponse synchronisée.').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => (await learnerCounters(userId)).receipts, { timeout: 15_000 })
      .toBe(before.receipts + 1);
    const synced = await learnerCounters(userId);
    expect(synced).toMatchObject({
      answers: before.answers + 1,
      reviewLogs: before.reviewLogs + 1,
      streakDays: before.streakDays,
    });
    const logsB = await reviewLogs(userId, notionB);
    expect(logsB).toHaveLength(1);
    expect(logsB[0]).toMatchObject({ source: 'offline', grade: 'good' });
    const stateB = await notionState(userId, notionB);
    expect(stateB.reps).toBe(stateBBefore.reps + 1);
    expect(Date.parse(stateB.due_at)).toBeGreaterThan(Date.parse(NOW_ISO));

    // A replay of the same queue (another tab, a retried background sync) is a duplicate.
    const replay = await page.request.post('/api/v1/sync/offline-answers', {
      headers: { origin },
      data: { entries: queued },
    });
    expect(replay.status()).toBe(200);
    const body = (await replay.json()) as { results: { status: string }[] };
    expect(body.results.map((result) => result.status)).toEqual(['duplicate']);
    // A second network flap runs the client synchronisation again on an empty queue.
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(page.getByTestId('offline-indicator')).toHaveCount(0);
    expect(await learnerCounters(userId)).toEqual(synced);
    expect(await reviewLogs(userId, notionB)).toHaveLength(1);
    expect((await notionState(userId, notionB)).fsrs).toEqual(stateB.fsrs);
    await testInfo.attach('spec-807-sync-counters.json', {
      body: JSON.stringify({ before, synced, replay: body }, null, 2),
      contentType: 'application/json',
    });
  });

  await test.step('la clôture met à jour la série et l’agenda (SPEC-701, SPEC-704)', async () => {
    await page.goto(quizUrl(current));
    await expect(page.getByTestId('gq-rail-item-1')).toContainText('Fait');
    await expect(page.getByTestId('gq-rail-item-2')).toContainText('Fait');
    await finishSession(page);
    await expect(page.getByTestId('gq-end-title')).toContainText(
      `${String(selected)} notions revues`,
    );
    await expect(page.getByTestId('gq-end-ok')).toHaveText('2');
    await expect(page.getByTestId('gq-end-soon')).toHaveText(String(selected - 2));
    // Four qualifying days ending yesterday: the session of today extends the streak once.
    await expect(page.getByTestId('gq-end-streak')).toHaveText('5 j');
    await expect(page.getByTestId('gq-end-next')).toHaveText('Prochaine session : demain, 17:00.');
    expect((await learnerCounters(userId)).streakDays).toBe(5);
    // Offline + online answers were each logged once (no doubled FSRS update).
    expect(await reviewLogs(userId, notionA)).toHaveLength(1);
    expect(await reviewLogs(userId, notionB)).toHaveLength(1);
    await captureEvidence('spec-807-revisions-fin');

    await page.goto('/agenda');
    await expect(
      page.getByRole('button', { name: /^Quiz global du jour, .*Mercredi 11 nov\., Fait$/u }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Quiz global de demain, .*Jeudi 12 nov\., Prévu$/u }),
    ).toBeVisible();
  });

  await test.step('l’apprenant configure ses automatismes (SPEC-711)', async () => {
    await page.goto('/parametres#automatismes');
    // The tab mounts only after hydration: the panel appears well after the first paint.
    await expect(page.getByTestId('automation-panel')).toBeVisible({ timeout: 30_000 });
    const micro = page.getByRole('switch', { name: 'Micro-séance de secours' });
    await expect(micro).toHaveAttribute('aria-checked', 'true');
    await micro.click();
    await expect(micro).toHaveAttribute('aria-checked', 'false');
    await expect
      .poll(async () => (await automationSetting(userId, 'micro_seance'))?.enabled)
      .toBe(false);
    await page.getByTestId('automation-setting-bilan-hour').selectOption('20');
    await expect.poll(async () => (await automationSetting(userId, 'bilan'))?.params.hour).toBe(20);
    await expect(page.getByTestId('automation-guardrail-cap')).toHaveText('5 par jour');
    await expect(page.getByTestId('automation-history')).toContainText(
      `${String(config.deferredCount)} sont reportées à jeudi`,
    );
    await axeCheck();
  });

  await test.step('les automatismes agissent dans leurs garde-fous (SPEC-713, SPEC-720)', async () => {
    // Consent: the micro-session switched off by the learner proposes nothing at 20:05.
    const micro = await runAutomation(engineAt('2026-11-11T19:05:00.000Z'), {
      key: 'micro_seance',
      userId,
      trigger: { type: 'hourly', localHour: 20 },
    });
    if (!micro.ok) throw micro.error;
    expect(micro.value).toMatchObject({ created: 0, skipped: 'disabled' });

    // Configuration: the weekly review is not produced at the default 19:00 any more…
    const atNineteen = await runAutomation(engineAt('2026-11-15T18:05:00.000Z'), {
      key: 'bilan',
      userId,
      trigger: { type: 'hourly', localHour: 19 },
    });
    if (!atNineteen.ok) throw atNineteen.error;
    expect(atNineteen.value.created).toBe(0);
    // …but on Sunday at the chosen 20:00, once, even when the hourly tick is delivered twice.
    const sunday = engineAt('2026-11-15T19:05:00.000Z');
    const weekly = await runAutomation(sunday, {
      key: 'bilan',
      userId,
      trigger: { type: 'hourly', localHour: 20 },
    });
    if (!weekly.ok) throw weekly.error;
    expect(weekly.value.created).toBe(1);
    const replayed = await runAutomation(sunday, {
      key: 'bilan',
      userId,
      trigger: { type: 'hourly', localHour: 20 },
    });
    if (!replayed.ok) throw replayed.error;
    expect(replayed.value).toMatchObject({ created: 0, duplicateIds: weekly.value.actionIds });

    const actions = await automationActions(userId);
    expect(actions.map((action) => `${action.automation}:${action.kind}`).sort()).toEqual([
      'bilan:weekly_review',
      'plafond_quiz:quiz_smoothed',
    ]);
    expect(actions.filter((action) => action.automation === 'micro_seance')).toHaveLength(0);
    // No action needing consent was applied behind the learner's back (BR-AUT-11).
    expect(
      actions.filter(
        (action) => action.requires_consent && ['applied', 'consumed'].includes(action.status),
      ),
    ).toEqual([]);
    const bilanId = weekly.value.actionIds[0] ?? '';
    const notifications = await notificationsOf(userId);
    expect(
      notifications.filter((notification) => notification.dedupe_key === `automation:${bilanId}`),
    ).toHaveLength(1);
    expect(
      notifications.filter((notification) => notification.type === 'weekly_review'),
    ).toHaveLength(1);
    // Notification cap: the external sends of each day stay within the 5 a day of the settings.
    for (const day of ['2026-11-11', '2026-11-15']) {
      expect(await sentDeliveriesOn(userId, day)).toBeLessThanOrEqual(5);
    }

    // The settings screen is already on this exact URL: a `goto` to the same address with the same
    // hash is a same-document navigation, so the journal would be served from the React Query cache
    // built before the engine ticks. Reload to read the journal the server has now.
    await page.goto('/parametres#automatismes');
    await page.reload();
    const history = page.getByTestId('automation-history');
    await expect(history).toContainText('Bilan de la semaine');
    await expect(history).toContainText(`${String(config.deferredCount)} sont reportées à jeudi`);
    await expect(page.getByTestId('automation-last-micro_seance')).not.toContainText(
      'Micro-séance de 5 min',
    );
    await captureEvidence('spec-807-automatismes-journal');
    await axeCheck();
  });
});
