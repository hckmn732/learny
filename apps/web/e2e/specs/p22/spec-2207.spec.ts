// [SPEC-2207] Jobs, crons and demonstration routes served by the Python worker.
//
// Two proofs. The first one emits a demonstration event through the facade and waits for the
// Python worker to write the three steps of `sdd_demo_runs`: the event really crossed the outbox,
// the dispatcher and the consumer, and the answer carries `x-served-by: learny-api`. The second one
// is the demonstration page of the cutover, with its counters read from the committed tables.
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2207';
const TITLE = 'Bascule des jobs, des crons et des démonstrations en Python';
// ADR-0047: the stack runs on the frozen instant; the pipeline stamps it on every step.
const FIXED_NOW = '2026-11-11T12:20:00.000Z';
const STEP_NAMES = ['step-1-prepare', 'step-2-process', 'step-3-finish'];

test('un événement de démonstration est consommé par le worker Python @SPEC-2207', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // The `request` fixture does not share the browser cookies: they are sent explicitly, with the
    // same-origin header the SPEC-208 guard requires and the idempotency key of the route.
    const headers = {
      cookie: session.cookieHeader,
      origin,
      'idempotency-key': `spec-2207-demo-${session.userId}`,
    };

    const started = await request.post('/api/v1/dev/sdd/events/demo', {
      headers,
      data: { failOnceAt: 'none' },
    });
    const startedPayload = await started.text();
    expect(started.status(), startedPayload).toBe(202);
    expect(started.headers()['x-served-by']).toBe('learny-api');
    const accepted = JSON.parse(startedPayload) as { jobId: string };
    expect(accepted.jobId).toMatch(/^[0-9a-f-]{36}$/);

    // CA-1, CA-2 — the Python worker owns `devtools.demo_job`: it records the three steps and
    // closes the run. No TypeScript consumer runs, Hono has no `/api/inngest` in this stack.
    await expect
      .poll(
        async () => {
          const response = await request.get(`/api/v1/dev/sdd/events/demo/${accepted.jobId}`, {
            headers,
          });
          expect(response.status(), await response.text()).toBe(200);
          const state = (await response.json()) as {
            steps: { name: string; at: string }[];
            attempts: number;
            finishedAt: string | null;
          };
          return state.finishedAt === null ? null : state;
        },
        { timeout: 30000, message: 'le worker Python n’a pas terminé la démonstration' },
      )
      .not.toBeNull();

    const state = await request.get(`/api/v1/dev/sdd/events/demo/${accepted.jobId}`, { headers });
    const payload = await state.text();
    expect(state.status(), payload).toBe(200);
    const run = JSON.parse(payload) as {
      runId: string;
      steps: { name: string; at: string }[];
      attempts: number;
      finishedAt: string | null;
    };
    expect(run.runId).toBe(accepted.jobId);
    expect(run.steps.map((step) => step.name)).toEqual(STEP_NAMES);
    expect(run.steps.map((step) => step.at)).toEqual([FIXED_NOW, FIXED_NOW, FIXED_NOW]);
    expect(run.attempts).toBe(1);
    expect(run.finishedAt).toBe(FIXED_NOW);

    // CA-1 — a relayed operation still answers through the facade: the deferral is not a
    // functional regression, it is a relay that remains.
    const home = await request.get('/api/v1/home', { headers });
    expect(home.status(), await home.text()).toBe(200);
    expect(home.headers()['x-served-by']).toBe('learny-api');
  } finally {
    await deleteTestSession(session);
  }
});

test('conformité visuelle de la bascule @SPEC-2207 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);

  // CA-1 — the four tables of the ownership file, read by the page itself.
  const scope = page.getByTestId('spec-2207-scope');
  await expect(scope).toContainText('Opérations servies par Python');
  await expect(scope).toContainText('190 / 217');
  await expect(scope).toContainText('Routes spéciales servies par Python');
  await expect(scope).toContainText('29 / 32');
  await expect(scope).toContainText('Consommateurs Python');
  await expect(scope).toContainText('23 / 23');
  await expect(scope).toContainText('Crons Python');
  await expect(scope).toContainText('2 / 2');
  await expect(page.getByTestId('spec-2207-scope-deferred')).toContainText(
    '30 entrées restent relayées',
  );

  // CA-1 — every consumer and both crons are Python, and the page says why the rest is relayed.
  await expect(page.getByTestId('spec-2207-consumers').locator('li')).toHaveCount(23);
  await expect(page.getByTestId('spec-2207-consumers')).toContainText('devtools.demo_job');
  await expect(page.getByTestId('spec-2207-consumers')).toContainText('tutor.generate_course');
  await expect(page.getByTestId('spec-2207-crons').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('spec-2207-crons')).toContainText('cron/hourly-tick');
  await expect(page.getByTestId('spec-2207-crons')).toContainText('cron/nightly');
  const deferred = page.getByTestId('spec-2207-deferred');
  await expect(deferred.locator('span')).toHaveCount(30);
  await expect(deferred).toContainText('fabriques de');
  await expect(deferred).toContainText('agrégat de dix-huit lectures');
  await expect(deferred).toContainText('commitlint');
  await expect(deferred).toContainText('planSprintsBeforeMilestones');

  // CA-2, CA-3 — the proofs, and the guarantees the worker holds.
  await expect(page.getByTestId('spec-2207-parity')).toContainText('échanges de cookies');
  await expect(page.getByTestId('spec-2207-parity')).toContainText('octet pour octet');
  await expect(page.getByTestId('spec-2207-parity')).toContainText('sdd/demo-requested');
  await expect(page.getByTestId('spec-2207-guarantees')).toContainText('Un seul écrivain');
  await expect(page.getByTestId('spec-2207-guarantees')).toContainText('Idempotence');
  await expect(page.getByTestId('spec-2207-guarantees')).toContainText('Horloge injectable');

  await axeCheck();
  await captureEvidence('spec-2207-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2207-mobile');
});
