// [SPEC-2205] Engagement served by the Python facade, end to end through the web. The three
// operations exercised here are the inbox counter, the settings of the notifications tab and the
// read mutation: the parity recorder replays the two reads against the recorded Hono responses,
// this test proves the same contract through the web and the facade with a real session.
import { createNotification } from '@learny/testing';
import { serviceDb } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';

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

