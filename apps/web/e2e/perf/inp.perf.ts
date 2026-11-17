// Mesure de l'INP des interactions principales (SPEC-804 EF-3, ADR-0202). Exécuté uniquement par
// `pnpm test:perf` (projet Playwright `perf`, PW_PERF=1) : 6 scénarios × 5 passages, CPU ×4 et
// réseau 150 ms / 1,6 Mbit/s, `web-vitals` onINP avec reportAllChanges.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { DEMO_USERS, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const NOW = new Date('2026-11-11T12:20:00Z');
const PASSES = 5;
const BUDGET = 200;

// Five passes under CPU x4 and a 1.6 Mbit/s network take several minutes per scenario.
test.setTimeout(10 * 60_000);
const IIFE = path.join(
  ROOT,
  'node_modules',
  'web-vitals',
  'dist',
  'web-vitals.attribution.iife.js',
);
const FORMATION = demoFormationId('sap');
const MODULE = demoModuleId('sap', 3);
const ALEX = DEMO_USERS.find((user) => user.key === 'alex');

interface Scenario {
  name: string;
  url: string;
  run: (page: Page) => Promise<void>;
}

interface ScenarioResult {
  name: string;
  values: number[];
  p75: number | null;
  ok: boolean;
}

const scenarios: Scenario[] = [
  {
    name: 'accueil → panneau des notifications',
    url: '/accueil',
    run: async (page) => {
      await page.getByTestId('header-notifications').click();
      await page.getByTestId('notification-panel').waitFor();
    },
  },
  {
    name: 'quiz global → carte de rappel puis Bon',
    url: `/formations/${FORMATION}/quiz-global`,
    run: async (page) => {
      await page.getByTestId('recall-card-flip').click();
      await page.getByTestId('recall-grade-good').click();
    },
  },
  {
    name: 'quiz de validation → option puis Vérifier',
    url: `/formations/${FORMATION}/modules/${MODULE}/quiz`,
    run: async (page) => {
      await page.locator('[data-testid^="quiz-option-"]').first().click();
      await page.getByTestId('quiz-check').click();
    },
  },
  {
    name: 'carte des notions → saisir clé puis Entrée',
    url: `/formations/${FORMATION}/carte`,
    run: async (page) => {
      await page.getByTestId('graph-search').fill('clé');
      await page.getByTestId('graph-search').press('Enter');
    },
  },
  {
    name: 'paramètres → onglet Notifications puis interrupteur',
    url: '/parametres#notifications',
    run: async (page) => {
      await page.getByTestId('weekend-rule-switch').click();
    },
  },
  {
    name: 'agenda → Semaine vers Mois',
    url: '/agenda?vue=semaine&date=2026-11-11',
    run: async (page) => {
      await page.getByTestId('agenda-view-mois').click();
    },
  },
];

let session: TestSession;

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

async function measure(page: Page, scenario: Scenario): Promise<number | null> {
  await page.goto(scenario.url);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const target = window as unknown as { __inpValues?: number[] };
    target.__inpValues = [];
  });
  await scenario.run(page);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const values = (window as unknown as { __inpValues?: number[] }).__inpValues ?? [];
    return values.length === 0 ? null : Math.max(...values);
  });
}

const results: ScenarioResult[] = [];

test.afterAll(() => {
  const p75 = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(1, Math.ceil(0.75 * sorted.length)) - 1] ?? null;
  };
  const scenariosWithP75 = results.map((result) => ({
    ...result,
    p75: p75(result.values),
  }));
  const payload = {
    ok: scenariosWithP75.every((result) => result.p75 !== null && result.p75 < BUDGET),
    scenarios: scenariosWithP75,
  };
  fs.mkdirSync(path.join(ROOT, 'test-results', 'perf'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'test-results', 'perf', 'inp.json'),
    JSON.stringify(payload, null, 2),
  );
});

test.beforeAll(async () => {
  if (ALEX === undefined) throw new Error('utilisateur de démonstration Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await context.addInitScript({ path: IIFE });
  await context.addInitScript(() => {
    const target = window as unknown as {
      __inpValues?: number[];
      webVitals?: {
        onINP: (
          cb: (metric: { value: number }) => void,
          options: { reportAllChanges: boolean },
        ) => void;
      };
    };
    target.__inpValues = [];
    target.webVitals?.onINP((metric) => target.__inpValues?.push(metric.value), {
      reportAllChanges: true,
    });
  });
});

for (const scenario of scenarios) {
  test(`INP — ${scenario.name}`, async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await throttle(page);
    const values: number[] = [];
    for (let pass = 0; pass < PASSES; pass += 1) {
      const value = await measure(page, scenario);
      if (value !== null) values.push(value);
    }
    expect(values.length).toBeGreaterThan(0);
    results.push({ name: scenario.name, values, p75: null, ok: false });
  });
}
