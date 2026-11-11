// Playwright fixtures shared by every e2e test (SPEC-004, ET-2).
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

import { FIXED_TIME_ISO } from './clock';
import { assertMockLlm } from './env';

export interface LearnyFixtures {
  /** Instant frozen on the page; set automatically before each test. */
  fixedTime: Date;
  /** Console errors of the page, collected during the test. */
  consoleErrors: string[];
  /** Runs axe and fails on any serious or critical violation. */
  axeCheck: (page?: Page) => Promise<void>;
  /** Attaches a full-page capture under a stable name (copied to evidence/). */
  captureEvidence: (name: string) => Promise<void>;
}

async function axeCheck(page: Page, testInfo: TestInfo): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  await testInfo.attach('axe', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  expect(
    blocking.map((v) => `${v.id} (${v.impact ?? ''}) : ${v.help}`),
    'violations axe serious/critical',
  ).toEqual([]);
}

// Fixture callbacks name their second argument `provide` (Playwright's `use`) so that the
// React hooks lint rule does not mistake it for a hook.
export const test = base.extend<LearnyFixtures>({
  fixedTime: [
    async ({ page }, provide) => {
      assertMockLlm();
      const at = new Date(FIXED_TIME_ISO);
      await page.clock.setFixedTime(at);
      await provide(at);
    },
    { auto: true },
  ],
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await provide(errors);
  },
  axeCheck: async ({ page }, provide, testInfo) => {
    await provide((target = page) => axeCheck(target, testInfo));
  },
  captureEvidence: async ({ page }, provide, testInfo) => {
    await provide(async (name) => {
      await testInfo.attach(name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  },
});

/** The server-rendered instant must match the page clock (fixed on both sides). */
export async function expectServerTimeMatchesPage(page: Page, serverIso: string): Promise<void> {
  // The browser clock is frozen by page.clock: reading it is the point of this check.
  // eslint-disable-next-line no-restricted-syntax
  const pageIso = await page.evaluate(() => new Date().toISOString());
  expect(new Date(serverIso).toISOString(), 'heure serveur').toBe(pageIso);
}

export { expect };
