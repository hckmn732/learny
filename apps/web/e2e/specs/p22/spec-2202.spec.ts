// [SPEC-2202] Learning and assessments served by the Python facade, end to end through the web.
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2202';
// A syntactically valid identifier that exists for nobody: the response must not reveal whether a
// row exists (CL-1), and the entry is still answered once (CL-2).
const ABSENT_ID = '00000000-0000-4000-8000-000000000000';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ANSWERED_AT = '2026-11-11T12:00:00.000Z';

test('sert les opérations learning et assessments depuis Python @SPEC-2202', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // The `request` fixture does not share the browser context cookies: they are sent explicitly.
    // The origin header keeps the SPEC-208 guard satisfied on every mutation.
    const headers = { cookie: session.cookieHeader, origin };

    // CA-1, CA-5 — a learning read served by Python: the streak DTO of a brand-new account.
    const streak = await request.get('/api/v1/streak', { headers });
    const streakPayload = await streak.text();
    expect(streak.status(), streakPayload).toBe(200);
    expect(streak.headers()['x-served-by']).toBe('learny-api');
    const streakBody = JSON.parse(streakPayload) as {
      days: number;
      regularity: { date: string; status: string }[];
      timezone: string;
      computedOn: string;
      nextMilestone: { key: string; remaining: number; label: string } | null;
    };
    expect(streakBody.days).toBe(0);
    expect(streakBody.regularity).toHaveLength(14);
    expect(streakBody.timezone).toBe('Europe/Paris');
    expect(streakBody.computedOn).toBe('2026-11-11');
    expect(streakBody.nextMilestone).not.toBeNull();

    // CA-1, CA-5 — an assessments read served by Python: the offline pack of a new account.
    const pack = await request.get('/api/v1/offline/pack', { headers });
    const packPayload = await pack.text();
    expect(pack.status(), packPayload).toBe(200);
    expect(pack.headers()['x-served-by']).toBe('learny-api');
    const packBody = JSON.parse(packPayload) as {
      ownerId: string;
      localDate: string;
      generatedAt: string;
      expiresAt: string;
      formations: unknown[];
    };
    expect(Object.keys(packBody).sort()).toEqual([
      'expiresAt',
      'formations',
      'generatedAt',
      'localDate',
      'ownerId',
    ]);
    expect(packBody.ownerId).toBe(session.userId);
    expect(packBody.localDate).toBe('2026-11-11');
    expect(packBody.formations).toEqual([]);

    // CA-1, CL-2 — an assessments mutation served by Python: one result per entry, and a replay
    // of the same `clientId` is a `duplicate` with no second effect.
    const entries = [
      {
        clientId: CLIENT_ID,
        formationId: ABSENT_ID,
        sessionId: ABSENT_ID,
        answeredAt: ANSWERED_AT,
        kind: 'answer',
        position: 0,
      },
    ];
    const sync = () =>
      request.post('/api/v1/sync/offline-answers', { headers, data: { entries } });
    const applied = await sync();
    const appliedPayload = await applied.text();
    expect(applied.status(), appliedPayload).toBe(200);
    expect(applied.headers()['x-served-by']).toBe('learny-api');
    const appliedBody = JSON.parse(appliedPayload) as {
      results: { clientId: string; status: string; code?: string }[];
    };
    expect(appliedBody.results).toEqual([
      { clientId: CLIENT_ID, status: 'rejected', code: 'SESSION_NOT_FOUND' },
    ]);

    const replayed = await sync();
    const replayedPayload = await replayed.text();
    expect(replayed.status(), replayedPayload).toBe(200);
    expect(replayed.headers()['x-served-by']).toBe('learny-api');
    const replayedBody = JSON.parse(replayedPayload) as {
      results: { clientId: string; status: string }[];
    };
    expect(replayedBody.results).toEqual([{ clientId: CLIENT_ID, status: 'duplicate' }]);
  } finally {
    await deleteTestSession(session);
  }
});

test('conformité visuelle des domaines learning et assessments @SPEC-2202 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Domaines learning et assessments en Python',
  );
  await expect(page.getByTestId('spec-2202-scope')).toContainText('Learning en Python');
  await expect(page.getByTestId('spec-2202-scope')).toContainText('Assessments en Python');
  await expect(page.getByTestId('spec-2202-scope')).toContainText('41');
  await expect(page.getByTestId('spec-2202-scope')).toContainText('Encore relayées à Hono');
  await expect(page.getByTestId('spec-2202-operations').locator('li')).toHaveCount(41);
  await expect(page.getByTestId('spec-2202-operations')).toContainText('offline.sync');
  await expect(page.getByTestId('spec-2202-engine')).toContainText('FSRS 5.4.2');
  await expect(page.getByTestId('spec-2202-engine')).toContainText('Planificateur');
  await expect(page.getByTestId('spec-2202-guarantees')).toContainText('Parité contractuelle');
  await expect(page.getByTestId('spec-2202-guarantees')).toContainText(
    'Un seul effet par événement',
  );
  await expect(page.getByTestId('spec-2202-debts')).toContainText('module-unlock');
  await expect(page.getByTestId('spec-2202-debts')).toContainText('SPEC-2207');
  await axeCheck();
  await captureEvidence('spec-2202-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2202-mobile');
});
