// Integration tests of the personal-data services (SPEC-211 §12, CA-1 to CA-5).
//
// Real Postgres (RLS, cascades, constraints), the real export job and the real nightly deletion.
// Storage, Auth and the e-mail transport are injected: the ZIP is captured in memory and read with
// a minimal central-directory reader, the Auth admin deletes the real `auth.users` row (its cascade
// is what the information_schema check verifies), the e-mails stay in the memory outbox. The clock
// is frozen at 2026-11-11T12:20:00Z and only advanced explicitly (ADR-0047).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import {
  closeDb,
  createGroup,
  exportPath,
  joinGroup,
  serviceDb,
  sql,
  type StorageGateway,
} from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  createMemoryExportDeps,
  remainingPersonalRows,
  runAccountDeletion,
  runDataExport,
  runExportsPurge,
  setEventSender,
  type AccountAdmin,
  type DeletionDeps,
} from '@learny/jobs';
import {
  clearOutbox,
  listOutbox,
  memoryTransport,
  setTransport,
  type OutboxEntry,
} from '@learny/notifications/email';

import { createServiceContext } from '../../src/context';
import {
  cancelDeletion,
  downloadExport,
  getExport,
  requestExport,
  scheduleDeletion,
  type PersonalDataDeps,
} from '../../src/personal-data/index';
import { readZip } from '../support/zip';

const PREFIX = 'sdd-211-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

class TestClock implements Clock {
  private current = new Date(FIXED);
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
  set(instant: Date): void {
    this.current = new Date(instant);
  }
}

const directStep = {
  run: <T>(_id: string, body: () => Promise<T>): Promise<T> => body(),
};

function context(clock: TestClock, userId: string) {
  return createServiceContext({
    userId,
    email: `${PREFIX}${userId.slice(0, 8)}@test.learny.test`,
    requestId: randomUUID(),
    clock,
  });
}

function systemContext(clock: TestClock) {
  return {
    userId: null,
    requestId: randomUUID(),
    db: null,
    clock,
    logger: createServiceContext({ userId: null, requestId: randomUUID(), clock }).logger,
    sdb: serviceDb(),
  };
}

function storageDeps(): PersonalDataDeps {
  const gateway: StorageGateway = {
    signUpload: () => Promise.resolve('https://storage.test/upload'),
    signRead: () => Promise.resolve('https://storage.test/signed?token=test'),
    remove: () => Promise.resolve(),
    list: () => Promise.resolve([]),
  };
  return { gateway, accessToken: () => 'user-token' };
}

function adminOf(options: { fail?: boolean } = {}): AccountAdmin {
  return {
    async deleteUser(userId) {
      if (options.fail === true) throw new Error('Auth indisponible (simulé)');
      await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
    },
    async exists(userId) {
      const rows = await serviceDb().execute<{ present: boolean }>(
        sql`select exists (select 1 from auth.users where id = ${userId}::uuid) as present`,
      );
      return rows[0]?.present === true;
    },
  };
}

function deletionDeps(removed: string[], options: { fail?: boolean } = {}): DeletionDeps {
  return {
    removeObject: (bucket, path) => {
      removed.push(`${bucket}/${path}`);
      return Promise.resolve();
    },
    admin: adminOf(options),
  };
}

async function createUser(label: string): Promise<{ userId: string; email: string }> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email })).id,
  );
  return { userId, email };
}

async function cleanup(): Promise<void> {
  // A formation owned by a test user cascades its group and memberships; without this, the
  // `group_owner_cannot_leave` trigger refuses the deletion of an owner still in a group.
  await serviceDb().execute(sql`
    delete from public.formations
    where owner_id in (select id from auth.users where email like ${`${PREFIX}%@test.learny.test`})
  `);
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

interface Seed {
  formationId: string;
  moduleId: string;
  chapterId: string;
  notionId: string;
  resourcePath: string;
  noteTitle: string;
}

async function seedLearner(userId: string, files: Map<string, Uint8Array>): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    const chapterId = programme.chapterIds[0];
    const notionId = programme.notionIds[0];
    if (moduleId === undefined || chapterId === undefined || notionId === undefined) {
      throw new Error('programme incomplet');
    }
    await createTestCourse(tx, { ownerId: userId, moduleId, sectionsPerChapter: 1 });
    const resourcePath = `${userId}/${randomUUID()}/Guide FI.pdf`;
    files.set(resourcePath, new TextEncoder().encode('%PDF-1.7 apport de test'));
    await tx.execute(sql`
      insert into public.resources
        (owner_id, formation_id, chapter_id, kind, title, storage_path, mime, size_bytes, status, metadata)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid, 'pdf',
        ${'Guide FI'}, ${resourcePath}, 'application/pdf', ${18}, 'ready', '{}'::jsonb
      )
    `);
    await tx.execute(sql`
      insert into public.resources
        (owner_id, formation_id, chapter_id, kind, title, content_text, metadata)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid, 'note',
        ${'Mémo partie double'}, ${'Débit = emploi, crédit = ressource.'}, '{}'::jsonb
      )
    `);
    await tx.execute(sql`
      insert into public.notion_states (user_id, notion_id, fsrs, mastery)
      values (
        ${userId}::uuid,
        ${notionId}::uuid,
        '{"due":"2026-11-12T12:20:00.000Z","stability":3,"difficulty":5,"elapsed_days":1,"scheduled_days":3,"reps":2,"lapses":0,"state":2,"last_review":"2026-11-11T12:20:00.000Z"}'::jsonb,
        75
      )
    `);
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying)
      values (${userId}::uuid, '2026-11-11', 90, true)
    `);
    return {
      formationId: programme.formationId,
      moduleId,
      chapterId,
      notionId,
      resourcePath,
      noteTitle: 'Mémo partie double',
    };
  });
}

async function shareFormation(
  ownerId: string,
  memberId: string,
  formationId: string,
  clock: TestClock,
): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    const group = await createGroup(tx, { formationId, ownerId, now: clock.now() });
    await joinGroup(tx, { inviteCode: group.inviteCode, userId: memberId, now: clock.now() });
  });
}

beforeEach(() => {
  setEventSender({ send: () => Promise.resolve() });
  setTransport(memoryTransport);
  clearOutbox();
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-211] export et suppression', () => {
  it('CA-1, CA-2 — export complet sous RLS, e-mail unique, accès propriétaire puis expiration', async () => {
    const clock = new TestClock();
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const files = new Map<string, Uint8Array>();
    const seed = await seedLearner(alice.userId, files);
    await seedLearner(bob.userId, files);
    await shareFormation(alice.userId, bob.userId, seed.formationId, clock);
    // Bob's own apport inside the shared formation: it must never enter Alice's archive (ET-3).
    await serviceDb().execute(sql`
      insert into public.resources
        (owner_id, formation_id, chapter_id, kind, title, content_text, metadata)
      values (
        ${bob.userId}::uuid, ${seed.formationId}::uuid, ${seed.chapterId}::uuid, 'note',
        ${'Secret de Bob'}, ${'Notes privées de Bob.'}, '{}'::jsonb
      )
    `);

    const client = context(clock, alice.userId);
    const accepted = await requestExport(client);
    if (!accepted.ok) throw accepted.error;
    expect(accepted.value.status).toBe('queued');

    // CL-1 — a double click returns the same export and enqueues nothing new.
    const replay = await requestExport(client);
    if (!replay.ok) throw replay.error;
    expect(replay.value.exportId).toBe(accepted.value.exportId);

    const deps = createMemoryExportDeps(files);
    const outcome = await runDataExport(
      {
        ctx: { ...systemContext(clock), clock },
        step: directStep,
        logger: client.logger,
        userId: alice.userId,
        exportId: accepted.value.exportId,
      },
      deps,
    );
    expect(outcome.status).toBe('done');
    expect(outcome.sizeBytes).toBeGreaterThan(0);
    expect(outcome.entries).toEqual(
      expect.arrayContaining([
        'README.txt',
        'settings.json',
        'results.json',
        'conversations.json',
        'formations/sap-s-4hana-finance/programme.json',
        'formations/sap-s-4hana-finance/01-partie-1/cours.md',
        'apports/sap-s-4hana-finance/01-partie-1/Guide FI.pdf',
        'apports/sap-s-4hana-finance/01-partie-1/Memo partie double.txt',
      ]),
    );

    const upload = deps.uploads.get(`exports/${exportPath(alice.userId, accepted.value.exportId)}`);
    expect(upload).toBeDefined();
    const entries = readZip(upload?.bytes ?? new Uint8Array());
    expect([...entries.keys()]).toEqual(outcome.entries);
    const settings = JSON.parse(entries.get('settings.json') ?? '{}') as Record<string, unknown>;
    expect(JSON.stringify(settings)).not.toMatch(/apiKey|encryptedKey|password|token/);
    expect(entries.get('README.txt')).toContain('Export des données personnelles Learny');
    expect(entries.get('results.json')).toContain('notionStates');
    // ET-3 — the other member's apport and private data never enter Alice's archive.
    expect([...entries.keys()].some((name) => name.toLowerCase().includes('secret de bob'))).toBe(
      false,
    );
    expect([...entries.keys()].some((name) => name.includes('Guide FI'))).toBe(true);

    const templateOf = (entry: OutboxEntry): string | undefined =>
      entry.message.tags.find((tag) => tag.name === 'template')?.value;
    const emails = listOutbox().filter((entry) => entry.message.to === alice.email);
    expect(emails.filter((entry) => templateOf(entry) === 'export_ready')).toHaveLength(1);
    const notifications = await serviceDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.notifications
      where user_id = ${alice.userId}::uuid and type = 'export_ready'
    `);
    expect(notifications[0]?.n).toBe(1);

    // CA-2 — the owner gets a fresh ten-minute signed URL.
    const view = await getExport(client, storageDeps(), accepted.value.exportId);
    if (!view.ok) throw view.error;
    expect(view.value.status).toBe('done');
    expect(view.value.downloadUrl).toBe('https://storage.test/signed?token=test');
    const redirect = await downloadExport(client, storageDeps(), accepted.value.exportId);
    expect(redirect.ok).toBe(true);

    // CL-5 — another learner sees a 404, not the existence of the export.
    const foreign = await getExport(
      context(clock, bob.userId),
      storageDeps(),
      accepted.value.exportId,
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');

    // CL-4 — after seven days the archive is expired and the route answers 410.
    clock.advance(8 * DAY_MS);
    const expired = await getExport(client, storageDeps(), accepted.value.exportId);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.code).toBe('EXPORT_EXPIRED');
    const expiredDownload = await downloadExport(client, storageDeps(), accepted.value.exportId);
    expect(expiredDownload.ok).toBe(false);
    if (!expiredDownload.ok) expect(expiredDownload.error.code).toBe('EXPORT_EXPIRED');

    // EF-8 — the purge removes the object and the row once expired for more than 24 h.
    clock.advance(2 * DAY_MS);
    const removed: string[] = [];
    const purge = await runExportsPurge(
      { ctx: systemContext(clock), step: directStep },
      deletionDeps(removed),
    );
    expect(purge.rows).toBeGreaterThanOrEqual(1);
    expect(removed).toContain(`exports/${exportPath(alice.userId, accepted.value.exportId)}`);
    const rows = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.data_exports where id = ${accepted.value.exportId}::uuid`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('CA-1 — trois demandes par jour local, puis EXPORT_LIMIT_REACHED', async () => {
    const clock = new TestClock();
    const alice = await createUser('limit');
    const files = new Map<string, Uint8Array>();
    await seedLearner(alice.userId, files);
    const client = context(clock, alice.userId);
    const deps = createMemoryExportDeps(files);
    for (let index = 0; index < 3; index += 1) {
      const accepted = await requestExport(client);
      if (!accepted.ok) throw accepted.error;
      await runDataExport(
        {
          ctx: { ...systemContext(clock), clock },
          step: directStep,
          logger: client.logger,
          userId: alice.userId,
          exportId: accepted.value.exportId,
        },
        deps,
      );
    }
    const refused = await requestExport(client);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe('EXPORT_LIMIT_REACHED');
      expect(refused.error.detail).toBe(
        'Vous avez déjà demandé 3 exports aujourd’hui. Réessayez demain.',
      );
    }
    // The limit is per local day: the next day starts a new count.
    clock.advance(DAY_MS);
    const next = await requestExport(client);
    expect(next.ok).toBe(true);
  });

  it('EF-4 — un job de plus de quinze minutes passe failed sans e-mail', async () => {
    const clock = new TestClock();
    const alice = await createUser('timeout');
    const files = new Map<string, Uint8Array>();
    await seedLearner(alice.userId, files);
    const client = context(clock, alice.userId);
    const accepted = await requestExport(client);
    if (!accepted.ok) throw accepted.error;
    clock.advance(16 * 60 * 1000);
    await expect(
      runDataExport(
        {
          ctx: { ...systemContext(clock), clock },
          step: directStep,
          logger: client.logger,
          userId: alice.userId,
          exportId: accepted.value.exportId,
        },
        createMemoryExportDeps(files),
      ),
    ).rejects.toThrow(/export_timeout/);
    const rows = await serviceDb().execute<{ status: string; error: string | null }>(sql`
      select status::text as status, error from public.data_exports
      where id = ${accepted.value.exportId}::uuid
    `);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.error).toContain('quinze minutes');
    expect(
      listOutbox().filter(
        (entry) =>
          entry.message.to === alice.email &&
          entry.message.tags.some((tag) => tag.name === 'template' && tag.value === 'export_ready'),
      ),
    ).toHaveLength(0);
  });

  it('CA-3 — programmation et annulation idempotentes, e-mail de la date locale', async () => {
    const clock = new TestClock();
    const alice = await createUser('schedule');
    const client = context(clock, alice.userId);

    const first = await scheduleDeletion(client);
    if (!first.ok) throw first.error;
    expect(first.value.scheduledFor).toBe(new Date(FIXED.getTime() + 30 * DAY_MS).toISOString());
    const second = await scheduleDeletion(client);
    if (!second.ok) throw second.error;
    expect(second.value.scheduledFor).toBe(first.value.scheduledFor);
    const scheduled = listOutbox().filter((entry) => entry.message.to === alice.email);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.message.text).toContain('décembre');

    const cancelled = await cancelDeletion(client);
    expect(cancelled.ok).toBe(true);
    const again = await cancelDeletion(client);
    expect(again.ok).toBe(true);
    const rows = await serviceDb().execute<{
      requested: Date | null;
      scheduled: Date | null;
    }>(sql`
      select deletion_requested_at as requested, deletion_scheduled_for as scheduled
      from public.profiles where id = ${alice.userId}::uuid
    `);
    expect(rows[0]?.requested).toBeNull();
    expect(rows[0]?.scheduled).toBeNull();
  });

  it('CA-4, CA-5 — J+30 : cascade complète, formation transmise, ai_calls anonymisé, e-mail final', async () => {
    const clock = new TestClock();
    const alice = await createUser('delete');
    const bob = await createUser('heir');
    const files = new Map<string, Uint8Array>();
    const seed = await seedLearner(alice.userId, files);
    await seedLearner(bob.userId, files);
    await shareFormation(alice.userId, bob.userId, seed.formationId, clock);
    await serviceDb().execute(sql`
      insert into public.ai_calls (user_id, task, provider, model, status)
      values (${alice.userId}::uuid, 'course', 'anthropic', 'claude-test', 'ok')
    `);
    const client = context(clock, alice.userId);
    const scheduled = await scheduleDeletion(client);
    if (!scheduled.ok) throw scheduled.error;

    clock.advance(31 * DAY_MS);
    const removed: string[] = [];
    const outcome = await runAccountDeletion(
      { ctx: systemContext(clock), step: directStep, logger: client.logger, userId: alice.userId },
      deletionDeps(removed),
    );
    expect(outcome.deleted).toBe(true);
    expect(outcome.authStatus).toBe('supprimé');
    expect(removed).toContain(`resources/${seed.resourcePath}`);
    const rows = await remainingPersonalRows(alice.userId);
    expect(rows.every((row) => row.remaining === 0)).toBe(true);
    const profile = await serviceDb().execute<{ present: boolean }>(
      sql`select exists (select 1 from public.profiles where id = ${alice.userId}::uuid) as present`,
    );
    expect(profile[0]?.present).toBe(false);

    const auth = await serviceDb().execute<{ present: boolean }>(
      sql`select exists (select 1 from auth.users where id = ${alice.userId}::uuid) as present`,
    );
    expect(auth[0]?.present).toBe(false);
    const anonymised = await serviceDb().execute<{ user_id: string | null }>(
      sql`select user_id::text as user_id from public.ai_calls where model = 'claude-test'`,
    );
    expect(anonymised[0]?.user_id).toBeNull();

    // CL-9 — the shared formation went to the oldest remaining member.
    const formation = await serviceDb().execute<{ owner_id: string }>(
      sql`select owner_id::text as owner_id from public.formations where id = ${seed.formationId}::uuid`,
    );
    expect(formation[0]?.owner_id).toBe(bob.userId);
    const bobResource = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.resources where owner_id = ${bob.userId}::uuid`,
    );
    expect(bobResource[0]?.n).toBe(2);

    const templateOf = (entry: OutboxEntry): string | undefined =>
      entry.message.tags.find((tag) => tag.name === 'template')?.value;
    const emails = listOutbox().filter((entry) => entry.message.to === alice.email);
    expect(emails.filter((entry) => templateOf(entry) === 'deletion_scheduled')).toHaveLength(1);
    expect(emails.filter((entry) => templateOf(entry) === 'deletion_completed')).toHaveLength(1);
  });

  it('CA-5 — annulation à J+29 23:59 et reprise après échec de deleteUser', async () => {
    const clock = new TestClock();
    const alice = await createUser('retry');
    const files = new Map<string, Uint8Array>();
    await seedLearner(alice.userId, files);
    const client = context(clock, alice.userId);

    const scheduled = await scheduleDeletion(client);
    if (!scheduled.ok) throw scheduled.error;
    clock.advance(29 * DAY_MS + 11 * 60 * 60 * 1000 + 39 * 60 * 1000);
    await cancelDeletion(client);
    const cancelled = await runAccountDeletion(
      { ctx: systemContext(clock), step: directStep, logger: client.logger, userId: alice.userId },
      deletionDeps([]),
    );
    expect(cancelled.deleted).toBe(false);
    const stillThere = await serviceDb().execute<{ present: boolean }>(
      sql`select exists (select 1 from public.profiles where id = ${alice.userId}::uuid) as present`,
    );
    expect(stillThere[0]?.present).toBe(true);

    // CL-8 — a failed Auth deletion leaves the request in place; the next night completes it once.
    const again = await scheduleDeletion(client);
    if (!again.ok) throw again.error;
    clock.advance(31 * DAY_MS);
    await expect(
      runAccountDeletion(
        {
          ctx: systemContext(clock),
          step: directStep,
          logger: client.logger,
          userId: alice.userId,
        },
        deletionDeps([], { fail: true }),
      ),
    ).rejects.toThrow(/Auth/);
    const emailsAfterFailure = listOutbox().filter(
      (entry) => entry.message.to === alice.email && entry.message.text.includes('supprimé'),
    );
    expect(emailsAfterFailure).toHaveLength(0);
    const retried = await runAccountDeletion(
      { ctx: systemContext(clock), step: directStep, logger: client.logger, userId: alice.userId },
      deletionDeps([]),
    );
    expect(retried.deleted).toBe(true);
    expect(retried.tables.every((row) => row.remaining === 0)).toBe(true);
    const completed = listOutbox().filter(
      (entry) => entry.message.to === alice.email && entry.message.text.includes('supprimé'),
    );
    expect(completed).toHaveLength(1);
  });
});
