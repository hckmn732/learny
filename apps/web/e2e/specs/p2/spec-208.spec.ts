import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-208';
const TITLE = 'SPEC-208 — Limitation de débit et protections de l’API';
const REGIONS = ['spec-208-profiles', 'spec-208-origin', 'spec-208-purge'];

test('rafale, origine et purge @SPEC-208', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // CA-1 — every profile applies its capacity: capacity accepted, then one refused.
  const expectations = [
    { profile: 'default', accepted: 120, retry: 1 },
    { profile: 'ai', accepted: 20, retry: 3 },
    { profile: 'auth', accepted: 10, retry: 6 },
  ] as const;
  for (const { profile, accepted, retry } of expectations) {
    await expect(page.getByTestId(`spec-208-remaining-${profile}`)).toHaveText(String(accepted));
    await page
      .getByTestId(`spec-208-profile-${profile}`)
      .getByRole('button', { name: 'Lancer une rafale' })
      .click();
    await expect(page.getByTestId(`spec-208-burst-${profile}`)).toHaveText(
      `${String(accepted)} acceptées, 1 refusées, Retry-After ${String(retry)} s`,
    );
    await expect(page.getByTestId(`spec-208-remaining-${profile}`)).toHaveText('0');
  }

  // CA-3 — a mutation from the application passes, a foreign origin is refused.
  await page.getByRole('button', { name: 'Mutation même origine' }).click();
  await expect(page.getByTestId('spec-208-origin-result')).toHaveText('Mutation acceptée : 200');
  await page.getByRole('button', { name: 'Mutation origine étrangère' }).click();
  await expect(page.getByTestId('spec-208-origin-result')).toHaveText(
    'Mutation refusée : 403 ORIGIN_REJECTED — Requête refusée : origine non autorisée.',
  );

  // CA-4 — the purge removes what is older than 24 h and keeps the rest.
  await expect(page.getByText('Aucune purge lancée.')).toBeVisible();
  await page.getByRole('button', { name: 'Purger maintenant' }).click();
  await expect(page.getByTestId('spec-208-purge-keys')).toHaveText('2');
  await expect(page.getByTestId('spec-208-purge-buckets')).toHaveText('3');

  await axeCheck();
  await captureEvidence('spec-208-protections');
});

test('protections conformes @SPEC-208 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(REGIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Profils', 'Origine', 'Purge']);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['default', 'ai', 'auth']);

  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-208-profiles"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-208-origin"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-208-purge"] button': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-208-protections.png', { fullPage: true });
});
