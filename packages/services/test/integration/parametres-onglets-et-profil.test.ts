// Integration tests of the settings-screen service (SPEC-707 §12, CA-1 to CA-4).
//
// Real Postgres with RLS (Supabase local), the real profile and rhythm tables, the real deletion
// request of SPEC-211 and a real `data_exports` row. The clock is frozen at 2026-11-11T12:20:00Z
// (ADR-0047) and the AI stays mocked (ADR-0048): the capacity writes no AI call. Users are created
// by factory with the `sdd-707-` prefix and deleted in afterEach, cascade included.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import { getSettingsState, updateSettingsProfile } from '../../src/parametres-onglets-et-profil';
import { cancelDeletion, scheduleDeletion } from '../../src/personal-data';

const PREFIX = 'sdd-707-';
const FIXED = createFixedClock();

interface TestUser {
  userId: string;
  email: string;
}

const createdUsers: string[] = [];

async function createUser(label: string, firstName: string | null = null): Promise<TestUser> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) =>
      (await createTestUser(tx, { email, ...(firstName === null ? {} : { firstName }) })).id,
  );
  createdUsers.push(userId);
  return { userId, email };
}

function context(user: TestUser) {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: FIXED,
  });
}

async function cleanup(): Promise<void> {
  if (createdUsers.length === 0) return;
  await serviceDb().execute(
    sql`delete from auth.users where id = any(${sql.raw(`array[${createdUsers.map((id) => `'${id}'::uuid`).join(',')}]`)})`,
  );
  createdUsers.length = 0;
}

beforeEach(() => {
  createdUsers.length = 0;
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-707] service et API', () => {
  it('CA-1, EF-2 — lit le profil, le rythme par défaut et l’état des données', async () => {
    const user = await createUser('read');
    const result = await getSettingsState(context(user));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.me.email).toBe(user.email);
    expect(result.value.me.firstName).toBeNull();
    expect(result.value.rhythm).toEqual({
      hoursPerDay: 2,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['soir'],
    });
    expect(result.value.deletionScheduledFor).toBeNull();
    expect(result.value.export).toBeNull();
    expect(result.value.createdAt).toBeTruthy();
    expect(result.value.activeFormationCount).toBe(0);
    expect(result.value.updatedAt).toBeTruthy();
  });

  it('CA-2, ET-3 — enregistre le profil et le rythme en une transaction', async () => {
    const user = await createUser('save');
    const before = await getSettingsState(context(user));
    if (!before.ok) throw before.error;
    const result = await updateSettingsProfile(context(user), {
      firstName: 'Alex',
      lastName: 'Perrin',
      tutorTone: 'tu',
      courseLanguage: 'en',
      timezone: 'Europe/London',
      rhythm: {
        hoursPerDay: 5,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['matin', 'apres_midi'],
      },
      expectedUpdatedAt: before.value.updatedAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.me).toMatchObject({
      firstName: 'Alex',
      lastName: 'Perrin',
      tutorTone: 'tu',
      courseLanguage: 'en',
      timezone: 'Europe/London',
    });
    expect(result.value.rhythm).toEqual({
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['matin', 'apres_midi'],
    });
    // The version moves after a successful write (ET-3).
    expect(result.value.updatedAt).not.toBe(before.value.updatedAt);
    const rows = await serviceDb().execute<{
      hours_per_day: number;
      study_days: number[];
      preferred_slots: string[];
      timezone: string;
    }>(sql`
      select sp.hours_per_day, sp.study_days, sp.preferred_slots::text[] as preferred_slots,
             p.timezone::text as timezone
        from public.study_preferences sp
        join public.profiles p on p.id = sp.user_id
       where sp.user_id = ${user.userId}::uuid
    `);
    expect(rows[0]).toMatchObject({
      hours_per_day: 5,
      study_days: [1, 2, 3, 4, 5],
      preferred_slots: ['matin', 'apres_midi'],
      timezone: 'Europe/London',
    });
  });

  it('CA-4, CL-1 — une requête invalide ne crée rien', async () => {
    const user = await createUser('invalid');
    const before = await getSettingsState(context(user));
    if (!before.ok) throw before.error;
    for (const body of [
      {},
      { rhythm: { hoursPerDay: 7, studyDays: [1], preferredSlots: ['soir'] } },
      { timezone: 'Mars/Olympus' },
      { email: 'autre@exemple.fr' },
    ]) {
      const result = await updateSettingsProfile(context(user), body);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
    const after = await getSettingsState(context(user));
    if (!after.ok) throw after.error;
    expect(after.value.me).toEqual(before.value.me);
    expect(after.value.updatedAt).toBe(before.value.updatedAt);
    expect(after.value.rhythm).toEqual(before.value.rhythm);
  });

  it('CA-4, CL-2 — une version obsolète renvoie 409 et ne modifie rien', async () => {
    const user = await createUser('conflict');
    const before = await getSettingsState(context(user));
    if (!before.ok) throw before.error;
    const result = await updateSettingsProfile(context(user), {
      firstName: 'Modifié',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.status).toBe(409);
    const after = await getSettingsState(context(user));
    if (!after.ok) throw after.error;
    expect(after.value.me.firstName).toBeNull();
    expect(after.value.updatedAt).toBe(before.value.updatedAt);
    // A replay with the fresh version goes through.
    const replay = await updateSettingsProfile(context(user), {
      firstName: 'Alex',
      expectedUpdatedAt: after.value.updatedAt,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.me.firstName).toBe('Alex');
  });

  it('CA-3, CL-5 — reflète la demande de suppression réelle et son annulation', async () => {
    const user = await createUser('deletion');
    // BR-ACC-11 — the request belongs to SPEC-211; a second call returns the same deadline.
    const first = await scheduleDeletion(context(user));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = await scheduleDeletion(context(user));
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.scheduledFor).toBe(first.value.scheduledFor);
    const state = await getSettingsState(context(user));
    if (!state.ok) throw state.error;
    expect(state.value.deletionScheduledFor).toBe(first.value.scheduledFor);
    // J+30 of the frozen clock, Paris (UTC+1) → 2026-12-11 13:20 locales.
    expect(state.value.deletionScheduledFor).toBe('2026-12-11T12:20:00.000Z');
    await cancelDeletion(context(user));
    const cleared = await getSettingsState(context(user));
    if (!cleared.ok) throw cleared.error;
    expect(cleared.value.deletionScheduledFor).toBeNull();
  });

  it('CA-4 — RLS : l’état d’un second utilisateur ignore export et suppression du premier', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    await scheduleDeletion(context(alice));
    await serviceDb().execute(sql`
      insert into public.data_exports (user_id, status, size_bytes, requested_on)
      values (${alice.userId}::uuid, 'done', 2048, date '2026-11-11')
    `);
    const hers = await getSettingsState(context(alice));
    if (!hers.ok) throw hers.error;
    expect(hers.value.deletionScheduledFor).toBe('2026-12-11T12:20:00.000Z');
    expect(hers.value.export?.sizeBytes).toBe(2048);
    const his = await getSettingsState(context(bob));
    if (!his.ok) throw his.error;
    expect(his.value.deletionScheduledFor).toBeNull();
    expect(his.value.export).toBeNull();
  });
});
