// Integration tests of the notification schema (SPEC-109 §12): introspection, SQL constraints,
// deduplication under real concurrency, paginated/unread reads, BR-NOT-04 defaults and their effect
// on prepared deliveries, RLS isolation with two real JWTs and cascade behaviour. Every read goes
// through `userDb` (ET-4); the service role is used only to seed and to clean up. The clock is fixed
// at 2026-11-11T12:20:00Z (ADR-0047).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  countUnreadNotifications,
  createDelivery,
  createNotification,
  getDelivery,
  getNotification,
  listNotificationDeliveries,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateDeliveryStatus,
} from '../../src/repositories/notifications';
import { createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const FIXED = new Date('2026-11-11T12:20:00Z');
const EARLIER = new Date('2026-11-10T08:00:00Z');
const LATER = new Date('2026-11-11T14:00:00Z');
const QUIET_END = new Date('2026-11-12T07:00:00Z');

const TABLES = ['notification_deliveries', 'notifications'];

const ENUMS: Record<string, string[]> = {
  delivery_channel: ['email', 'push'],
  delivery_status: ['scheduled', 'sent', 'deferred_quiet', 'capped', 'failed', 'skipped_pref'],
  notification_type: [
    'validation_soon',
    'course_ready',
    'global_quiz_today',
    'new_gap',
    'session_planned',
    'module_validated',
    'session_to_reschedule',
    'weekly_review',
    'milestone',
    'ai_cost_alert',
    'ai_task_failed',
    'export_ready',
    'group_invitation',
    'daily_digest',
    'relaunch',
    'planning_adjusted',
  ],
};

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec109_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

async function failureOfUserDb(
  fn: (tx: DbTx) => Promise<unknown>,
  userId: string,
): Promise<Failure> {
  try {
    await userDb({ userId }).run(fn);
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

function notificationInput(
  userId: string,
  overrides: Partial<Parameters<typeof createNotification>[1]> = {},
) {
  return {
    userId,
    type: 'daily_digest' as const,
    title: 'Votre programme du jour',
    body: 'Trois activités vous attendent aujourd’hui.',
    href: '/agenda',
    icon: 'calendar',
    ...overrides,
  };
}

async function insertRawNotification(
  tx: Queryable,
  userId: string,
  overrides: {
    href?: string;
    title?: string;
    body?: string;
    dedupeKey?: string | null;
    type?: string;
    icon?: string;
  } = {},
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.notifications (user_id, type, title, body, href, icon, dedupe_key)
    values (
      ${userId}::uuid,
      ${overrides.type ?? 'daily_digest'}::public.notification_type,
      ${overrides.title ?? 'Programme du jour'},
      ${overrides.body ?? 'Trois activités vous attendent aujourd’hui.'},
      ${overrides.href ?? '/agenda'},
      ${overrides.icon ?? 'calendar'},
      ${overrides.dedupeKey ?? null}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('notification non créée');
  return id;
}

/** Prepares one delivery row without the repository, to exercise the raw SQL constraints. */
async function insertRawDelivery(
  tx: Queryable,
  notificationId: string,
  options: {
    channel?: string;
    status?: string;
    scheduledFor?: Date | null;
    sentAt?: Date | null;
    error?: string | null;
  } = {},
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.notification_deliveries (
      notification_id, channel, status, scheduled_for, sent_at, error
    )
    values (
      ${notificationId}::uuid,
      ${options.channel ?? 'email'}::public.delivery_channel,
      ${options.status ?? 'scheduled'}::public.delivery_status,
      ${options.scheduledFor === undefined ? FIXED.toISOString() : options.scheduledFor === null ? null : options.scheduledFor.toISOString()}::timestamptz,
      ${options.sentAt === null || options.sentAt === undefined ? null : options.sentAt.toISOString()}::timestamptz,
      ${options.error ?? null}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('livraison non créée');
  return id;
}

async function countRows(tx: Queryable, table: string, userId: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where user_id = ${userId}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-109] notification persistence', () => {
  it('CA-1 — les deux tables, trois énumérations, contraintes, index, déclencheur et politiques existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('notifications', 'notification_deliveries')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(TABLES);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée sur les deux tables',
      ).toBe(true);

      for (const [name, values] of Object.entries(ENUMS)) {
        const rows = await tx.execute<Row>(sql`
          select e.enumlabel as label
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typnamespace = 'public'::regnamespace and t.typname = ${name}
          order by e.enumsortorder
        `);
        expect(
          rows.map((row) => String(row.label)),
          name,
        ).toEqual(values);
      }

      const constraints = await tx.execute<Row>(sql`
        select conname as name, contype as kind
        from pg_constraint
        where conrelid in (
          'public.notifications'::regclass,
          'public.notification_deliveries'::regclass
        )
      `);
      const names = constraints.map((row) => String(row.name));
      for (const expected of [
        'notifications_href_check',
        'notifications_title_check',
        'notifications_body_check',
        'notifications_icon_check',
        'notifications_dedupe_key_check',
        'notifications_user_id_dedupe_key_unique',
        'notification_deliveries_sent_at_check',
        'notification_deliveries_scheduled_for_check',
        'notification_deliveries_error_check',
        'notification_deliveries_notification_id_channel_unique',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('notifications', 'notification_deliveries')
      `);
      const byName = new Map(indexes.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'notifications_user_id_created_at_idx',
        'notifications_user_id_unread_idx',
        'notification_deliveries_status_scheduled_for_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      // EF-5 — newest first and the partial unread badge.
      expect(byName.get('notifications_user_id_created_at_idx') ?? '').toContain('created_at DESC');
      expect(byName.get('notifications_user_id_unread_idx') ?? '').toContain('WHERE');
      expect(byName.get('notifications_user_id_unread_idx') ?? '').toContain('read_at IS NULL');

      const triggers = await tx.execute<Row>(sql`
        select cl.relname as table, tg.tgname as name
        from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
          and cl.relname in ('notifications', 'notification_deliveries')
      `);
      expect(
        triggers.map((row) => `${String(row.table)}.${String(row.name)}`),
        'déclencheur de monotonie des livraisons',
      ).toEqual(['notification_deliveries.notification_deliveries_monotone']);

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name, pol.polcmd as command
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public'
          and cl.relname in ('notifications', 'notification_deliveries')
        order by cl.relname, pol.polname
      `);
      expect(policies.map((row) => `${String(row.table)}.${String(row.name)}`)).toEqual([
        'notification_deliveries.notification_deliveries_owner_select',
        'notifications.notifications_owner_all',
      ]);
      expect(
        policies.find((row) => row.name === 'notification_deliveries_owner_select')?.command,
        'lecture seule pour le propriétaire',
      ).toBe('r');

      // ET-1 — every instant is timestamptz, created_at has now() and dedupe/read_at are nullable.
      const types = await tx.execute<Row>(sql`
        select table_name, column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name = 'notifications' and column_name in ('read_at', 'created_at', 'dedupe_key'))
            or (table_name = 'notification_deliveries'
              and column_name in ('scheduled_for', 'sent_at'))
          )
        order by table_name, column_name
      `);
      expect(types).toEqual([
        {
          table_name: 'notification_deliveries',
          column_name: 'scheduled_for',
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
          column_default: null,
        },
        {
          table_name: 'notification_deliveries',
          column_name: 'sent_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
          column_default: null,
        },
        {
          table_name: 'notifications',
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
          column_default: 'now()',
        },
        {
          table_name: 'notifications',
          column_name: 'dedupe_key',
          data_type: 'text',
          is_nullable: 'YES',
          column_default: null,
        },
        {
          table_name: 'notifications',
          column_name: 'read_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
          column_default: null,
        },
      ]);
    });
  });

  it('CA-1 / CL-4 / CL-5 — href dangereux, bornes et états de livraison incohérents refusés', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);

      // CL-4 — the repository refuses before writing…
      await expect(
        createNotification(tx, notificationInput(user.id, { href: 'https://evil.example' })),
      ).rejects.toThrow(AppError);
      await expect(
        createNotification(tx, notificationInput(user.id, { href: 'javascript:alert(1)' })),
      ).rejects.toThrow(AppError);
      await expect(
        createNotification(tx, notificationInput(user.id, { title: '   ' })),
      ).rejects.toThrow(AppError);
      await expect(
        createNotification(tx, notificationInput(user.id, { body: 'x'.repeat(401) })),
      ).rejects.toThrow(AppError);
      // …and the database refuses a direct writer too.
      const externalHref = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { href: 'https://evil.example' }),
      );
      expect(externalHref.code).toBe('23514');
      expect(externalHref.message).toContain('notifications_href_check');
      const protocolRelative = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { href: '//evil.example' }),
      );
      expect(protocolRelative.code).toBe('23514');
      const javascriptHref = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { href: 'javascript:alert(1)' }),
      );
      expect(javascriptHref.code).toBe('23514');
      const longTitle = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { title: 'x'.repeat(121) }),
      );
      expect(longTitle.code).toBe('23514');
      expect(longTitle.message).toContain('notifications_title_check');
      const emptyBody = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { body: '   ' }),
      );
      expect(emptyBody.code).toBe('23514');

      const notificationId = await insertRawNotification(tx, user.id);

      // CL-5 — sent without sent_at, capped with sent_at and scheduled without instant.
      const sentWithoutInstant = await attempt(tx, () =>
        insertRawDelivery(tx, notificationId, { status: 'sent' }),
      );
      expect(sentWithoutInstant.code).toBe('23514');
      expect(sentWithoutInstant.message).toContain('notification_deliveries_sent_at_check');
      const cappedWithInstant = await attempt(tx, () =>
        insertRawDelivery(tx, notificationId, { status: 'capped', sentAt: FIXED }),
      );
      expect(cappedWithInstant.code).toBe('23514');
      const scheduledWithoutInstant = await attempt(tx, () =>
        insertRawDelivery(tx, notificationId, { status: 'scheduled', scheduledFor: null }),
      );
      expect(scheduledWithoutInstant.code).toBe('23514');
      expect(scheduledWithoutInstant.message).toContain(
        'notification_deliveries_scheduled_for_check',
      );

      // ET-5 — an error is a safe code, never an address.
      const unsafeError = await attempt(tx, () =>
        insertRawDelivery(tx, notificationId, { status: 'failed', error: 'user@test.learny.test' }),
      );
      expect(unsafeError.code).toBe('23514');
      expect(unsafeError.message).toContain('notification_deliveries_error_check');

      // CL-1 — a second delivery for the same channel is refused.
      await insertRawDelivery(tx, notificationId, {
        channel: 'email',
        status: 'sent',
        sentAt: FIXED,
      });
      const duplicate = await attempt(tx, () =>
        insertRawDelivery(tx, notificationId, {
          channel: 'email',
          status: 'failed',
          error: 'smtp_timeout',
        }),
      );
      expect(duplicate.code).toBe('23505');

      // EF-2 — the same dedupe key is unique per learner and null keys stay distinct.
      await insertRawNotification(tx, user.id, { dedupeKey: 'digest:2026-11-11' });
      const duplicateKey = await attempt(tx, () =>
        insertRawNotification(tx, user.id, { dedupeKey: 'digest:2026-11-11' }),
      );
      expect(duplicateKey.code).toBe('23505');
      expect(await attempt(tx, () => insertRawNotification(tx, user.id))).toEqual({
        code: '00000',
        message: '',
      });
      expect(await attempt(tx, () => insertRawNotification(tx, user.id))).toEqual({
        code: '00000',
        message: '',
      });
      expect(await countRows(tx, 'notifications', user.id)).toBe(4);
    });
  });

  it('CA-2 / EF-2 / CL-1 / CL-2 / CL-3 — déduplication, lecture préservée et clés indépendantes par utilisateur', async () => {
    await withRollback(async (tx) => {
      const alice = await createTestUser(tx, { firstName: 'Alice' });
      const bob = await createTestUser(tx, { firstName: 'Bob' });
      const input = notificationInput(alice.id, { dedupeKey: 'digest:2026-11-11' });

      const first = await createNotification(tx, input);
      expect(first.created).toBe(true);
      const second = await createNotification(tx, input);
      expect(second.created).toBe(false);
      expect(second.notification.id).toBe(first.notification.id);

      // EF-3 — the first delivery of a channel is created once.
      const email = await createDelivery(tx, {
        notificationId: first.notification.id,
        channel: 'email',
        status: 'sent',
        sentAt: FIXED,
      });
      expect(email.created).toBe(true);
      const replay = await createDelivery(tx, {
        notificationId: first.notification.id,
        channel: 'email',
        status: 'failed',
        error: 'smtp_timeout',
      });
      expect(replay.created).toBe(false);
      expect(replay.delivery.id).toBe(email.delivery.id);
      expect(replay.delivery.status).toBe('sent');

      // CL-3 — re-creating the event does not reset the read state.
      expect(
        await markNotificationRead(tx, {
          userId: alice.id,
          notificationId: first.notification.id,
          readAt: FIXED,
        }),
      ).toBe(1);
      const replayed = await createNotification(tx, input);
      expect(replayed.created).toBe(false);
      expect(replayed.notification.readAt?.toISOString()).toBe(FIXED.toISOString());

      // CL-2 — the same key for another learner creates an independent row.
      const bobNotification = await createNotification(tx, { ...input, userId: bob.id });
      expect(bobNotification.created).toBe(true);
      expect(bobNotification.notification.id).not.toBe(first.notification.id);

      // EF-2 — a null key never collides.
      const withoutKeyA = await createNotification(tx, notificationInput(alice.id));
      const withoutKeyB = await createNotification(tx, notificationInput(alice.id));
      expect(withoutKeyA.created).toBe(true);
      expect(withoutKeyB.created).toBe(true);
      expect(withoutKeyA.notification.id).not.toBe(withoutKeyB.notification.id);
    });
  });

  it('CA-2 / CL-1 — deux créations concurrentes avec la même clé ne produisent qu’une notification et une livraison par canal', async () => {
    // Deliberately outside withRollback: the two transactions must really commit and race.
    const seeded = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      return { userId: user.id };
    });

    try {
      const race = () =>
        serviceDb().transaction(async (tx) => {
          const notification = await createNotification(tx, {
            ...notificationInput(seeded.userId, { dedupeKey: 'session:2026-11-11' }),
            createdAt: FIXED,
          });
          const delivery = await createDelivery(tx, {
            notificationId: notification.notification.id,
            channel: 'email',
            status: 'sent',
            sentAt: FIXED,
          });
          return { notification, delivery };
        });

      const settled = await Promise.all([race(), race()]);
      expect(settled.filter((result) => result.notification.created)).toHaveLength(1);
      expect(settled.filter((result) => result.delivery.created)).toHaveLength(1);
      expect(settled[0].notification.notification.id).toBe(settled[1].notification.notification.id);

      const notifications = await serviceDb().execute<Row>(sql`
        select id::text as id from public.notifications
        where user_id = ${seeded.userId}::uuid
      `);
      expect(notifications).toHaveLength(1);
      const deliveries = await serviceDb().execute<Row>(sql`
        select id::text as id, channel::text as channel
        from public.notification_deliveries
        where notification_id = ${String(notifications[0]?.id)}::uuid
      `);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.channel).toBe('email');
      // CL-3 — the winner's creation instant and read state are kept; the conflict changed nothing.
      const created = await serviceDb().execute<Row>(sql`
        select created_at at time zone 'UTC' as created_at from public.notifications
        where id = ${String(notifications[0]?.id)}::uuid
      `);
      expect(String(created[0]?.created_at)).toContain('2026-11-11 12:20:00');
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seeded.userId}::uuid`);
    }
  });

  it('CA-3 / EF-4 / BR-NOT-04 — défauts de SPEC-102 préservés, compteur, filtre non lu et marquage', async () => {
    await withRollback(async (tx) => {
      const alice = await createTestUser(tx, { firstName: 'Alice', timezone: 'Europe/Paris' });
      const bob = await createTestUser(tx, { firstName: 'Bob', timezone: 'Europe/Paris' });

      // BR-NOT-04 — the sign-up trigger still creates the defaults of SPEC-102.
      const settings = await tx.execute<Row>(sql`
        select channel_email, channel_push, type_revision, type_validation, type_course,
               type_gap, type_planning, type_relaunch, digest_time::text as digest_time,
               quiet_start::text as quiet_start, quiet_end::text as quiet_end,
               weekend_quiet, max_per_day
        from public.notification_settings
        where user_id = ${alice.id}::uuid
      `);
      expect(settings).toEqual([
        {
          channel_email: true,
          channel_push: true,
          type_revision: true,
          type_validation: true,
          type_course: true,
          type_gap: true,
          type_planning: true,
          type_relaunch: true,
          digest_time: '08:00:00',
          quiet_start: '21:00:00',
          quiet_end: '08:00:00',
          weekend_quiet: true,
          max_per_day: 5,
        },
      ]);

      const first = await createNotification(tx, {
        ...notificationInput(alice.id, { type: 'weekly_review', title: 'Votre bilan' }),
        createdAt: EARLIER,
      });
      const second = await createNotification(tx, {
        ...notificationInput(alice.id, { type: 'new_gap', title: 'Nouvelle lacune' }),
        createdAt: FIXED,
      });
      const third = await createNotification(tx, {
        ...notificationInput(alice.id, { type: 'course_ready', title: 'Votre cours' }),
        createdAt: LATER,
      });
      const foreign = await createNotification(tx, notificationInput(bob.id));

      // CL-6 / ET-4 — a disabled push preference keeps the in-app row and a skipped delivery;
      // the defaults themselves are never rewritten by the notification rows.
      const skipped = await createDelivery(tx, {
        notificationId: second.notification.id,
        channel: 'push',
        status: 'skipped_pref',
        error: 'no_subscription',
      });
      expect(skipped.delivery.status).toBe('skipped_pref');
      expect(skipped.delivery.sentAt).toBeNull();
      const after = await tx.execute<Row>(sql`
        select channel_email, channel_push, type_gap, digest_time::text as digest_time,
               quiet_start::text as quiet_start, quiet_end::text as quiet_end,
               weekend_quiet, max_per_day
        from public.notification_settings
        where user_id = ${alice.id}::uuid
      `);
      expect(after[0]).toMatchObject({
        channel_email: true,
        channel_push: true,
        type_gap: true,
        digest_time: '08:00:00',
        quiet_start: '21:00:00',
        quiet_end: '08:00:00',
        weekend_quiet: true,
        max_per_day: 5,
      });

      // EF-4 / EF-5 — newest first, unread counter, all|unread filters.
      const all = await listNotifications(tx, { userId: alice.id });
      expect(all.map((row) => row.id)).toEqual([
        third.notification.id,
        second.notification.id,
        first.notification.id,
      ]);
      expect(await countUnreadNotifications(tx, { userId: alice.id })).toBe(3);
      expect((await listNotifications(tx, { userId: alice.id, filter: 'unread' })).length).toBe(3);
      expect(
        (await listNotifications(tx, { userId: alice.id, filter: 'unread', limit: 2 })).length,
      ).toBe(2);
      expect(
        (await listNotifications(tx, { userId: alice.id, offset: 2 })).map((row) => row.id),
      ).toEqual([first.notification.id]);

      // CL-7 — another learner's identifier changes nothing and reveals nothing.
      expect(
        await markNotificationRead(tx, {
          userId: alice.id,
          notificationId: foreign.notification.id,
          readAt: FIXED,
        }),
      ).toBe(0);
      expect(
        await getNotification(tx, { userId: alice.id, notificationId: foreign.notification.id }),
      ).toBeNull();

      expect(
        await markNotificationRead(tx, {
          userId: alice.id,
          notificationId: second.notification.id,
          readAt: FIXED,
        }),
      ).toBe(1);
      // Marking an already-read row is a no-op.
      expect(
        await markNotificationRead(tx, {
          userId: alice.id,
          notificationId: second.notification.id,
          readAt: LATER,
        }),
      ).toBe(0);
      expect(await countUnreadNotifications(tx, { userId: alice.id })).toBe(2);
      expect(
        (await listNotifications(tx, { userId: alice.id, filter: 'unread' })).map((row) => row.id),
      ).toEqual([third.notification.id, first.notification.id]);

      expect(await markAllNotificationsRead(tx, { userId: alice.id, readAt: LATER })).toBe(2);
      expect(await countUnreadNotifications(tx, { userId: alice.id })).toBe(0);
      expect((await listNotifications(tx, { userId: alice.id, filter: 'unread' })).length).toBe(0);
      // Bob's notification was never touched.
      expect(await countUnreadNotifications(tx, { userId: bob.id })).toBe(1);
    });
  });

  it('ET-3 / ET-5 / EF-5 — journal par notification et canal, transitions monotones', async () => {
    await withRollback(async (tx) => {
      const alice = await createTestUser(tx, { firstName: 'Alice' });
      const bob = await createTestUser(tx, { firstName: 'Bob' });
      const notification = await createNotification(
        tx,
        notificationInput(alice.id, { dedupeKey: 'quiet:2026-11-11' }),
      );

      const email = await createDelivery(tx, {
        notificationId: notification.notification.id,
        channel: 'email',
        status: 'sent',
        sentAt: FIXED,
      });
      await createDelivery(tx, {
        notificationId: notification.notification.id,
        channel: 'push',
        status: 'deferred_quiet',
        scheduledFor: QUIET_END,
      });

      const journal = await listNotificationDeliveries(tx, {
        userId: alice.id,
        notificationId: notification.notification.id,
      });
      expect(journal.map((row) => row.channel)).toEqual(['email', 'push']);
      expect(journal.map((row) => row.status)).toEqual(['sent', 'deferred_quiet']);
      expect(
        (
          await listNotificationDeliveries(tx, {
            userId: alice.id,
            notificationId: notification.notification.id,
            channel: 'push',
          })
        ).map((row) => row.status),
      ).toEqual(['deferred_quiet']);

      // CL-7 — Bob cannot read the journal of Alice's notification.
      expect(
        await listNotificationDeliveries(tx, {
          userId: bob.id,
          notificationId: notification.notification.id,
        }),
      ).toEqual([]);

      // ET-5 — `sent` is final: reopening it or rewriting its instant is refused.
      const reopen = await attempt(tx, () =>
        updateDeliveryStatus(tx, {
          deliveryId: email.delivery.id,
          status: 'scheduled',
          scheduledFor: QUIET_END,
        }),
      );
      expect(reopen.code).toBe('23514');
      expect(reopen.message).toContain('notification_delivery_sent_is_final');
      const rewriteInstant = await attempt(tx, () =>
        updateDeliveryStatus(tx, {
          deliveryId: email.delivery.id,
          status: 'sent',
          sentAt: LATER,
        }),
      );
      expect(rewriteInstant.code).toBe('23514');
      expect(rewriteInstant.message).toContain('notification_delivery_sent_at_immutable');

      // A deferred delivery can become sent once, and its journal stays unique.
      const deferred = await getDelivery(tx, {
        notificationId: notification.notification.id,
        channel: 'push',
      });
      if (deferred === null) throw new Error('livraison différée absente');
      const updated = await updateDeliveryStatus(tx, {
        deliveryId: deferred.id,
        status: 'sent',
        sentAt: LATER,
      });
      expect(updated.status).toBe('sent');
      expect(updated.sentAt?.toISOString()).toBe(LATER.toISOString());
      // ET-5 — the identity of a delivery never changes; the `sent_at` equivalence holds.
      const invalid = await attempt(tx, () =>
        tx.execute(sql`
          update public.notification_deliveries
          set status = 'capped', sent_at = null
          where id = ${deferred.id}::uuid
        `),
      );
      expect(invalid.code).toBe('23514');

      // ET-4 — an incomplete delivery is rejected before touching the journal.
      await expect(
        createDelivery(tx, {
          notificationId: notification.notification.id,
          channel: 'push',
          status: 'sent',
        }),
      ).rejects.toThrow(AppError);
    });
  });

  it('CA-4 / CL-7 — deux JWT ne lisent ni ne modifient les notifications et livraisons de l’autre', async () => {
    const seeded = await serviceDb().transaction(async (tx) => {
      const alice = await createTestUser(tx, { firstName: 'Alice' });
      const bob = await createTestUser(tx, { firstName: 'Bob' });
      const aliceNotification = await createNotification(
        tx,
        notificationInput(alice.id, { dedupeKey: 'alice:1' }),
      );
      const bobNotification = await createNotification(
        tx,
        notificationInput(bob.id, { dedupeKey: 'bob:1' }),
      );
      const aliceDelivery = await createDelivery(tx, {
        notificationId: aliceNotification.notification.id,
        channel: 'email',
        status: 'sent',
        sentAt: FIXED,
      });
      await createDelivery(tx, {
        notificationId: bobNotification.notification.id,
        channel: 'email',
        status: 'sent',
        sentAt: FIXED,
      });
      return {
        aliceId: alice.id,
        bobId: bob.id,
        aliceNotificationId: aliceNotification.notification.id,
        bobNotificationId: bobNotification.notification.id,
        aliceDeliveryId: aliceDelivery.delivery.id,
      };
    });

    try {
      const aliceView = await userDb({ userId: seeded.aliceId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.notifications) as notifications,
            (select count(*)::int from public.notification_deliveries) as deliveries,
            (select count(*)::int from public.notifications where user_id = ${seeded.bobId}::uuid) as foreign_notifications,
            (select count(*)::int from public.notification_deliveries d
              join public.notifications n on n.id = d.notification_id
              where n.user_id = ${seeded.bobId}::uuid) as foreign_deliveries
        `);
        return rows[0];
      });
      expect(aliceView).toMatchObject({
        notifications: 1,
        deliveries: 1,
        foreign_notifications: 0,
        foreign_deliveries: 0,
      });

      // CL-7 — a foreign identifier affects zero rows.
      const updated = await userDb({ userId: seeded.aliceId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          update public.notifications set read_at = ${FIXED.toISOString()}::timestamptz
          where id = ${seeded.bobNotificationId}::uuid
          returning id::text as id
        `);
        return rows.length;
      });
      expect(updated).toBe(0);
      const bobStillUnread = await serviceDb().execute<Row>(sql`
        select read_at from public.notifications where id = ${seeded.bobNotificationId}::uuid
      `);
      expect(bobStillUnread[0]?.read_at).toBeNull();

      // ET-4 — Alice cannot insert a notification for Bob, nor write any delivery journal line.
      const forgedNotification = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.notifications (user_id, type, title, body, href, icon)
            values (${seeded.bobId}::uuid, 'new_gap', 'Faux', 'Faux', '/agenda', 'bell')
          `),
        seeded.aliceId,
      );
      expect(forgedNotification.code).toBe('42501');
      const forgedDelivery = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.notification_deliveries (notification_id, channel, status, sent_at)
            values (${seeded.aliceNotificationId}::uuid, 'push', 'sent', now())
          `),
        seeded.aliceId,
      );
      expect(forgedDelivery.code).toBe('42501');

      // Bob's own journal remains readable by Bob.
      const bobView = await userDb({ userId: seeded.bobId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select count(*)::int as count from public.notification_deliveries
        `);
        return rows[0]?.count;
      });
      expect(bobView).toBe(1);
    } finally {
      await serviceDb().execute(sql`
        delete from auth.users where id in (${seeded.aliceId}::uuid, ${seeded.bobId}::uuid)
      `);
    }
  });

  it('ET-1 / CL-8 — la suppression du compte emporte la boîte et le journal, les instants restent UTC', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const notification = await createNotification(
        tx,
        notificationInput(user.id, { dedupeKey: 'utc:1' }),
      );
      await createDelivery(tx, {
        notificationId: notification.notification.id,
        channel: 'email',
        status: 'deferred_quiet',
        scheduledFor: QUIET_END,
      });

      const instants = await tx.execute<Row>(sql`
        select scheduled_for at time zone 'UTC' as scheduled_for,
               created_at at time zone 'UTC' as created_at
        from public.notification_deliveries d
        join public.notifications n on n.id = d.notification_id
        where n.user_id = ${user.id}::uuid
      `);
      expect(String(instants[0]?.scheduled_for)).toContain('2026-11-12 07:00:00');
      expect(String(instants[0]?.created_at)).toBeTruthy();

      // ET-1 — deleting the profile removes the notification and its delivery in cascade.
      await tx.execute(sql`delete from auth.users where id = ${user.id}::uuid`);
      expect(await countRows(tx, 'notifications', user.id)).toBe(0);
      const deliveries = await tx.execute<Row>(sql`
        select count(*)::int as count from public.notification_deliveries
        where notification_id = ${notification.notification.id}::uuid
      `);
      expect(deliveries[0]?.count).toBe(0);
    });
  });
});
