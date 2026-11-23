// [SPEC-2205] Engagement served by the Python facade, end to end through the web. The three
// operations exercised here are the inbox counter, the settings of the notifications tab and the
// read mutation: the parity recorder replays the two reads against the recorded Hono responses,
// this test proves the same contract through the web and the facade with a real session.
import { serviceDb } from '@learny/db';
import { createNotification } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2205';

test('sert les opérations engagement depuis Python @SPEC-2205', async ({ request, baseURL }) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // One unread notification of a real learner: the counter must see it and the read mutation
    // must clear it under this session's RLS claims.
    const seeded = await serviceDb().transaction((tx) =>
      createNotification(tx, {
        userId: session.userId,
        type: 'course_ready',
        title: 'Cours prêt',
        body: 'Le cours de la formation est prêt.',
        href: '/formations',
        icon: 'book-open',
      }),
    );

    // The `request` fixture does not share the browser context cookies: they are sent explicitly.
    // The origin header keeps the SPEC-208 guard satisfied on every mutation.
    const headers = { cookie: session.cookieHeader, origin };

    // CA-1, CA-5 — an engagement read served by Python: the unread badge of the inbox.
    const unread = await request.get('/api/v1/notifications/unread-count', { headers });
    const unreadPayload = await unread.text();
    expect(unread.status(), unreadPayload).toBe(200);
    expect(unread.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(unreadPayload)).toEqual({ count: 1 });

    // CA-1, CA-5 — a second engagement read served by Python: the notifications settings, whole
    // normalised DTO of a learner who never changed anything.
    const settings = await request.get('/api/v1/me/notification-settings', { headers });
    const settingsPayload = await settings.text();
    expect(settings.status(), settingsPayload).toBe(200);
    expect(settings.headers()['x-served-by']).toBe('learny-api');
    const settingsBody = JSON.parse(settingsPayload) as {
      activeTypeCount: number;
      channels: { app: boolean; browser: boolean; email: boolean };
      digestTime: string;
      maxPerDay: number;
      quiet: { crossesMidnight: boolean; empty: boolean; end: string; start: string };
      types: Record<string, boolean>;
      updatedAt: string;
      weekendQuiet: boolean;
    };
    expect(Object.keys(settingsBody).sort()).toEqual([
      'activeTypeCount',
      'channels',
      'digestTime',
      'maxPerDay',
      'quiet',
      'types',
      'updatedAt',
      'weekendQuiet',
    ]);
    expect(settingsBody.channels).toEqual({ app: true, browser: true, email: true });
    expect(settingsBody.types).toEqual({
      course: true,
      gap: true,
      planning: true,
      relaunch: true,
      revision: true,
      validation: true,
    });
    expect(settingsBody.quiet).toEqual({
      crossesMidnight: true,
      empty: false,
      end: '08:00',
      start: '21:00',
    });
    expect(settingsBody.digestTime).toBe('08:00');
    expect(settingsBody.maxPerDay).toBe(5);
    expect(settingsBody.activeTypeCount).toBe(6);
    expect(settingsBody.weekendQuiet).toBe(true);
    expect(settingsBody.updatedAt).toMatch(/Z$/);

    // CA-1, CL-2 — an engagement mutation served by Python: marking the notification read
    // returns the recomputed counter; a replay writes nothing and returns the same answer.
    const read = await request.post(`/api/v1/notifications/${seeded.id}/read`, { headers });
    const readPayload = await read.text();
    expect(read.status(), readPayload).toBe(200);
    expect(read.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(readPayload)).toEqual({ unreadCount: 0 });

    const replay = await request.post(`/api/v1/notifications/${seeded.id}/read`, { headers });
    const replayPayload = await replay.text();
    expect(replay.status(), replayPayload).toBe(200);
    expect(replay.headers()['x-served-by']).toBe('learny-api');
    expect(JSON.parse(replayPayload)).toEqual({ unreadCount: 0 });

    // CA-1, CL-1 — the counter confirms the single effect: the notification is read for this
    // learner, and nobody else's row was touched.
    const afterRead = await request.get('/api/v1/notifications/unread-count', { headers });
    expect(afterRead.status()).toBe(200);
    expect(JSON.parse(await afterRead.text())).toEqual({ count: 0 });
  } finally {
    await deleteTestSession(session);
  }
});

test('conformité visuelle du domaine engagement @SPEC-2205 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Domaine engagement, notifications et automatismes en Python',
  );
  await expect(page.getByTestId('spec-2205-scope')).toContainText('Opérations du périmètre');
  await expect(page.getByTestId('spec-2205-scope')).toContainText('21');
  await expect(page.getByTestId('spec-2205-scope')).toContainText('Servies par Python');
  await expect(page.getByTestId('spec-2205-scope')).toContainText('Encore relayées à Hono');
  await expect(page.getByTestId('spec-2205-scope-jobs')).toContainText(
    'quatre cas d’usage de job',
  );
  await expect(page.getByTestId('spec-2205-operations').locator('li')).toHaveCount(21);
  await expect(page.getByTestId('spec-2205-operations')).toContainText(
    'notifications.unreadCount',
  );
  await expect(page.getByTestId('spec-2205-operations')).toContainText('me.pause.diagnostic');
  await expect(page.getByTestId('spec-2205-inbox')).toContainText('notifications.list');
  await expect(page.getByTestId('spec-2205-inbox')).toContainText(
    'me.notificationSettings.get',
  );
  await expect(page.getByTestId('spec-2205-routing')).toContainText('deferred_quiet');
  await expect(page.getByTestId('spec-2205-routing')).toContainText('[21:00, 08:00)');
  await expect(page.getByTestId('spec-2205-routing')).toContainText('Plafonds 3 / 5 / 8');
  await expect(page.getByTestId('spec-2205-templates').locator('li')).toHaveCount(16);
  await expect(page.getByTestId('spec-2205-templates')).toContainText('planning_adjusted');
  await expect(page.getByTestId('spec-2205-templates')).toContainText('× 2 tonalités');
  await expect(page.getByTestId('spec-2205-automations')).toContainText('plafond_quiz');
  await expect(page.getByTestId('spec-2205-automations')).toContainText('accept');
  await expect(page.getByTestId('spec-2205-automations')).toContainText('decline');
  await expect(page.getByTestId('spec-2205-automations')).toContainText('undo');
  await expect(page.getByTestId('spec-2205-jobs').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('spec-2205-jobs')).toContainText('ensure_practice_exercise');
  await expect(page.getByTestId('spec-2205-jobs')).toContainText('plan_daily_digests');
  await expect(page.getByTestId('spec-2205-jobs')).toContainText('send_daily_digest');
  await expect(page.getByTestId('spec-2205-jobs')).toContainText(
    'sync_validation_quiz_reminders',
  );
  await expect(page.getByTestId('spec-2205-jobs-wiring')).toContainText('SPEC-2207');
  await expect(page.getByTestId('spec-2205-guarantees')).toContainText('Parité contractuelle');
  await expect(page.getByTestId('spec-2205-guarantees')).toContainText('RLS');
  await axeCheck();
  await captureEvidence('spec-2205-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2205-mobile');
});
