// Integration tests of the shared-formation service (SPEC-724 §12, CA-1 to CA-4; BR-GRP-01 to
// BR-GRP-05, BR-APP-03). Real Postgres with RLS (Supabase local), the real SPEC-111 repository and
// the real programme tables. The clock is frozen at 2026-11-11T12:20:00Z (ADR-0047) and the AI stays
// mocked (ADR-0048). Users are created by factory with the `sdd-724-` prefix and deleted in afterAll.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, sql, userDb } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import {
  acceptInvitation,
  createFormationGroup,
  getFormationGroup,
  getInvitationPreview,
  leaveFormationGroup,
  removeMemberFromGroup,
  rotateGroupCode,
} from '../../src/formations-a-plusieurs';

const PREFIX = 'sdd-724-';
const FIXED = createFixedClock();

interface TestUser {
  userId: string;
  email: string;
}

interface Programme {
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
}

const createdUsers: string[] = [];

async function createUser(label: string, firstName: string): Promise<TestUser> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email, firstName })).id,
  );
  createdUsers.push(userId);
  return { userId, email };
}

async function createFormation(ownerId: string, title = 'Promotion SAP 2026'): Promise<Programme> {
  return serviceDb().transaction((tx) =>
    createTestProgramme(tx, ownerId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title,
    }),
  );
}

function context(user: TestUser) {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: FIXED,
  });
}

const publicContext = () =>
  createServiceContext({ userId: null, requestId: randomUUID(), clock: FIXED });

async function cleanup(): Promise<void> {
  if (createdUsers.length === 0) return;
  const ids = sql.raw(`array[${createdUsers.map((id) => `'${id}'::uuid`).join(',')}]`);
  // The group trigger refuses to remove the owner membership while its group exists: delete the
  // parent rows first, then the accounts (SPEC-111 CL-4).
  await serviceDb().execute(sql`delete from public.groups where owner_id = any(${ids})`);
  await serviceDb().execute(sql`delete from public.formations where owner_id = any(${ids})`);
  await serviceDb().execute(sql`delete from auth.users where id = any(${ids})`);
  createdUsers.length = 0;
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-724] service et API', () => {
  it('CA-1 — crée un code LRN-XXXX, dix places et refuse un second groupe', async () => {
    const owner = await createUser('owner', 'Alice');
    const programme = await createFormation(owner.userId);

    const created = await createFormationGroup(context(owner), programme.formationId);
    expect(created.ok).toBe(true);
    if (!created.ok || created.value.group === null) throw new Error('groupe non créé');
    expect(created.value.group.inviteCode).toMatch(/^LRN-[A-Z2-9]{4}$/);
    expect(created.value.group.maxMembers).toBe(10);
    expect(created.value.group.memberCount).toBe(1);
    expect(created.value.group.canManage).toBe(true);
    expect(created.value.group.canLeave).toBe(false);

    const again = await createFormationGroup(context(owner), programme.formationId);
    expect(again).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    const rows = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.groups where formation_id = ${programme.formationId}::uuid
    `);
    expect(rows[0]?.count).toBe(1);
  });

  it('CA-1, CL-4 — deux adhésions simultanées au dixième siège : une seule réussit', async () => {
    const owner = await createUser('capacity-owner', 'Alice');
    const programme = await createFormation(owner.userId);
    const created = await createFormationGroup(context(owner), programme.formationId);
    if (!created.ok || created.value.group === null) throw new Error('groupe non créé');
    const code = created.value.group.inviteCode;

    // Eight members fill seats 2..9; the owner is seat 1.
    for (let index = 0; index < 8; index += 1) {
      const member = await createUser(`seat-${String(index)}`, `Membre${String(index)}`);
      const joined = await acceptInvitation(context(member), code);
      expect(joined.ok).toBe(true);
    }

    const first = await createUser('tenth-a', 'DixA');
    const second = await createUser('tenth-b', 'DixB');
    const outcomes = await Promise.all([
      acceptInvitation(context(first), code),
      acceptInvitation(context(second), code),
    ]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toHaveLength(1);
    const failure = outcomes.find((outcome) => !outcome.ok);
    expect(failure).toMatchObject({ ok: false, error: { code: 'GROUP_FULL' } });

    const seats = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where g.formation_id = ${programme.formationId}::uuid and gm.left_at is null
    `);
    expect(seats[0]?.count).toBe(10);
  }, 60000);

  it('CA-2 — la page ne montre que les quatre faits publics et la RLS cache le reste', async () => {
    const owner = await createUser('privacy-owner', 'Alice');
    const member = await createUser('privacy-member', 'Bob');
    const outsider = await createUser('privacy-outsider', 'Eve');
    const programme = await createFormation(owner.userId);
    const created = await createFormationGroup(context(owner), programme.formationId);
    if (!created.ok || created.value.group === null) throw new Error('groupe non créé');
    const code = created.value.group.inviteCode;
    const joined = await acceptInvitation(context(member), code);
    expect(joined.ok).toBe(true);

    // A private resource of the owner, invisible to the member and to an outsider.
    await serviceDb().execute(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, status, content_text
      )
      values (
        ${owner.userId}::uuid, ${programme.formationId}::uuid,
        ${programme.chapterIds[0] ?? null}::uuid, 'note', 'Note privée d’Alice', 'ready',
        'Contenu privé'
      )
    `);

    const seen = await getFormationGroup(context(owner), programme.formationId);
    expect(seen.ok).toBe(true);
    if (!seen.ok || seen.value.group === null) return;
    expect(seen.value.group.members).toHaveLength(2);
    for (const view of seen.value.group.members) {
      expect(Object.keys(view).sort()).toEqual([
        'currentModulePosition',
        'firstName',
        'memberStatus',
        'role',
        'streakDays',
        'userId',
        'validatedModules',
      ]);
    }
    expect(JSON.stringify(seen.value)).not.toMatch(/Alice@|@test\.learny|Note privée|lacune/i);

    const ownerRows = await userDb({ userId: member.userId }).run((tx) =>
      tx.execute(sql`select id from public.resources where owner_id = ${owner.userId}::uuid`),
    );
    expect(ownerRows).toHaveLength(0);

    const stranger = await getFormationGroup(context(outsider), programme.formationId);
    expect(stranger).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CA-3, CA-4 — quitter conserve les résultats privés, retire le membre et invalide l’ancien code', async () => {
    const owner = await createUser('leave-owner', 'Alice');
    const member = await createUser('leave-member', 'Bob');
    const programme = await createFormation(owner.userId, 'Programme partagé');
    const created = await createFormationGroup(context(owner), programme.formationId);
    if (!created.ok || created.value.group === null) throw new Error('groupe non créé');
    const group = created.value.group;
    const joined = await acceptInvitation(context(member), group.inviteCode);
    expect(joined.ok).toBe(true);

    // The member's private history in the shared programme: a note and an open module.
    await serviceDb().execute(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, status, content_text
      )
      values (
        ${member.userId}::uuid, ${programme.formationId}::uuid,
        ${programme.chapterIds[0] ?? null}::uuid, 'note', 'Apport privé de Bob', 'ready',
        'Contenu privé de Bob'
      )
    `);
    await serviceDb().execute(sql`
      update public.module_progress
      set status = 'validated', validated_at = ${FIXED.now().toISOString()}::timestamptz
      where user_id = ${member.userId}::uuid and module_id = ${programme.moduleIds[0] ?? ''}::uuid
    `);

    const ownerLeave = await leaveFormationGroup(context(owner), group.id);
    expect(ownerLeave).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    const left = await leaveFormationGroup(context(member), group.id);
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(left.value.formationId).not.toBe(programme.formationId);
    expect(left.value.previousGroupId).toBe(group.id);

    const copy = await serviceDb().execute<{
      owner_id: string;
      group_id: string | null;
      title: string;
    }>(sql`
      select owner_id::text as owner_id, group_id::text as group_id, title
      from public.formations where id = ${left.value.formationId}::uuid
    `);
    expect(copy[0]).toMatchObject({
      owner_id: member.userId,
      group_id: null,
      title: 'Programme partagé',
    });

    const progress = await serviceDb().execute<{ status: string; module_count: number }>(sql`
      select mp.status::text as status, count(*) over ()::int as module_count
      from public.module_progress mp
      join public.modules m on m.id = mp.module_id
      where mp.user_id = ${member.userId}::uuid
        and m.formation_id = ${left.value.formationId}::uuid
      order by m.position
    `);
    expect(progress).toHaveLength(2);
    expect(progress[0]?.status).toBe('validated');
    expect(progress[1]?.status).toBe('locked');

    const movedResources = await serviceDb().execute<{
      formation_id: string;
      owner_id: string;
    }>(sql`
      select formation_id::text as formation_id, owner_id::text as owner_id
      from public.resources where owner_id = ${member.userId}::uuid
    `);
    expect(movedResources).toHaveLength(1);
    expect(movedResources[0]).toMatchObject({
      formation_id: left.value.formationId,
      owner_id: member.userId,
    });

    const membership = await serviceDb().execute<{ left_at: string | null }>(sql`
      select left_at from public.group_members
      where group_id = ${group.id}::uuid and user_id = ${member.userId}::uuid
    `);
    expect(membership[0]?.left_at).not.toBeNull();

    // BR-GRP-05, CA-3 — the rotated code no longer accepts anybody and the old one is a 404.
    const rotated = await rotateGroupCode(context(owner), group.id);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok || rotated.value.group === null) return;
    expect(rotated.value.group.inviteCode).not.toBe(group.inviteCode);

    const oldPreview = await getInvitationPreview(publicContext(), group.inviteCode);
    expect(oldPreview).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const newcomer = await createUser('after-rotate', 'Nina');
    const oldAccept = await acceptInvitation(context(newcomer), group.inviteCode);
    expect(oldAccept).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const removedAgain = await removeMemberFromGroup(context(owner), group.id, member.userId);
    expect(removedAgain).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CA-4 — invalide, non-propriétaire et double envoi ne produisent qu’un effet', async () => {
    const owner = await createUser('idem-owner', 'Alice');
    const member = await createUser('idem-member', 'Bob');
    const intruder = await createUser('idem-intruder', 'Mallory');
    const programme = await createFormation(owner.userId);
    const created = await createFormationGroup(context(owner), programme.formationId);
    if (!created.ok || created.value.group === null) throw new Error('groupe non créé');
    const group = created.value.group;

    const invalid = await getFormationGroup(context(owner), 'pas-un-uuid');
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const invalidCode = await getInvitationPreview(publicContext(), 'LRN-AB1O');
    expect(invalidCode).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const first = await acceptInvitation(context(member), group.inviteCode);
    const second = await acceptInvitation(context(member), group.inviteCode);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const rows = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.group_members
      where group_id = ${group.id}::uuid and user_id = ${member.userId}::uuid
    `);
    expect(rows[0]?.count).toBe(1);
    const events = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where event_id = ${`group-member-joined:${group.id}:${member.userId}`}
    `);
    expect(events[0]?.count).toBe(1);

    const foreignRemove = await removeMemberFromGroup(context(intruder), group.id, member.userId);
    expect(foreignRemove).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const removed = await removeMemberFromGroup(context(owner), group.id, member.userId);
    expect(removed.ok).toBe(true);

    const limitUser = await createUser('limit-user', 'Léa');
    for (let index = 0; index < 3; index += 1) {
      await createFormation(limitUser.userId, `Formation ${String(index)}`);
    }
    const limited = await acceptInvitation(context(limitUser), group.inviteCode);
    expect(limited).toMatchObject({ ok: false, error: { code: 'FORMATION_LIMIT_REACHED' } });
  }, 60000);
});
