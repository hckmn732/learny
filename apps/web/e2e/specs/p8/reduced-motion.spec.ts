// SPEC-803 EF-6, CA-5 — with `prefers-reduced-motion: reduce`, no transition or animation survives
// on the tutor panel, the recall card, the navigation menu and the notion map.
import type { Page } from '@playwright/test';

import { closeDb } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoChapterId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const MODULE = demoModuleId('sap', 1);
const CHAPTER = demoChapterId('sap', 1, 1);

let session: TestSession;

test.use({ reducedMotion: 'reduce' });
test.setTimeout(120_000);

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.afterAll(async () => {
  await restoreDemoData();
  await closeDb();
});

async function motionOffenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      for (const [property, value] of [
        ['transition-duration', style.transitionDuration],
        ['animation-duration', style.animationDuration],
      ] as const) {
        for (const part of value.split(',')) {
          const duration = Number.parseFloat(part.trim());
          if (duration > 0) {
            offenders.push(
              `${element.tagName.toLowerCase()}${element.getAttribute('data-testid') === null ? '' : `[${element.getAttribute('data-testid') ?? ''}]`} ${property}=${part.trim()}`,
            );
          }
        }
      }
    }
    return [...new Set(offenders)].slice(0, 10);
  });
}

test('mouvement réduit @SPEC-803', async ({ page, context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );

  await page.goto(
    `/formations/${SAP}/modules/${MODULE}/cours?chapitre=${CHAPTER}`,
  );
  await page.getByTestId('tutor-open').click();
  await expect(page.getByTestId('tutor-panel')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () =>
      page
        .getByTestId('tutor-panel')
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toMatch(/^0s(, 0s)*$/);
  expect(await motionOffenders(page)).toEqual([]);

  await page.goto(`/formations/${SAP}/quiz-global`);
  await expect(page.getByTestId('recall-card-flip')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('recall-card-flip').click();
  await expect
    .poll(async () =>
      page
        .getByTestId('recall-card-back')
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toMatch(/^0s(, 0s)*$/);
  expect(await motionOffenders(page)).toEqual([]);

  await page.goto(`/formations/${SAP}/carte`);
  await expect(page.getByTestId('graph-node').first()).toBeVisible({ timeout: 30_000 });
  expect(await motionOffenders(page)).toEqual([]);
});
