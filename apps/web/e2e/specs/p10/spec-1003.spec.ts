import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1003';

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test('exécute les cas de transport @SPEC-1003', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText('Couche HTTP');
  await expect(page.getByTestId('spec-1003-origin')).toHaveText('Transport : @learny/http');
  await expect(page.getByTestId('spec-1003-case')).toHaveCount(3);

  await page.getByTestId('spec-1003-run').click();

  await expect(page.getByTestId('spec-1003-status-valid')).toHaveText('201');
  await expect(page.getByTestId('spec-1003-status-invalid')).toHaveText('400');
  await expect(page.getByTestId('spec-1003-status-missing-key')).toHaveText('400');
  await expect(page.getByTestId('spec-1003-code-invalid')).toHaveText('VALIDATION_FAILED');
  await expect(page.getByTestId('spec-1003-code-missing-key')).toHaveText(
    'IDEMPOTENCY_KEY_REQUIRED',
  );
  for (const id of ['valid', 'invalid', 'missing-key']) {
    await expect(page.getByTestId(`spec-1003-request-id-${id}`)).toHaveText('présent');
  }

  await captureEvidence('spec-1003-http-cases');
  await axeCheck();
});

test('démonstration de la couche HTTP @SPEC-1003 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);
  await page.getByTestId('spec-1003-run').click();
  await expect(page.getByTestId('spec-1003-status-valid')).toHaveText('201');

  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-1003-transport"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-1003-demo.png', { fullPage: true });
});
