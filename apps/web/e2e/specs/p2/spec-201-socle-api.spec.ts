import { ROUTES } from '@learny/contracts';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const CARDS = [
  'demo-validation',
  'demo-business',
  'demo-idempotency',
  'demo-pagination',
  'demo-openapi',
];
const TITLE = 'SPEC-201 — Socle API v1 et contrats';
// Every specification that registers routes grows the document: the count follows the registry.
const ROUTE_COUNT_TEXT = `${String(Object.keys(ROUTES).length)} routes documentées`;

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

test('démonstration du socle API @SPEC-201', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-201');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Validation',
    'Erreur métier',
    'Idempotence',
    'Pagination',
    'OpenAPI',
  ]);

  // CA-1 — a validation error is a 400 problem+json with a prefixed path and a request id.
  await page.getByRole('button', { name: 'Envoyer un message vide' }).click();
  const validation = page.getByTestId('demo-validation-result');
  await expect(validation).toContainText('"code": "VALIDATION_FAILED"');
  await expect(validation).toContainText('"status": 400');
  await expect(validation).toContainText('"path": "body.message"');
  await expect(validation).toContainText('"requestId"');

  // EF-1 — a business error carries its code, a 422 status and the request id.
  await page.getByRole('button', { name: 'Déclencher une erreur métier' }).click();
  const business = page.getByTestId('demo-business-result');
  await expect(business).toContainText('"code": "FORMATION_LIMIT_REACHED"');
  await expect(business).toContainText('"status": 422');
  await expect(business).toContainText('"requestId"');

  // CA-2 — two sends with the same key: one execution, the second one is replayed.
  await page.getByRole('button', { name: 'Envoyer deux fois avec la même clé' }).click();
  const first = page.getByTestId('demo-idem-first');
  const second = page.getByTestId('demo-idem-second');
  await expect(second).toBeVisible();
  const firstText = (await first.textContent()) ?? '';
  const secondText = (await second.textContent()) ?? '';
  const counter = (text: string) => /counter (\d+)/.exec(text)?.[1];
  expect(firstText).toContain('statut 201');
  expect(firstText).toContain('Idempotent-Replayed : non');
  expect(secondText).toContain('statut 201');
  expect(secondText).toContain('Idempotent-Replayed : oui');
  expect(counter(secondText)).toBeDefined();
  expect(counter(secondText)).toBe(counter(firstText));

  // CA-4 — three pages: 20, 40 then 57 items, then the button disappears.
  const count = page.getByTestId('demo-pagination-count');
  await expect(count).toHaveText('20 éléments chargés');
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(count).toHaveText('40 éléments chargés');
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(count).toHaveText('57 éléments chargés');
  await expect(page.getByRole('button', { name: 'Page suivante' })).toHaveCount(0);
  await expect(page.getByTestId('demo-pagination-done')).toHaveText(
    'Tous les éléments sont chargés.',
  );

  // CA-6 — the OpenAPI document lists every registered route.
  await expect(page.getByTestId('demo-openapi-count')).toHaveText(ROUTE_COUNT_TEXT);
  await expect(page.getByRole('link', { name: 'Ouvrir openapi.json' })).toHaveAttribute(
    'href',
    '/openapi.json',
  );

  await axeCheck();
  await captureEvidence('spec-201-socle-api');
  expect(consoleErrors.filter((message) => !message.includes('status of 4'))).toEqual([]);
});

test('page de démonstration SPEC-201 @SPEC-201 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-201');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  await page.getByRole('button', { name: 'Envoyer un message vide' }).click();
  await expect(page.getByTestId('demo-validation-result')).toBeVisible();
  await page.getByRole('button', { name: 'Déclencher une erreur métier' }).click();
  await expect(page.getByTestId('demo-business-result')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer deux fois avec la même clé' }).click();
  await expect(page.getByTestId('demo-idem-second')).toBeVisible();
  await expect(page.getByTestId('demo-pagination-count')).toHaveText('20 éléments chargés');
  await expect(page.getByTestId('demo-openapi-count')).toHaveText(ROUTE_COUNT_TEXT);

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(CARDS);

  // Tokens of the base layout (SPEC-201 §10): page #F4F4F1, white cards, #E7E6E1 border, 24 px.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="demo-validation"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="demo-pagination"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  // Request ids, the execution counter and the route count change from one run or spec to the next: masked.
  await expectScreenshotBaseline(page, 'spec-201-demo.png', {
    fullPage: true,
    mask: [
      page.getByTestId('demo-validation-result'),
      page.getByTestId('demo-business-result'),
      page.getByTestId('demo-idem-first'),
      page.getByTestId('demo-idem-second'),
      page.getByTestId('demo-openapi-count'),
    ],
  });
});

test('refuse un appel sans session @SPEC-201', async ({ request }) => {
  // CA-5 — without a session cookie the API answers 401 problem+json.
  const response = await request.get('/api/v1/dev/sdd/items', { headers: { cookie: '' } });
  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body = (await response.json()) as { code: string; requestId: string };
  expect(body.code).toBe('UNAUTHENTICATED');
  expect(response.headers()['x-request-id']).toBe(body.requestId);
});
