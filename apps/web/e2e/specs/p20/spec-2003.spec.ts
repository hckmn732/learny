// [SPEC-2003] Python facade, route ownership and transparent relay.
import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-2003';

test('présente la façade Python et la propriété des routes @SPEC-2003', async ({ page, request }) => {
  // The web only knows the facade: this call goes web -> facade -> Hono (ADR-2005).
  const health = await request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  const body = (await health.json()) as { status: string; database: string };
  expect(body.database).toBe('ok');

  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Façade Python et relais Hono');
  await expect(page.getByTestId('spec-2003-ownership')).toContainText('217');
  await expect(page.getByTestId('spec-2003-ownership')).toContainText('32');
  await expect(page.getByTestId('spec-2003-relay')).toContainText('67 oracles');
  await expect(page.getByTestId('spec-2003-tooling')).toContainText('mypy strict');
});

test('conformité visuelle de la façade @SPEC-2003 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-2003-ownership')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-2003-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2003-mobile');
});
