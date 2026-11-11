import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const MANIFEST = fileURLToPath(
  new URL('../../../../../design/references/manifest.json', import.meta.url),
);

interface Entry {
  screenId: string;
  state: string;
  viewport: 'desktop' | 'mobile';
  source: string;
  file: string;
  width: number;
  height: number;
}

function readManifest(): Entry[] {
  return (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { references: Entry[] }).references;
}

test('inspecte les références @SPEC-005', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const references = readManifest();
  const mockups = new Set(references.map((entry) => entry.source.replace(/[?#].*$/, ''))).size;
  const states = new Set(references.map((entry) => `${entry.screenId}/${entry.state}`)).size;

  await page.goto('/_dev/sdd/SPEC-005');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Références visuelles');

  await expect(page.getByTestId('spec-005-count-mockups')).toHaveText(String(mockups));
  await expect(page.getByTestId('spec-005-count-states')).toHaveText(String(states));
  await expect(page.getByTestId('spec-005-count-captures')).toHaveText(
    String(references.length),
  );
  await expect(page.getByTestId('spec-005-count-tokens')).not.toHaveText('');

  const select = page.getByLabel('État de référence');
  await expect(select.locator('option')).toHaveCount(states);

  const first = references[0];
  if (!first) throw new Error('manifeste vide');
  const desktop = page.getByTestId('spec-005-desktop').getByRole('img');
  const mobile = page.getByTestId('spec-005-mobile').getByRole('img');
  await expect(desktop).toHaveAttribute('src', new RegExp(`${first.screenId}-${first.state}-desktop`));
  await expect(mobile).toHaveAttribute('src', new RegExp(`${first.screenId}-${first.state}-mobile`));
  for (const image of [desktop, mobile]) {
    expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  }

  await select.selectOption('SCR-15/modeles');
  await expect(mobile).toHaveAttribute('src', /SCR-15-modeles-mobile/);
  await expect(page.getByTestId('spec-005-mobile')).toContainText('SCR-15 / modeles');

  await axeCheck();
  await captureEvidence('spec-005-final');
  expect(consoleErrors).toEqual([]);
});

test('démonstration des références conforme @SPEC-005 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto('/_dev/sdd/SPEC-005');

  const ids = await page
    .locator('section[data-testid^="spec-005-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(['spec-005-summary', 'spec-005-gallery']);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Inventaire des références',
    'Aperçus',
  ]);

  await expect(page.getByTestId('spec-005-desktop').getByRole('img')).toBeVisible();
  await expect(page.getByTestId('spec-005-mobile').getByRole('img')).toBeVisible();

  await expectTokens(page, {
    '[data-testid="spec-005-summary"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-005-demo.png', { fullPage: true });
});
