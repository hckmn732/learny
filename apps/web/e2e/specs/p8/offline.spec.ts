// Offline mode end-to-end (SPEC-801 §12, CA-2 to CA-7): the production build really registers the
// service worker, the pack is stored in IndexedDB, a session is played without network, the queue
// is synchronised on the return of the network and the device data is purged on sign-out.
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
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

async function openOnline(page: import('@playwright/test').Page): Promise<StoredPackSummary[]> {
  await page.goto('/accueil');
  await waitForServiceWorker(page);
  await page.reload();
  await expect
    .poll(async () => (await packsInPage(page)).length, { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  return packsInPage(page);
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
  await page.getByTestId('matching-left-1').click();
  await page.getByTestId('matching-right-1').click();
  await page.getByTestId('matching-verify').click();
  await expect(page.getByTestId('offline-pending-count')).toHaveText('2 en attente');
}

test.beforeAll(async () => {
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3152' })),
  );
});

test.afterAll(async () => {
  await restoreDemoData();
});

test('installable et précharge les révisions @SPEC-801 @chromium-only', async ({ page }) => {
  const packs = await openOnline(page);
  expect(packs).toHaveLength(2);
  expect(packs.every((pack) => pack.items.length >= 0)).toBe(true);
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
}) => {
  await openOnline(page);
  await context.setOffline(true);
  await page.goto(QUIZ);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toContainText('Mode hors ligne');
  await axeCheck();

  await playRecall(page);
  await playMatching(page);
  await captureEvidence('offline-quiz');

  // Any other navigation falls back to the public offline page.
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
  await axeCheck();
  await expect(page.getByTestId('offline-packs')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('2 réponses synchronisées.')).toBeVisible({ timeout: 15000 });

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
}) => {
  const packs = await openOnline(page);
  const sap = packs.find((pack) => pack.formationId === SAP);
  if (sap?.sessionId === null || sap?.sessionId === undefined) {
    throw new Error('session SAP absente du paquet');
  }
  const answer = await page.request.post(`/api/v1/review-sessions/${sap.sessionId}/answers`, {
    data: {
      position: 0,
      clientAnswerId: crypto.randomUUID(),
      timeMs: 1200,
      response: { selfRating: 'good' },
    },
  });
  expect(answer.status()).toBe(200);

  await context.setOffline(true);
  await page.goto(QUIZ);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await page.getByTestId('gq-rail-item-1').click();
  await playRecall(page);
  await axeCheck();

  await context.setOffline(false);
  await page.goto('/hors-ligne');
  await expect(
    page.getByText(
      'Certaines réponses avaient déjà été enregistrées sur un autre appareil : la version du serveur est conservée.',
    ),
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
