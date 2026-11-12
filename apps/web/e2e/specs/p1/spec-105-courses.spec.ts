import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['course-versions', 'section-revisions', 'citation-orphan', 'conversation'];

const HEADINGS = [
  'Versions du cours',
  'Révisions d’une section',
  'Citation après suppression',
  'Discussion',
];

test('versions, révisions et citations @SPEC-105', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-105');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-105 · Cours et discussions');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-2 — generating version 2 switches version 1 to non-current.
  await expect(page.getByTestId('version-row')).toHaveCount(2);
  const numbers = await page
    .getByTestId('version-number')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(numbers).toEqual(['1', '2']);
  const statuses = await page
    .getByTestId('version-status')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(statuses).toEqual(['ready', 'ready']);
  const currents = await page
    .getByTestId('version-current')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(currents).toEqual(['non', 'oui']);

  // CA-3 — two learner corrections archive versions 1 and 2, the section is at version 3.
  await expect(page.getByTestId('revision-section-title')).toHaveText('L’en-tête de pièce');
  await expect(page.getByTestId('section-current-version')).toHaveText('3');
  await expect(page.getByTestId('revision-row')).toHaveCount(2);
  const revisionVersions = await page
    .getByTestId('revision-version')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(revisionVersions).toEqual(['1', '2']);
  const editors = await page
    .getByTestId('revision-edited-by')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(editors).toEqual(['learner', 'learner']);

  // CA-4 — the citation keeps its label, its passage reference is null after the soft deletion.
  await expect(page.getByTestId('citation-label')).toHaveText('Guide FI, p. 4');
  await expect(page.getByTestId('citation-displayed')).toHaveText('source supprimée');
  await expect(page.getByTestId('citation-chunk')).toHaveText('nul');
  await expect(page.getByTestId('citation-resource')).toHaveText(
    'conservée (supprimée logiquement)',
  );

  // EF-7 — two ordered messages, each with its source.
  await expect(page.getByTestId('message-row')).toHaveCount(2);
  const roles = await page
    .getByTestId('message-role')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(roles).toEqual(['Apprenant', 'Tuteur']);
  const sources = await page
    .getByTestId('message-sources')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(sources).toEqual(['Sources : Guide FI, p. 4', 'Sources : Guide FI, p. 4']);
  await expect(page.getByTestId('message-content').nth(1)).toContainText(
    'La clé se lit dans le plan comptable',
  );

  await axeCheck();
  await captureEvidence('spec-105-demo');
  expect(consoleErrors).toEqual([]);
});

test('page cours conforme @SPEC-105 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-105');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="course-versions"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-105-demo.png', { fullPage: true });
});
