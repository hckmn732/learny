// Offline mode end-to-end (SPEC-801 §12, CA-2 to CA-7): the production build really registers the
// service worker, the pack is stored in IndexedDB, a session is played without network, the queue
// is synchronised on the return of the network and the device data is purged on sign-out.
import { serviceDb, sql } from '@learny/testing/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/testing/db-factories';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const QUIZ = `/formations/${SAP}/quiz-global`;

let session: TestSession;

interface StoredPackSummary {
  formationId: string;
  sessionId: string | null;
  notionCount: number;
  items: { position: number; state: string }[];
}

async function waitForServiceWorker(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

async function packsInPage(page: import('@playwright/test').Page): Promise<StoredPackSummary[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('learny-offline', 1);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
    const packs = await new Promise<StoredPackSummary[]>((resolve, reject) => {
      const tx = db.transaction('packs', 'readonly');
      const request = tx.objectStore('packs').getAll();
      request.onsuccess = () => {
        resolve(
          (request.result as {
            formationId: string;
            session: {
              sessionId: string | null;
              header: { notionCount: number };
              items: { position: number; state: string }[];
            };
          }[]).map((pack) => ({
            formationId: pack.formationId,
            sessionId: pack.session.sessionId,
            notionCount: pack.session.header.notionCount,
            items: pack.session.items,
          })),
        );
      };
      request.onerror = () => {
        reject(request.error ?? new Error('packs'));
      };
    });
    db.close();
    return packs;
  });
}

async function openOnline(
  page: import('@playwright/test').Page,
): Promise<{ packs: StoredPackSummary[]; preloadMs: number }> {
  const started = performance.now();
  await page.goto('/accueil');
  await waitForServiceWorker(page);
  await page.reload();
  await expect
    .poll(async () => (await packsInPage(page)).length, { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  return { packs: await packsInPage(page), preloadMs: Math.round(performance.now() - started) };
}

async function countReviewLogs(): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.review_logs
    where user_id = ${demoUserId('alex')}::uuid
  `);
  return rows[0]?.count ?? 0;
}

// The shared demonstration database is not reset between the files of a campaign: the preceding
// scenario answers the only SAP recall card. The conflict scenario needs a fresh position, so it
// drops the answers of Alex's SAP global-quiz attempts (the other tables keep their history).
async function clearSapAnswers(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.answers
    where attempt_id in (
      select attempt.id
      from public.attempts attempt
      join public.activities activity on activity.id = attempt.activity_id
      where attempt.user_id = ${demoUserId('alex')}::uuid
        and activity.formation_id = ${SAP}::uuid
        and activity.kind = 'global_quiz_session'
    )
  `);
}

async function openGame(
  page: import('@playwright/test').Page,
  testId: string,
): Promise<boolean> {
  if ((await page.getByTestId(testId).count()) > 0) return true;
  const rail = page.locator('[data-testid^="gq-rail-item-"]');
  const total = await rail.count();
  for (let index = 0; index < total; index += 1) {
    await rail.nth(index).click();
    if ((await page.getByTestId(testId).count()) > 0) return true;
  }
  return false;
}

async function playRecall(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('gq-recall')).toBeVisible();
  await page.getByTestId('recall-card-flip').click();
  await page.getByTestId('recall-grade-good').click();
  await expect(page.getByTestId('offline-pending-count')).toHaveText('1 en attente');
}

async function playMatching(page: import('@playwright/test').Page): Promise<void> {
  expect(await openGame(page, 'game-matching')).toBe(true);
  const lefts = page.locator('[data-testid^="matching-left-"]');
  const total = await lefts.count();
  for (let index = 1; index <= total; index += 1) {
    await page.getByTestId(`matching-left-${String(index)}`).click();
    await page.getByTestId(`matching-right-${String(index)}`).click();
  }
  await page.getByTestId('matching-verify').click();
  await expect(page.getByTestId('offline-pending-count')).toHaveText('2 en attente');
}

test.beforeEach(async ({ context, baseURL }) => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3152' })),
  );
});

test.afterAll(async () => {
  await restoreDemoData();
});

test('installable et précharge les révisions @SPEC-801 @chromium-only', async (
  { page },
  testInfo,
) => {
  const { packs, preloadMs } = await openOnline(page);
  expect(packs).toHaveLength(2);
  expect(packs.every((pack) => pack.items.length >= 0)).toBe(true);
  const packJson = await page.evaluate(async () => {
    const response = await fetch('/api/v1/offline/pack');
    return response.text();
  });
  await testInfo.attach('offline-pack.json', {
    body: packJson,
    contentType: 'application/json',
  });
  await testInfo.attach('offline-measures.json', {
    body: JSON.stringify({
      preloadMs,
      packBytes: new TextEncoder().encode(packJson).length,
      packCount: packs.length,
    }),
    contentType: 'application/json',
  });
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return (await response.json()) as Record<string, unknown>;
  });
  expect(manifest).toMatchObject({
    name: 'Learny',
    short_name: 'Learny',
    start_url: '/accueil?source=pwa',
    display: 'standalone',
  });
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, active: ready.active?.state ?? null };
  });
  expect(registration.scope).toContain('/');
  expect(registration.active).toBe('activated');
  const sap = packs.find((pack) => pack.formationId === SAP);
  expect(sap?.notionCount).toBe(14);
});

test('révise hors ligne puis synchronise @SPEC-801 @chromium-only', async ({
  page,
  context,
  axeCheck,
  captureEvidence,
  baseURL,
}, testInfo) => {
  const origin = baseURL ?? 'http://127.0.0.1:3152';
  await openOnline(page);
  const reviewLogsBefore = await countReviewLogs();
  await context.setOffline(true);
  await page.goto(QUIZ);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toContainText('Mode hors ligne');
  await axeCheck();

  await playRecall(page);
  await playMatching(page);
  await captureEvidence('offline-quiz');
  const queued = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('learny-offline', 1);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
    const entries = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly');
      const request = tx.objectStore('queue').getAll();
      request.onsuccess = () => {
        resolve(request.result as Record<string, unknown>[]);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('queue'));
      };
    });
    db.close();
    return entries.map((entry) => {
      const {
        clientId,
        kind,
        formationId,
        sessionId,
        position,
        brickVersionId,
        skipped,
        response,
        timeMs,
        selfGrade,
        answeredAt,
      } = entry;
      return {
        clientId,
        kind,
        formationId,
        sessionId,
        ...(position === undefined ? {} : { position }),
        ...(brickVersionId === undefined ? {} : { brickVersionId }),
        ...(skipped === undefined ? {} : { skipped }),
        ...(response === undefined ? {} : { response }),
        ...(timeMs === undefined ? {} : { timeMs }),
        ...(selfGrade === undefined ? {} : { selfGrade }),
        answeredAt,
      };
    });
  });

  // Any other navigation falls back to the public offline page.
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
  await axeCheck();
  await expect(page.getByTestId('offline-packs')).toBeVisible();

  await context.setOffline(false);
  await expect(
    page.getByText('2 réponses synchronisées.').first(),
  ).toBeVisible({ timeout: 15000 });
  const reviewLogsAfterSync = await countReviewLogs();
  const replay = await page.request.post('/api/v1/sync/offline-answers', {
    headers: { origin },
    data: { entries: queued },
  });
  expect(replay.status()).toBe(200);
  const replayBody = (await replay.json()) as { results: { status: string }[] };
  expect(replayBody.results.map((result) => result.status)).toEqual(['duplicate', 'duplicate']);
  const reviewLogsAfterReplay = await countReviewLogs();
  expect(reviewLogsAfterReplay).toBe(reviewLogsAfterSync);
  await testInfo.attach('offline-measures.json', {
    body: JSON.stringify({
      reviewLogsBefore,
      reviewLogsAfterSync,
      reviewLogsAfterReplay,
      queued: queued.length,
    }),
    contentType: 'application/json',
  });

  const today = await page.request.get(`/api/v1/formations/${SAP}/global-quiz/today`);
  expect(today.status()).toBe(200);
  const dto = (await today.json()) as {
    items: { position: number; state: string }[];
  };
  expect(dto.items.filter((item) => item.state === 'answered').length).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('offline-indicator')).toHaveCount(0);
});

test('conflit et déconnexion @SPEC-801 @chromium-only', async ({
  page,
  context,
  axeCheck,
  baseURL,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3152';
  await clearSapAnswers();
  const { packs } = await openOnline(page);
  // The preceding scenario already answered the only SAP recall card in the shared demonstration
  // data; its answers were dropped so the position is fresh again.
  const target = packs.find((pack) => pack.formationId === SAP);
  if (target?.sessionId === null || target?.sessionId === undefined) {
    throw new Error('session SAP absente du paquet');
  }
  const today = await page.request.get(
    `/api/v1/formations/${target.formationId}/global-quiz/today`,
    { headers: { origin } },
  );
  expect(today.status()).toBe(200);
  const dto = (await today.json()) as {
    items: { position: number; type: string; state: string }[];
  };
  const recall = dto.items.find((item) => item.type === 'recall_card' && item.state !== 'answered');
  if (recall === undefined) throw new Error('carte de rappel non répondue absente');
  const answer = await page.request.post(`/api/v1/review-sessions/${target.sessionId}/answers`, {
    headers: { origin },
    data: {
      position: recall.position,
      clientAnswerId: crypto.randomUUID(),
      timeMs: 1200,
      response: { selfRating: 'good' },
    },
  });
  expect(answer.status()).toBe(200);

  await context.setOffline(true);
  await page.goto(`/formations/${target.formationId}/quiz-global`);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await page.getByTestId(`gq-rail-item-${String(recall.position + 1)}`).click();
  await playRecall(page);
  await axeCheck();

  await context.setOffline(false);
  await page.goto('/hors-ligne');
  await expect(
    page
      .getByText(
        'Certaines réponses avaient déjà été enregistrées sur un autre appareil : la version du serveur est conservée.',
      )
      .first(),
  ).toBeVisible({ timeout: 15000 });

  await page.goto('/accueil');
  await page.getByTestId('header-account-trigger').click();
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/connexion/u);
  const remaining = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.map((database) => database.name ?? '');
  });
  expect(remaining).not.toContain('learny-offline');
  const caches = await page.evaluate(async () => globalThis.caches.keys());
  expect(caches.every((key) => !/api|learny-images|learny-fonts/u.test(key))).toBe(true);
});
