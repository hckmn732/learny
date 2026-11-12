import type { BrickFormat, GlobalQuizMode } from '@learny/learning-engine';
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

import {
  DEMO_NOTION_LABELS,
  SESSION_DUE_NOTIONS,
  demoSession,
} from '../../../components/sdd-demos/spec-406-data';

const PAGE = '/_dev/sdd/SPEC-406';
const TITLE = 'SPEC-406 · Tirage de la session de quiz global';
const REGIONS = ['session-inputs', 'session-selected', 'session-deferred', 'session-edge'];
const FORMAT_LABELS: Readonly<Record<BrickFormat, string>> = {
  choice_question: 'Question à choix',
  open_question: 'Question ouverte',
  cloze: 'Texte à trous',
  matching: 'Association',
  ordering: 'Remise en ordre',
  categorization: 'Classement',
  recall_card: 'Carte de rappel',
  instruction: 'Consigne',
  scripted_dialogue: 'Dialogue scénarisé',
  timer: 'Minuteur',
};

async function expectMode(
  page: Parameters<typeof expectTokens>[0],
  mode: GlobalQuizMode,
): Promise<void> {
  const expected = demoSession(mode);
  await expect(page.getByTestId('session-duration')).toHaveText(
    `${String(expected.estimatedMinutes)} min`,
  );
  await expect(page.getByTestId('session-cap')).toHaveText(`${String(expected.capMinutes)} min`);
  await expect(page.getByTestId('session-count')).toHaveText(String(expected.items.length));

  const itemIds = await page
    .locator('[data-testid^="session-item-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(itemIds).toEqual(expected.items.map((item) => `session-item-${item.notionId}`));
  for (const item of expected.items) {
    await expect(page.getByTestId(`session-format-${item.notionId}`)).toHaveText(
      FORMAT_LABELS[item.format],
    );
  }

  const deferredIds = await page
    .locator('[data-testid^="session-deferred-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(deferredIds).toEqual(
    expected.deferred.map((entry) => `session-deferred-${entry.notionId}`),
  );
}

test('Tirage de la session de quiz global @SPEC-406', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Inputs: one row per due notion, including the current module never evaluated.
  await expect(page.getByTestId('session-due-count')).toHaveText(
    String(SESSION_DUE_NOTIONS.length),
  );
  await expect(page.locator('[data-testid^="session-due-n-"]')).toHaveCount(
    SESSION_DUE_NOTIONS.length,
  );
  await expect(page.getByTestId('session-due-n-notseen')).toContainText('non');
  await expect(page.getByTestId('session-due-n-fiori')).toContainText('Oubli');

  // Full session: ordered items, gaps first, modules interleaved, deferred and exhaustion.
  await expectMode(page, 'full');
  const full = demoSession('full');
  expect(full.items.length).toBeGreaterThan(0);
  expect(full.deferred.length).toBeGreaterThan(0);
  expect(full.items[0]?.gapNature).not.toBeNull();
  const gapCount = full.items.filter((item) => item.gapNature !== null).length;
  expect(gapCount).toBeGreaterThan(0);
  expect(full.items.slice(gapCount).every((item) => item.gapNature === null)).toBe(true);
  await expect(page.getByTestId(`session-item-${full.items[0]?.notionId ?? ''}`)).toContainText(
    'Lacune en tête',
  );
  await expect(page.getByTestId('session-deferred-n-notseen')).toContainText(
    'Module jamais évalué',
  );
  await expect(page.getByTestId('session-deferred-n-sans-banque')).toContainText(
    'En attente d’une variante',
  );
  await expect(page.getByTestId('session-exhausted-n-sans-banque')).toContainText('Banque absente');
  await expect(page.getByTestId('session-item-n-role')).toContainText('Variante demandée');
  await expect(page.getByTestId('session-format-n-role')).toHaveText('Question à choix');

  // Micro-session: shorter subset at the micro cap, same deterministic order.
  await page.getByTestId('session-mode-micro').click();
  await expect(page.getByTestId('session-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expectMode(page, 'micro');
  const micro = demoSession('micro');
  expect(micro.items.length).toBeLessThan(full.items.length);
  await expect(page.getByTestId('session-requested-cap')).toHaveText(
    `${String(micro.capMinutes)} min`,
  );

  // Maintenance interview: five minutes at most, validated modules only.
  await page.getByTestId('session-mode-maintenance').click();
  await expectMode(page, 'maintenance');
  const maintenance = demoSession('maintenance');
  expect(maintenance.capMinutes).toBe(5);
  expect(maintenance.estimatedMinutes).toBeLessThanOrEqual(5);
  const validatedModules = new Set(
    SESSION_DUE_NOTIONS.filter((notion) => notion.moduleStatus === 'validated').map(
      (notion) => notion.moduleId,
    ),
  );
  expect(maintenance.items.every((item) => validatedModules.has(item.moduleId))).toBe(true);
  await expect(page.getByTestId('session-deferred-n-ledgers')).toContainText(
    'Hors entretien léger',
  );
  await page.getByTestId('session-mode-full').click();

  // Edge cases computed by the same pure function.
  await expect(page.getByTestId('session-edge-no-due')).toContainText('0 notion(s) retenue(s)');
  await expect(page.getByTestId('session-edge-tight-cap')).toContainText('0 notion(s) retenue(s)');
  await expect(page.getByTestId('session-edge-tight-cap')).toContainText('1 notion(s) reportée(s)');
  await expect(page.getByTestId('session-edge-never-evaluated')).toContainText(
    'Module jamais évalué',
  );
  await expect(page.getByTestId('session-edge-exhausted')).toContainText(
    'Format imposé indisponible',
  );

  await axeCheck();
  await captureEvidence('spec-406-demo');
  expect(consoleErrors).toEqual([]);
});

test('Tirage de la session de quiz global @SPEC-406 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="session-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="session-selected"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="session-deferred"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="session-edge"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expectMode(page, 'full');
  const first = demoSession('full').items[0];
  expect(first).toBeDefined();
  await expect(page.getByTestId(`session-item-${first?.notionId ?? ''}`)).toContainText(
    DEMO_NOTION_LABELS[first?.notionId ?? ''] ?? '',
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-406-demo-visual');
  await expectScreenshotBaseline(page, 'spec-406-demo.png', { fullPage: true });
});
