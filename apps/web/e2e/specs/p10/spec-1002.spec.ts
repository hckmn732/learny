// SPEC-1002 §12 — démonstration des paquets partagés : le tableau liste les six paquets contrôlés
// (CA-1) et la carte santé appelle GET /api/v1/health depuis le navigateur avec @learny/api-client
// (EF-5, CA-5). L’identifiant de requête est volatile : il est masqué dans la capture visuelle.
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1002';
const TITLE = 'Paquets partagés';

test('appelle l API avec le client partagé @SPEC-1002', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // Les six paquets du contrôle de portabilité (ET-3), chacun une ligne.
  const rows = page.getByTestId('spec-1002-package-row');
  await expect(rows).toHaveCount(6);
  for (const name of ['@learny/contracts', '@learny/api-client', '@learny/domain']) {
    await expect(rows.filter({ hasText: name })).toHaveCount(1);
  }

  // L’appel réel depuis le navigateur : statut reçu + identifiant de requête affiché.
  await page.getByTestId('spec-1002-call-api').click();
  const region = page.getByTestId('spec-1002-health-result');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('spec-1002-status')).toHaveText('Statut : ok');
  await expect(page.getByTestId('spec-1002-request-id')).toHaveText(/.+ : .+/);

  await captureEvidence('spec-1002-api-call');
  await axeCheck();
});

test('démonstration des paquets partagés @SPEC-1002 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  // État final déterministe : l’API est appelée avant la capture, l’identifiant volatile est masqué.
  await page.getByTestId('spec-1002-call-api').click();
  await expect(page.getByTestId('spec-1002-status')).toHaveText('Statut : ok');

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-1002-packages"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-1002-health"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-1002-demo');
  await expectScreenshotBaseline(page, 'spec-1002-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
    // L’identifiant de requête change à chaque exécution : masqué dans la capture (§10).
    mask: [page.getByTestId('spec-1002-request-id')],
  });
});