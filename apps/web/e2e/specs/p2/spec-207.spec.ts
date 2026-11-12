import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const CARDS = ['spec-207-now', 'spec-207-local', 'spec-207-quiet', 'spec-207-dst'];
const HEADINGS = [
  'Instant de référence',
  'Heure locale',
  'Heures calmes 21:00–08:00',
  'Changements d’heure 2026 · Europe/Paris',
];

test('inspecte le fuseau et les heures calmes @SPEC-207', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-207');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('Temps et fuseaux');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // EF-1 — the fixed instant of ADR-0047, as the server clock gives it to every request.
  await expect(page.getByTestId('spec-207-now-utc')).toHaveText('2026-11-11T12:20:00Z');

  // CA-1 — 13:20 in Paris at the fixed clock, and the bounds of the local day.
  await expect(page.getByTestId('spec-207-local-zone')).toHaveText('Europe/Paris');
  await expect(page.getByTestId('spec-207-local-time')).toHaveText('13:20');
  await expect(page.getByTestId('spec-207-local-date')).toHaveText('mercredi 11 novembre 2026');
  await expect(page.getByTestId('spec-207-local-weekday')).toHaveText('3');
  await expect(page.getByTestId('spec-207-local-offset')).toHaveText('UTC+01:00');
  await expect(page.getByTestId('spec-207-local-name')).toHaveText('heure normale d’Europe centrale');
  await expect(page.getByTestId('spec-207-local-start')).toHaveText('2026-11-10T23:00:00Z');
  await expect(page.getByTestId('spec-207-local-end')).toHaveText('2026-11-11T23:00:00Z');

  // CA-3 — 13:20 is outside the quiet hours; 21:00 sharp is inside, and is deferred to 08:00.
  const now = page.getByTestId('spec-207-quiet-now');
  await expect(now).toContainText('Maintenant · 13:20');
  await expect(page.getByTestId('spec-207-quiet-now-state')).toHaveText('Envoi permis');
  await expect(page.getByTestId('spec-207-quiet-now-next')).toHaveText(
    'mercredi 11 novembre 2026 à 13:20',
  );
  const evening = page.getByTestId('spec-207-quiet-evening');
  await expect(evening).toContainText('Ce soir · 21:00');
  await expect(page.getByTestId('spec-207-quiet-evening-state')).toHaveText('Heures calmes');
  await expect(page.getByTestId('spec-207-quiet-evening-next')).toHaveText(
    'jeudi 12 novembre 2026 à 08:00',
  );

  // CA-2 — the spring day lasts 23 hours and has no 02:30; the autumn day lasts 25 hours and
  // reads 02:30 twice.
  const spring = page.getByTestId('spec-207-dst-spring');
  await expect(spring).toContainText('dimanche 29 mars 2026');
  await expect(page.getByTestId('spec-207-dst-spring-hours')).toHaveText('23 h');
  await expect(page.getByTestId('spec-207-dst-spring-0230')).toHaveText(
    '02:30 : aucune occurrence, l’heure est sautée',
  );
  await expect(spring).toContainText('2026-03-28T23:00:00Z');
  await expect(spring).toContainText('2026-03-29T22:00:00Z');
  const autumn = page.getByTestId('spec-207-dst-autumn');
  await expect(autumn).toContainText('dimanche 25 octobre 2026');
  await expect(page.getByTestId('spec-207-dst-autumn-hours')).toHaveText('25 h');
  await expect(page.getByTestId('spec-207-dst-autumn-0230')).toHaveText(
    '02:30 : 2 occurrences distinctes',
  );
  await expect(autumn).toContainText('2026-10-24T22:00:00Z');
  await expect(autumn).toContainText('2026-10-25T23:00:00Z');
  await expect(page.getByTestId('spec-207-dst').getByRole('heading', { level: 3 })).toHaveText([
    'Passage à l’heure d’été',
    'Passage à l’heure d’hiver',
  ]);

  await axeCheck();
  await captureEvidence('spec-207-temps-fuseaux');
  expect(consoleErrors).toEqual([]);
});

test('temps local conforme @SPEC-207 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-207');
  await expect(page.getByTestId('sdd-title')).toHaveText('Temps et fuseaux');

  // Structure: four cards in the order of §10, then the two transition cards in the last one.
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);
  const transitions = await page
    .locator('[data-testid="spec-207-dst"] article')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(transitions).toEqual(['spec-207-dst-spring', 'spec-207-dst-autumn']);

  // Tokens of the base layout (SPEC-201 §10): page #F4F4F1, white cards, #E7E6E1 border, 24 px.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-207-now"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-207-dst"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-207-quiet-now"]': {
      'background-color': '#F4F4F1',
      'border-top-left-radius': '12px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-207-demo.png', { fullPage: true });
});
