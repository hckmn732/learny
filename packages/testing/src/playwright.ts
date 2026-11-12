// Playwright fixtures shared by every e2e test (SPEC-004, ET-2).
import fs from 'node:fs';

import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

import { blockingAxeViolations, formatAxeViolations, runAxe } from './axe';
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
  /**
   * Network address announced to the test server (`X-Forwarded-For`, trusted there): each test
   * has its own, so the IP-keyed rate-limit buckets of SPEC-208 never run dry between tests.
   */
  clientAddress: string;
}

async function axeCheck(page: Page, testInfo: TestInfo): Promise<void> {
  const violations = await runAxe(page);
  const blocking = blockingAxeViolations(violations);
  const file = testInfo.outputPath(`axe-${String(testInfo.attachments.length)}.json`);
  fs.writeFileSync(file, JSON.stringify(violations, null, 2));
  await testInfo.attach('axe', { path: file, contentType: 'application/json' });
  expect(formatAxeViolations(blocking), 'violations axe serious/critical').toEqual([]);
}

// Fixture callbacks name their second argument `provide` (Playwright's `use`) so that the
// React hooks lint rule does not mistake it for a hook.
export const test = base.extend<LearnyFixtures>({
  clientAddress: [
    async ({ context }, provide) => {
      const octet = () => String(Math.floor(Math.random() * 256));
      const address = `10.${octet()}.${octet()}.${octet()}`;
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': address });
      await provide(address);
    },
    { auto: true },
  ],
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
      // Written to disk so that tools/sdd/evidence.mjs can copy it (attachments need a path).
      const file = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(name, { path: file, contentType: 'image/png' });
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
