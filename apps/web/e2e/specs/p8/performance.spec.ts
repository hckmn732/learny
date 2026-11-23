import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const IIFE = path.join(ROOT, 'node_modules', 'web-vitals', 'dist', 'web-vitals.attribution.iife.js');

let session: TestSession | null = null;

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await closeDb();
});

async function useDemoUser(
  context: import('@playwright/test').BrowserContext,
  baseURL: string | undefined,
  page: import('@playwright/test').Page,
): Promise<void> {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await page.clock.setFixedTime(NOW);
}

test('vitals de l’accueil sans régression @SPEC-804', async ({ page, context, baseURL }) => {
  await useDemoUser(context, baseURL, page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await context.addInitScript({ path: IIFE });
  await context.addInitScript(() => {
    const target = window as unknown as {
      __lcp?: number;
      __cls?: number;
      webVitals?: {
        onLCP: (cb: (metric: { value: number }) => void, options: { reportAllChanges: boolean }) => void;
        onCLS: (cb: (metric: { value: number }) => void, options: { reportAllChanges: boolean }) => void;
      };
    };
    target.webVitals?.onLCP((metric) => {
      target.__lcp = metric.value;
    }, { reportAllChanges: true });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last !== undefined) target.__lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    target.webVitals?.onCLS((metric) => {
      target.__cls = metric.value;
    }, { reportAllChanges: true });
  });

  await page.goto('/accueil');
  await expect(page).toHaveURL(/\/accueil$/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const vitals = await page.evaluate(() => {
    const target = window as unknown as { __lcp?: number; __cls?: number };
    const shifts = performance
      .getEntriesByType('layout-shift')
      .reduce((sum, entry) => {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        return shift.hadRecentInput === true ? sum : sum + (shift.value ?? 0);
      }, 0);
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lastLcp = lcpEntries[lcpEntries.length - 1];
    const lcpFallback = lastLcp === undefined ? null : lastLcp.startTime;
    return {
      lcp: target.__lcp ?? lcpFallback,
      cls: target.__cls ?? shifts,
    };
  });
  expect(vitals.cls).toBeLessThan(0.1);
  expect(vitals.lcp).not.toBeNull();

  // Les modules différés (carte, tuteur, jeux) ne sont pas demandés par l'accueil.
  const deferred = requests.filter((url) =>
    /\/carte|\/tutor|notion-graph|global-quiz\/games/.test(url),
  );
  expect(deferred).toEqual([]);
});

