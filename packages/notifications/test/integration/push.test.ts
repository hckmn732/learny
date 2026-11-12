// Integration tests of the push channel (SPEC-205 §12, CA-1 to CA-4).
//
// Postgres is real, with its Row Level Security policies: two learners act through their own
// `userDb` clients (the identity the API wrapper gives a session), the send runs with the owner
// role like a job would. The push service is the deterministic mock of EF-6: no network. Users
// are committed (the mock round and the RLS clients use several connections) and removed at the
// end. Measured outputs are written to `evidence/SPEC-205/proofs/`: counts, codes and statuses,
// never an endpoint, a key or an address.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PushSubscriptionBody, isPublicPushEndpoint } from '@learny/contracts';
import { AppError, type Clock, type Result } from '@learny/core';
import { logger } from '@learny/core/server';
import {
  closeDb,
  createNotification,
  getDelivery,
  pushSubscriptions,
  serviceDb,
  sql,
  userDb,
  type NotificationDelivery,
  type PushSubscription,
} from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  MockPushTransport,
  PUSH_ERROR_CODES,
  PUSH_MAX_FAILURES,
  listPushSubscriptions,
  mockPushEndpoint,
  removePushSubscription,
  sendPush,
  upsertPushSubscription,
  type PushSendOptions,
  type PushSendResult,
  type PushSystemContext,
  type PushTarget,
  type PushTransport,
  type PushUserContext,
} from '../../src/push/index';

const PREFIX = 'sdd-205-';
const ROOT = path.resolve(__dirname, '../../../..');

class TestClock implements Clock {
  private current = new Date('2026-11-11T12:20:00Z');
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** A transport that answers `transient` a given number of times, then delegates to the mock. */
class FlakyTransport implements PushTransport {
  readonly mode = 'mock' as const;
  failures = 0;
  constructor(private readonly inner: MockPushTransport) {}
  send(target: PushTarget, payload: string, options: PushSendOptions): Promise<PushSendResult> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.resolve({ ok: false, statusCode: null, reason: 'transient' });
    }
    return this.inner.send(target, payload, options);
  }
}

const clock = new TestClock();
const mock = new MockPushTransport(() => clock.now());
const createdUsers: string[] = [];
const proofs = new Map<string, Array<Record<string, unknown>>>();

function proof(name: string, entry: Record<string, unknown>): void {
  proofs.set(name, [...(proofs.get(name) ?? []), entry]);
}

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const id = await serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
  createdUsers.push(id);
  return id;
}

function userContext(userId: string): PushUserContext {
  return {
    userId,
    requestId: `req-${randomUUID().slice(0, 8)}`,
    db: userDb({ userId }),
    clock,
    logger,
  };
}

function systemContext(): PushSystemContext {
  return { requestId: `job-${randomUUID().slice(0, 8)}`, sdb: serviceDb(), clock, logger };
}

function body(endpoint: string, suffix = ''): PushSubscriptionBody {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: `BP256dh${suffix}`, auth: `auth${suffix}` },
    userAgent: 'Test/1.0',
  };
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

async function rowsOf(userId: string): Promise<PushSubscription[]> {
  return serviceDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(pushSubscriptions.createdAt);
}

async function insertSubscription(
  userId: string,
  endpoint: string,
  failureCount = 0,
): Promise<string> {
  const rows = await serviceDb()
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint,
      p256dh: 'BP256dh',
      auth: 'auth',
      failureCount,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    })
    .returning({ id: pushSubscriptions.id });
  return rows[0]?.id ?? '';
}

async function createInboxNotification(userId: string) {
  const { notification } = await serviceDb().transaction((tx) =>
    createNotification(tx, {
      userId,
      type: 'global_quiz_today',
      title: 'Votre quiz global du jour est prêt',
      body: 'Dix questions pour entretenir vos acquis.',
      href: '/quiz/global',
      icon: 'calendar',
      createdAt: clock.now(),
    }),
  );
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    icon: notification.icon,
    href: notification.href,
  };
}

async function deliveryOf(notificationId: string): Promise<NotificationDelivery | null> {
  return serviceDb().transaction((tx) => getDelivery(tx, { notificationId, channel: 'push' }));
}

beforeAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  if (createdUsers.length > 0) {
    await serviceDb().execute(
      sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
    );
  }
  const directory = path.join(ROOT, 'evidence/SPEC-205/proofs');
  mkdirSync(directory, { recursive: true });
  for (const [name, entries] of proofs) {
    writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(entries, null, 2)}\n`);
  }
  await closeDb();
});

describe('[SPEC-205] push subscriptions', () => {
  describe('registration under Row Level Security (CA-1)', () => {
    it('creates the subscription of a learner, then refreshes it idempotently on the same endpoint', async () => {
      const a = await createUser('alice');
      const endpoint = mockPushEndpoint(a, 'success');
      const first = unwrap(await upsertPushSubscription(userContext(a), body(endpoint, '1')));
      expect(first.created).toBe(true);
      expect(first.createdAt).toBe('2026-11-11T12:20:00.000Z');
      clock.advance(60_000);
      const second = unwrap(await upsertPushSubscription(userContext(a), body(endpoint, '2')));
      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
      // `updated_at` is maintained by the `set_updated_at` trigger of SPEC-102, not by the injected
      // clock: assert that the refresh moved it forward and that the keys were replaced.
      expect(new Date(second.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.updatedAt).getTime(),
      );
      const rows = await rowsOf(a);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.p256dh).toBe('BP256dh2');
      expect(rows[0]?.auth).toBe('auth2');
      expect(rows[0]?.userAgent).toBe('Test/1.0');
      // The listing of the owner sees the row; nothing else.
      expect((await listPushSubscriptions(userContext(a))).map((row) => row.id)).toEqual([
        first.id,
      ]);
      proof('registration', {
        case: 'upsert',
        rows: rows.length,
        created: [first.created, second.created],
      });
    });

    it('refuses the endpoint of another account with a neutral answer and no leak (CL-3)', async () => {
      const a = await createUser('alice');
      const b = await createUser('bruno');
      const endpoint = mockPushEndpoint(`shared-${a.slice(0, 8)}`, 'success');
      unwrap(await upsertPushSubscription(userContext(a), body(endpoint)));
      const refused = await upsertPushSubscription(userContext(b), body(endpoint, 'b'));
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error).toBeInstanceOf(AppError);
      expect(refused.error.code).toBe('FORBIDDEN');
      expect(refused.error.detail).not.toContain(endpoint);
      expect(refused.error.detail).not.toMatch(/exist|autre compte|appartient/i);
      expect(await rowsOf(b)).toHaveLength(0);
      expect(await listPushSubscriptions(userContext(b))).toEqual([]);
      const ownerRows = await rowsOf(a);
      expect(ownerRows).toHaveLength(1);
      expect(ownerRows[0]?.p256dh).toBe('BP256dh');
      // Bruno cannot read Alice's row either, even by endpoint, through his RLS client.
      const seenByB = await userContext(b).db?.run((tx) =>
        tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)),
      );
      expect(seenByB).toEqual([]);
      proof('registration', {
        case: 'foreign-endpoint',
        code: refused.error.code,
        rowsOfB: 0,
        rowsOfA: 1,
      });
    });

    it('removes idempotently, and a foreign removal deletes nothing while answering the same (EF-2)', async () => {
      const a = await createUser('alice');
      const b = await createUser('bruno');
      const endpoint = mockPushEndpoint(a, 'success');
      unwrap(await upsertPushSubscription(userContext(a), body(endpoint)));
      const byB = unwrap(await removePushSubscription(userContext(b), { endpoint }));
      expect(byB).toEqual({ removed: 0 });
      expect(await rowsOf(a)).toHaveLength(1);
      const byA = unwrap(await removePushSubscription(userContext(a), { endpoint }));
      expect(byA).toEqual({ removed: 1 });
      const again = unwrap(await removePushSubscription(userContext(a), { endpoint }));
      expect(again).toEqual({ removed: 0 });
      expect(await rowsOf(a)).toHaveLength(0);
      proof('registration', {
        case: 'remove',
        byOther: byB.removed,
        byOwner: [byA.removed, again.removed],
      });
    });

    it('refuses an endpoint the server must never contact (ET-3) and an anonymous caller', async () => {
      const refused = [
        'http://push.example.com/x',
        'https://localhost/x',
        'https://127.0.0.1/x',
        'https://[::1]/x',
        'https://push/x',
        'https://user:pw@push.example.com/x',
        'https://push.internal/x',
        'https://push.example.com/x y',
        `https://push.example.com/${'a'.repeat(2100)}`,
        'javascript:alert(1)',
      ];
      for (const endpoint of refused) {
        expect(isPublicPushEndpoint(endpoint), endpoint).toBe(false);
        expect(PushSubscriptionBody.safeParse(body(endpoint)).success, endpoint).toBe(false);
      }
      expect(isPublicPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
      expect(isPublicPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(
        true,
      );
      const anonymous: PushUserContext = {
        userId: null,
        requestId: 'anon',
        db: null,
        clock,
        logger,
      };
      await expect(
        upsertPushSubscription(anonymous, body(mockPushEndpoint('x', 'success'))),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      proof('registration', { case: 'endpoint-validation', refused: refused.length });
    });
  });

  describe('sending through the mock push service (CA-2, CA-4)', () => {
    it('writes `sent`, resets the counter and stamps last_success_at on a 201', async () => {
      const a = await createUser('alice');
      await insertSubscription(a, mockPushEndpoint(a, 'success'), 3);
      const notification = await createInboxNotification(a);
      const before = mock.records().length;
      const outcome = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: mock },
      );
      expect(outcome.status).toBe('sent');
      expect(outcome.retryable).toBe(false);
      expect(
        outcome.attempts.map((attempt) => [
          attempt.result.statusCode,
          attempt.removed,
          attempt.failureCount,
        ]),
      ).toEqual([[201, false, 0]]);
      const rows = await rowsOf(a);
      expect(rows[0]?.failureCount).toBe(0);
      expect(rows[0]?.lastSuccessAt?.toISOString()).toBe(clock.now().toISOString());
      const delivery = await deliveryOf(notification.id);
      expect(delivery?.status).toBe('sent');
      expect(delivery?.sentAt?.toISOString()).toBe(clock.now().toISOString());
      expect(delivery?.error).toBeNull();
      // The mock received the minimal payload only, once.
      const records = mock.records().slice(before);
      expect(records).toHaveLength(1);
      expect(JSON.parse(records[0]?.payload ?? '{}')).toEqual({
        title: notification.title,
        body: notification.body,
        icon: 'calendar',
        url: '/quiz/global',
        tag: notification.id,
      });
      expect(records[0]?.ttl).toBe(86_400);
      proof('send', {
        case: 'success',
        statusCode: 201,
        delivery: 'sent',
        failureCount: 0,
        payloadKeys: Object.keys(
          JSON.parse(records[0]?.payload ?? '{}') as Record<string, unknown>,
        ),
      });
    });

    it('removes the subscription at the first 404 and at the first 410, in the same transaction as the journal (CL-4, ET-5)', async () => {
      for (const outcome of ['missing', 'gone'] as const) {
        const a = await createUser(`alice-${outcome}`);
        await insertSubscription(a, mockPushEndpoint(a, outcome), 0);
        const notification = await createInboxNotification(a);
        const result = await sendPush(
          systemContext(),
          { userId: a, notification },
          { transport: mock },
        );
        expect(result.status).toBe('failed');
        expect(result.error).toBe(PUSH_ERROR_CODES.gone);
        expect(result.retryable).toBe(false);
        expect(result.attempts[0]?.removed).toBe(true);
        expect(result.remainingSubscriptions).toBe(0);
        expect(await rowsOf(a)).toHaveLength(0);
        const delivery = await deliveryOf(notification.id);
        expect(delivery?.status).toBe('failed');
        expect(delivery?.error).toBe('gone');
        proof('send', {
          case: outcome,
          statusCode: result.attempts[0]?.result.statusCode,
          removed: true,
          delivery: 'failed',
          error: 'gone',
        });
      }
    });

    it('counts transient failures 1 to 4, removes at the fifth, and resets after a success (CL-5)', async () => {
      const a = await createUser('alice');
      const flaky = new FlakyTransport(mock);
      await insertSubscription(a, mockPushEndpoint(a, 'success'), 0);
      const counters: number[] = [];
      const deliveries: string[] = [];
      for (let round = 1; round <= 3; round += 1) {
        flaky.failures = 1;
        const notification = await createInboxNotification(a);
        const outcome = await sendPush(
          systemContext(),
          { userId: a, notification },
          { transport: flaky },
        );
        expect(outcome.status).toBe('failed');
        expect(outcome.error).toBe(PUSH_ERROR_CODES.transient);
        expect(outcome.retryable).toBe(true);
        counters.push((await rowsOf(a))[0]?.failureCount ?? -1);
        deliveries.push(`${outcome.delivery.status}/${outcome.delivery.error ?? ''}`);
      }
      expect(counters).toEqual([1, 2, 3]);
      // A success in between resets the counter to zero.
      const success = await sendPush(
        systemContext(),
        { userId: a, notification: await createInboxNotification(a) },
        { transport: flaky },
      );
      expect(success.status).toBe('sent');
      expect((await rowsOf(a))[0]?.failureCount).toBe(0);
      // Five more failures: 1, 2, 3, 4 then removal at the fifth.
      const after: Array<number | 'removed'> = [];
      for (let round = 1; round <= PUSH_MAX_FAILURES; round += 1) {
        flaky.failures = 1;
        const outcome = await sendPush(
          systemContext(),
          { userId: a, notification: await createInboxNotification(a) },
          { transport: flaky },
        );
        const rows = await rowsOf(a);
        after.push(rows.length === 0 ? 'removed' : (rows[0]?.failureCount ?? -1));
        if (round === PUSH_MAX_FAILURES) {
          expect(outcome.attempts[0]?.removed).toBe(true);
          expect(outcome.error).toBe(PUSH_ERROR_CODES.gone);
          expect(outcome.retryable).toBe(false);
        }
      }
      expect(after).toEqual([1, 2, 3, 4, 'removed']);
      proof('send', {
        case: 'five-failures',
        beforeSuccess: counters,
        afterSuccess: 0,
        afterwards: after,
        deliveries,
      });
    });

    it('updates the transient journal line to `sent` on a retry, without duplicating it', async () => {
      const a = await createUser('alice');
      const flaky = new FlakyTransport(mock);
      await insertSubscription(a, mockPushEndpoint(a, 'success'), 0);
      const notification = await createInboxNotification(a);
      flaky.failures = 1;
      const first = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: flaky },
      );
      expect(first.retryable).toBe(true);
      expect((await deliveryOf(notification.id))?.status).toBe('failed');
      const second = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: flaky },
      );
      expect(second.status).toBe('sent');
      const lines = await serviceDb().execute<{ total: number }>(sql`
        select count(*)::int as total from public.notification_deliveries
        where notification_id = ${notification.id}::uuid and channel = 'push'
      `);
      expect(lines[0]?.total).toBe(1);
      expect((await deliveryOf(notification.id))?.status).toBe('sent');
      // A third round never reopens a sent line (ADR-0244).
      const third = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: flaky },
      );
      expect(third.delivery.status).toBe('sent');
      expect(third.delivery.id).toBe(second.delivery.id);
      proof('send', {
        case: 'retry',
        first: first.delivery.status,
        second: second.delivery.status,
        journalLines: lines[0]?.total,
      });
    });

    it('sends nothing and keeps the in-app notification when the learner has no subscription (CA-4)', async () => {
      const a = await createUser('alice');
      const notification = await createInboxNotification(a);
      const before = mock.records().length;
      const outcome = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: mock },
      );
      expect(outcome.status).toBe('skipped');
      expect(outcome.error).toBe(PUSH_ERROR_CODES.noSubscription);
      expect(outcome.attempts).toEqual([]);
      expect(mock.records().length).toBe(before);
      const delivery = await deliveryOf(notification.id);
      expect(delivery?.status).toBe('skipped_pref');
      expect(delivery?.error).toBe('no_subscription');
      const inbox = await serviceDb().execute<{ total: number }>(sql`
        select count(*)::int as total from public.notifications where id = ${notification.id}::uuid and read_at is null
      `);
      expect(inbox[0]?.total).toBe(1);
      proof('send', {
        case: 'no-subscription',
        pushCalls: 0,
        delivery: 'skipped_pref',
        error: 'no_subscription',
        inboxRows: 1,
      });
    });

    it('reaches every active subscription of the learner and succeeds when one of them does', async () => {
      const a = await createUser('alice');
      await insertSubscription(a, mockPushEndpoint(`${a}-1`, 'gone'), 0);
      clock.advance(1_000);
      await insertSubscription(a, mockPushEndpoint(`${a}-2`, 'transient'), 0);
      clock.advance(1_000);
      await insertSubscription(a, mockPushEndpoint(`${a}-3`, 'success'), 2);
      const notification = await createInboxNotification(a);
      const outcome = await sendPush(
        systemContext(),
        { userId: a, notification },
        { transport: mock },
      );
      expect(outcome.status).toBe('sent');
      expect(
        outcome.attempts.map((attempt) => [
          attempt.result.statusCode,
          attempt.removed,
          attempt.failureCount,
        ]),
      ).toEqual([
        [410, true, 0],
        [503, false, 1],
        [201, false, 0],
      ]);
      expect(outcome.remainingSubscriptions).toBe(2);
      expect((await rowsOf(a)).map((row) => row.failureCount)).toEqual([1, 0]);
      proof('send', { case: 'three-subscriptions', statuses: [410, 503, 201], remaining: 2 });
    });
  });

  describe('no private key reaches the client (CA-3, ET-6)', () => {
    it('finds no VAPID private key name or value in the service worker and the client bundles', () => {
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const files: string[] = [path.join(ROOT, 'apps/web/public/sw.js')];
      const staticDir = path.join(ROOT, 'apps/web/.next/static');
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(js|css|json|txt)$/.test(entry)) files.push(full);
        }
      };
      if (existsSync(staticDir)) walk(staticDir);
      const offenders: string[] = [];
      for (const file of files) {
        const bytes = readFileSync(file, 'utf8');
        if (bytes.includes('VAPID_PRIVATE_KEY'))
          offenders.push(`${path.relative(ROOT, file)} (nom)`);
        if (privateKey !== undefined && privateKey !== '' && bytes.includes(privateKey)) {
          offenders.push(`${path.relative(ROOT, file)} (valeur)`);
        }
      }
      expect(files.length).toBeGreaterThan(0);
      expect(offenders).toEqual([]);
      proof('bundle', {
        scannedFiles: files.length,
        clientBundlePresent: existsSync(staticDir),
        offenders: offenders.length,
      });
    });
  });
});
