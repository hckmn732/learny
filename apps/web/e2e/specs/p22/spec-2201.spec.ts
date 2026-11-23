// [SPEC-2201] Identity and formation served by the Python facade, end to end through the web.
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2201';

test('sert les opérations formation basculées depuis Python @SPEC-2201', async ({ request }) => {
  const session = await createTestSession();
  try {
    // Same-origin mutation from the API request context (SPEC-208 origin guard).
    const headers = { cookie: session.cookieHeader, origin: ORIGIN };

    // CA-1, CA-5: `formations.create` is a flipped operation, served by Python behind the facade.
    const created = await request.post('/api/v1/formations', {
      headers: { ...headers, 'idempotency-key': `spec-2201-${session.userId}` },
      data: { title: 'SAP S/4HANA Finance' },
    });
    const createdPayload = await created.text();
    expect(created.status(), createdPayload).toBe(201);
    expect(created.headers()['x-served-by']).toBe('learny-api');
    const body = JSON.parse(createdPayload) as {
      formation: { id: string; title: string; status: string };
      cadrage: { formationId: string; questionsAsked: number; messages: unknown[] };
    };
    expect(body.formation.title).toBe('SAP S/4HANA Finance');
    expect(body.formation.status).toBe('cadrage');
    expect(body.cadrage.questionsAsked).toBeGreaterThanOrEqual(1);
    expect(body.cadrage.messages.length).toBeGreaterThanOrEqual(1);

    // A second flipped read: the list carries the formation the Python use case just wrote.
    const listed = await request.get('/api/v1/formations', { headers });
    expect(listed.status()).toBe(200);
    expect(listed.headers()['x-served-by']).toBe('learny-api');
    const list = (await listed.json()) as { items: { id: string; title: string }[] };
    expect(list.items.map((item) => item.id)).toContain(body.formation.id);

    // The scoping state is readable with the same contract shape.
    const scoping = await request.get(`/api/v1/formations/${body.formation.id}/cadrage/messages`, {
      headers,
    });
    expect(scoping.status()).toBe(200);
    expect(scoping.headers()['x-served-by']).toBe('learny-api');
    const state = (await scoping.json()) as { formationId: string; profile: Record<string, unknown> };
    expect(state.formationId).toBe(body.formation.id);
    expect(Object.keys(state.profile)).toHaveLength(5);

    // A foreign formation is a 404, not an existence leak.
    const missing = await request.get(
      `/api/v1/formations/00000000-0000-4000-8000-000000000000/cadrage/messages`,
      { headers },
    );
    expect(missing.status()).toBe(404);
  } finally {
    await deleteTestSession(session);
  }
});

test('conformité visuelle des domaines identity et formation @SPEC-2201 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Domaines identity et formation en Python',
  );
  await expect(page.getByTestId('spec-2201-flipped')).toContainText('Formation en Python');
  await expect(page.getByTestId('spec-2201-operations')).toContainText('programme.validate');
  await expect(page.getByTestId('spec-2201-operations')).toContainText('notionGraph.get');
  await expect(page.getByTestId('spec-2201-deferred')).toContainText('ADR-2022');
  await expect(page.getByTestId('spec-2201-deferred')).toContainText('ADR-2024');
  await axeCheck();
  await captureEvidence('spec-2201-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2201-mobile');
});
