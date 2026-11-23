// [SPEC-2102] The durable worker: an event emitted through the API is processed end to end.
//
// The stack runs four processes (web, facade, Hono, worker). The demonstration route is still
// owned by TypeScript (`sdd-demo-pipeline`), so the event it writes stays undispatched by Hono and
// the Python worker fans it out to its own consumer `devtools.demo_job`. The proof is the delivery
// row: one per (event, consumer), claimed once, completed once.
import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

// Same-origin mutation from the API request context (SPEC-208 origin guard).
const ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2102';
const DEMO_ROUTE = '/api/v1/dev/sdd/events/demo';
const POLL_TIMEOUT_MS = 20_000;

interface DeliveryRow {
  status: string;
  attempts: number;
  last_error: string | null;
  [key: string]: unknown;
}

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  const origin = baseURL ?? ORIGIN;
  await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: origin })));
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

async function deliveryOf(eventId: string): Promise<DeliveryRow | undefined> {
  const rows = await serviceDb().execute<DeliveryRow>(sql`
    select status, attempts, last_error
    from public.job_deliveries
    where event_id = ${eventId} and consumer = 'devtools.demo_job'
  `);
  return rows[0];
}

test('traite un événement de bout en bout via le worker @SPEC-2102', async ({ request }) => {
  // The route is `idempotent: true`: the wrapper requires the key before anything else, and the
  // cookie of the test session is sent explicitly (the request context is not the page's).
  const started = await request.post(DEMO_ROUTE, {
    headers: {
      origin: ORIGIN,
      cookie: session.cookieHeader,
      'idempotency-key': crypto.randomUUID(),
    },
    data: { failOnceAt: 'none' },
  });
  const payload = await started.text();
  expect(started.status(), payload).toBe(202);
  const accepted = JSON.parse(payload) as { jobId: string };
  expect(accepted.jobId).toMatch(/^[0-9a-f-]{36}$/);

  // The worker polls every 500 ms: wait for the delivery to be done, exactly once.
  const eventId = `sdd-demo:${accepted.jobId}`;
  await expect
    .poll(async () => (await deliveryOf(eventId))?.status, { timeout: POLL_TIMEOUT_MS })
    .toBe('done');
  const row = await deliveryOf(eventId);
  expect(row, `delivery of ${eventId}`).toBeDefined();
  expect(row?.attempts).toBe(1);
  expect(row?.last_error).toBeNull();

  // A second delivery for the same event never appears (primary key) and the event is dispatched.
  const rows = await serviceDb().execute<{ total: number; dispatched: number }>(sql`
    select
      (select count(*)::int from public.job_deliveries where event_id = ${eventId}) as total,
      (select count(*)::int from public.event_outbox
        where event_id = ${eventId} and dispatched_at is not null) as dispatched
  `);
  expect(rows[0]).toEqual({ total: 1, dispatched: 1 });
});

test('conformité visuelle du worker durable @SPEC-2102 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Outbox et worker Python remplaçant Inngest',
  );
  await expect(page.getByTestId('spec-2102-pipeline')).toContainText('job_deliveries');
  await expect(page.getByTestId('spec-2102-guarantees')).toContainText('skip locked');
  await expect(page.getByTestId('spec-2102-scheduler')).toContainText('pg_try_advisory_lock');
  await expect(page.getByTestId('spec-2102-ownership')).toContainText('devtools.demo_job');
  await axeCheck();
  await captureEvidence('spec-2102-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2102-mobile');
});
