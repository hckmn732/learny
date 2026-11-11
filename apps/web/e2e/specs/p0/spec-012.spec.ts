import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const SECTIONS = ['spec-012-services', 'spec-012-images', 'spec-012-health', 'spec-012-commands'];

test('inspecte la pile auto-hébergée @SPEC-012', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-012');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Auto-hébergement');

  const services = page.getByTestId('spec-012-services');
  await expect(page.getByTestId('spec-012-demo')).toHaveText(
    'Démonstration : état simulé, les preuves réelles viennent de tools/docker/check-selfhost.mjs --up.',
  );
  await expect(services.getByRole('listitem')).toHaveCount(2);
  await expect(services.getByRole('listitem').first()).toContainText('Web');
  await expect(services.getByRole('listitem').first()).toContainText('Supabase / Inngest');
  await expect(services.getByRole('listitem').nth(1)).toContainText('Worker');
  await expect(services.getByRole('row')).toHaveCount(10);
  await expect(services).toContainText('migrate');
  await expect(services).toContainText('Volumes persistants');

  const images = page.getByTestId('spec-012-images');
  await expect(images.getByRole('row')).toHaveCount(10);
  await expect(images).toContainText('learny-web');
  await expect(images).toContainText('learny-worker');
  await expect(images).toContainText('supabase/postgres');
  await expect(images).toContainText('17.11.0.006');
  await expect(images).toContainText('inngest/inngest');
  await expect(images).toContainText('v1.52.0');
  await expect(images).toContainText('Commit');

  const health = page.getByTestId('spec-012-health');
  await expect(health.getByRole('row')).toHaveCount(9);
  for (const target of [
    '/api/v1/health',
    '/health',
    'pg_isready -U postgres',
    '/status',
    'kong health',
  ]) {
    await expect(health).toContainText(target);
  }

  const commands = page.getByTestId('spec-012-commands').locator('code');
  await expect(commands).toContainText('docker compose --env-file .env.selfhost');
  await expect(commands).toContainText('up -d --build');
  await expect(commands).toContainText('tools/docker/check-selfhost.mjs');
  await expect(commands).toContainText(' down');

  await axeCheck();
  await captureEvidence('spec-012-final');
  expect(consoleErrors).toEqual([]);
});

test('auto-hébergement conforme @SPEC-012 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-012');

  const ids = await page
    .locator('section[data-testid^="spec-012-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Composants du Compose',
    'Images',
    'Sondes de santé',
    'Commandes',
  ]);

  await expectTokens(page, {
    '[data-testid="spec-012-services"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-012-images"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-012-demo.png', { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-012-demo-mobile.png', { fullPage: true });
});
