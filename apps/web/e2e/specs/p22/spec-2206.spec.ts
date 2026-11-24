// [SPEC-2206] Billing and privacy served by the Python facade, end to end through the web. The
// three scenarios below are the contracts of the two contexts the Python slice flipped: the
// subscription entitlement (200), the personal-data export (202 then its state and its download
// route while the job is still queued, 404), and the account deletion (J+30 then its cancellation,
// 204). A real learner session goes through the web relay and the Python facade, and every answer
// carries `x-served-by: learny-api`.
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// ADR-0047: the four test servers share the same frozen instant, so the deadlines are exact.
const FIXED_NOW = '2026-11-11T12:20:00.000Z';
const DELETION_DEADLINE = '2026-12-11T12:20:00.000Z';
const UNKNOWN_EXPORT = '00000000-0000-4000-8000-000000000000';

test('sert la facturation et la confidentialité depuis Python @SPEC-2206', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // The `request` fixture does not share the browser context cookies: they are sent explicitly.
    // The origin header keeps the SPEC-208 guard satisfied on every mutation.
    const headers = { cookie: session.cookieHeader, origin };

    // CA-1, CA-5 — billing.subscription: a learner who never subscribed is entitled to nothing and
    // reads the free default of the contract.
    const subscription = await request.get('/api/v1/billing/subscription', { headers });
    const subscriptionPayload = await subscription.text();
    expect(subscription.status(), subscriptionPayload).toBe(200);
    expect(subscription.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(subscriptionPayload)).toEqual({ status: 'none', currentPeriodEnd: null });

    // CA-1, CA-5, CL-2 — me.export.request: 202 with the identifier of the queued job; the same
    // idempotency key replays the same answer instead of opening a second job.
    const exportHeaders = {
      ...headers,
      'idempotency-key': `spec-2206-export-${session.userId}`,
    };
    const requested = await request.post('/api/v1/me/export', { headers: exportHeaders });
    const requestedPayload = await requested.text();
    expect(requested.status(), requestedPayload).toBe(202);
    expect(requested.headers()['x-served-by']).toBe('learny-api');
    const accepted = JSON.parse(requestedPayload) as { exportId: string; status: string };
    expect(accepted.exportId).toMatch(UUID);
    expect(accepted.status).toBe('queued');

    const replay = await request.post('/api/v1/me/export', { headers: exportHeaders });
    const replayPayload = await replay.text();
    expect(replay.status(), replayPayload).toBe(202);
    expect(JSON.parse(replayPayload)).toEqual(accepted);

    // CA-1, CA-5 — me.export.read: the owner reads the queued state (200, no signed URL yet,
    // expiration not set until the job completes).
    const state = await request.get(`/api/v1/me/exports/${accepted.exportId}`, { headers });
    const statePayload = await state.text();
    expect(state.status(), statePayload).toBe(200);
    expect(state.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(statePayload)).toEqual({
      id: accepted.exportId,
      status: 'queued',
      sizeBytes: null,
      createdAt: FIXED_NOW,
      expiresAt: null,
    });

    // CA-1, CA-5 — me.export.read?download=1: an archive that is not ready yet answers 404, never
    // a signed URL; an unknown identifier answers exactly the same 404 (non-disclosure).
    const notReady = await request.get(
      `/api/v1/me/exports/${accepted.exportId}?download=1`,
      { headers, maxRedirects: 0 },
    );
    const notReadyPayload = await notReady.text();
    expect(notReady.status(), notReadyPayload).toBe(404);
    expect(notReady.headers()['x-served-by']).toBe('learny-api');
    expect((JSON.parse(notReadyPayload) as { code: string }).code).toBe('NOT_FOUND');

    const unknown = await request.get(`/api/v1/me/exports/${UNKNOWN_EXPORT}`, { headers });
    const unknownPayload = await unknown.text();
    expect(unknown.status(), unknownPayload).toBe(404);
    expect(unknown.headers()['x-served-by']).toBe('learny-api');
    expect((JSON.parse(unknownPayload) as { code: string }).code).toBe('NOT_FOUND');

    // CA-1, CA-5 — me.deletion.schedule: the deadline is J+30 on the frozen clock (11 décembre
    // 2026), and a replay returns the same deadline without a second e-mail.
    const scheduled = await request.post('/api/v1/me/deletion', { headers });
    const scheduledPayload = await scheduled.text();
    expect(scheduled.status(), scheduledPayload).toBe(200);
    expect(scheduled.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(scheduledPayload)).toEqual({ scheduledFor: DELETION_DEADLINE });

    const scheduledAgain = await request.post('/api/v1/me/deletion', { headers });
    const scheduledAgainPayload = await scheduledAgain.text();
    expect(scheduledAgain.status(), scheduledAgainPayload).toBe(200);
    expect(JSON.parse(scheduledAgainPayload)).toEqual({ scheduledFor: DELETION_DEADLINE });

    // CA-1, CA-5 — me.deletion.cancel: 204 with an empty body, and the cancellation itself is
    // idempotent (a second call answers 204 without a pending request).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cancelled = await request.delete('/api/v1/me/deletion', { headers });
      expect(cancelled.status(), await cancelled.text()).toBe(204);
      expect(cancelled.headers()['x-served-by']).toBe('learny-api');
    }
  } finally {
    await deleteTestSession(session);
  }
});

