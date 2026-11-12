// Integration tests of the shared-formation schema (SPEC-111 §12): introspection, constraints,
// invitation code, capacity under concurrency, strict view projection, active-formation counting,
// code rotation and RLS with several real JWTs. Every test runs against the local Supabase database
// (testing.md §3) and uses `userDb(ctx)` for the RLS assertions, never the service role (ET-3,
// ET-4). The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  countActiveFormations,
  countActiveGroupMembers,
  createGroup,
  findGroupByInviteCode,
  getGroup,
  getGroupMemberProgress,
  getGroupMembership,
  joinGroup,
  leaveGroup,
  listGroupMembers,
  listGroupProgress,
  removeGroupMember,
  rotateInviteCode,
} from '../../src/repositories/groups';
import { generateInviteCode, INVITE_CODE_ALPHABET } from '../../src/repositories/invite-code';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const FIXED = new Date('2026-11-11T12:20:00Z');
const ROTATED = new Date('2026-11-11T13:20:00Z');
const OWNER_CODE = 'LRN-AB23';
const ROTATED_CODE = 'LRN-CD45';

function deterministicCode(code: string) {
  const suffix = code.slice(4);
  let cursor = 0;
  return () => {
    const character = suffix[cursor] ?? 'A';
    cursor += 1;
    return INVITE_CODE_ALPHABET.indexOf(character);
  };
}

/** Returns a random source that yields `codes` one after the other (four draws per code). */
function sequenceOfCodes(...codes: string[]) {
  const draws: number[] = [];
  for (const code of codes) {
    const source = deterministicCode(code);
    for (let index = 0; index < 4; index += 1) draws.push(source());
  }
  let cursor = 0;
  return () => draws[cursor++] ?? 0;
}

interface Failure {
  code: string;
  message: string;
}

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 6 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

let savepoint = 0;

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec111_${String(savepoint)}`;
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

interface Base {
  userId: string;
  formationId: string;
  moduleIds: string[];
}

async function createBase(tx: DbTx, options: { title?: string; firstName?: string } = {}) {
  const user = await createTestUser(tx, { firstName: options.firstName ?? 'Alice' });
  const programme = await createTestProgramme(tx, user.id, {
    modules: 2,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
    ...(options.title === undefined ? {} : { title: options.title }),
  });
  return { userId: user.id, formationId: programme.formationId, moduleIds: programme.moduleIds };
}

async function createGroupFor(
  tx: DbTx,
  base: Base,
  options: { code?: string; maxMembers?: number } = {},
) {
  return createGroup(tx, {
    formationId: base.formationId,
    ownerId: base.userId,
    now: FIXED,
    random: deterministicCode(options.code ?? OWNER_CODE),
    ...(options.maxMembers === undefined ? {} : { maxMembers: options.maxMembers }),
  });
}

async function addMember(tx: DbTx, groupId: string, inviteCode: string, firstName: string) {
  const user = await createTestUser(tx, { firstName });
  const result = await joinGroup(tx, { inviteCode, userId: user.id, now: FIXED });
  return { userId: user.id, member: result.member };
}

async function count(tx: Queryable, table: string, column: string, value: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(column)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-111] group persistence', () => {
  it('CA-1 — les tables, contraintes, déclencheurs, politiques, vue et fonctions existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('groups', 'group_members')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(['group_members', 'groups']);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée',
      ).toBe(true);

      const roles = await tx.execute<Row>(sql`
        select e.enumlabel as label
        from pg_type t join pg_enum e on e.enumtypid = t.oid
        where t.typnamespace = 'public'::regnamespace and t.typname = 'group_role'
        order by e.enumsortorder
      `);
      expect(roles.map((row) => String(row.label))).toEqual(['owner', 'member']);

      const constraints = await tx.execute<Row>(sql`
        select conname as name, pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conrelid in ('public.groups'::regclass, 'public.group_members'::regclass)
           or conname = 'formations_group_id_groups_id_fk'
      `);
      const byName = new Map(constraints.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'groups_formation_id_unique',
        'groups_invite_code_unique',
        'groups_invite_code_format_check',
        'groups_max_members_check',
        'groups_code_rotated_at_check',
        'group_members_pkey',
        'group_members_member_status_check',
        'group_members_left_at_check',
        'group_members_group_id_groups_id_fk',
        'formations_group_id_groups_id_fk',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      expect(byName.get('groups_invite_code_format_check') ?? '').toContain('LRN-');
      expect(byName.get('groups_max_members_check') ?? '').toContain('max_members >= 2');
      expect(byName.get('groups_max_members_check') ?? '').toContain('max_members <= 10');
      expect(byName.get('group_members_member_status_check') ?? '').toContain('active');
      expect(byName.get('formations_group_id_groups_id_fk') ?? '').toContain('ON DELETE SET NULL');

      // EF-4, ET-3 — the view projects exactly six columns.
      const viewColumns = await tx.execute<Row>(sql`
        select column_name as name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'group_member_progress'
        order by ordinal_position
      `);
      expect(viewColumns.map((row) => String(row.name))).toEqual([
        'group_id',
        'user_id',
        'first_name',
        'current_module_position',
        'validated_modules',
        'streak_days',
      ]);

      const functions = await tx.execute<Row>(sql`
        select p.proname as name, p.prosecdef as security_definer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('is_group_member', 'is_group_owner', 'count_active_formations')
        order by p.proname
      `);
      const functionMap = new Map(
        functions.map((row) => [String(row.name), row.security_definer === true]),
      );
      expect(functionMap.get('is_group_member')).toBe(true);
      expect(functionMap.get('is_group_owner')).toBe(true);
      expect(functionMap.get('count_active_formations')).toBe(true);

      const triggers = await tx.execute<Row>(sql`
        select cl.relname as table, tg.tgname as name
        from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
      `);
      const triggerKeys = new Set(
        triggers.map((row) => `${String(row.table)}.${String(row.name)}`),
      );
      for (const expected of [
        'groups.groups_owner_membership_check',
        'group_members.group_members_role_consistency',
        'group_members.group_members_owner_not_removed',
      ]) {
        expect(triggerKeys.has(expected), expected).toBe(true);
      }

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and cl.relname in ('groups', 'group_members')
        order by cl.relname, pol.polname
      `);
      expect(policies.map((row) => `${String(row.table)}.${String(row.name)}`)).toEqual([
        'group_members.group_members_member_select',
        'group_members.group_members_owner_delete',
        'group_members.group_members_owner_insert',
        'group_members.group_members_owner_update',
        'groups.groups_member_select',
        'groups.groups_owner_delete',
        'groups.groups_owner_insert',
        'groups.groups_owner_update',
      ]);
    });
  });

  it('CA-1, CL-4 — les contraintes refusent code invalide, capacité hors bornes, doublons et rôle incohérent', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const group = await createGroupFor(tx, base);
      expect(group.inviteCode).toBe(OWNER_CODE);
      expect(group.maxMembers).toBe(10);

      // EF-1 — one group per formation.
      const duplicateFormation = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.groups (formation_id, owner_id, invite_code)
          values (${base.formationId}::uuid, ${base.userId}::uuid, 'LRN-ZZZZ')
        `),
      );
      expect(duplicateFormation.code).toBe('23505');
      expect(duplicateFormation.message).toContain('groups_formation_id_unique');

      // EF-1 — the code is unique across groups.
      const second = await createTestUser(tx, { firstName: 'Bob' });
      const secondProgramme = await createTestProgramme(tx, second.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: 'Deuxième formation',
      });
      const duplicateCode = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.groups (formation_id, owner_id, invite_code)
          values (
            ${secondProgramme.formationId}::uuid,
            ${second.id}::uuid,
            ${OWNER_CODE}
          )
        `),
      );
      expect(duplicateCode.code).toBe('23505');
      expect(duplicateCode.message).toContain('groups_invite_code_unique');

      // ET-1 — the pattern is enforced by the database.
      for (const invalidCode of ['LRN-1234', 'LRN-AB1O', 'ABCD-AB23', 'LRN-AB2']) {
        const invalid = await attempt(tx, () =>
          tx.execute(sql`
            insert into public.groups (formation_id, owner_id, invite_code)
            values (
              ${secondProgramme.formationId}::uuid,
              ${second.id}::uuid,
              ${invalidCode}
            )
          `),
        );
        expect(invalid.code, invalidCode).toBe('23514');
        expect(invalid.message).toContain('groups_invite_code_format_check');
      }

      // ET-1 — max_members between 2 and 10.
      for (const invalidMax of [1, 11]) {
        const invalid = await attempt(tx, () =>
          tx.execute(sql`
            update public.groups set max_members = ${invalidMax} where id = ${group.id}::uuid
          `),
        );
        expect(invalid.code, String(invalidMax)).toBe('23514');
        expect(invalid.message).toContain('groups_max_members_check');
      }

      // EF-2 — the owner's row is `owner`; another member cannot claim the role.
      const member = await addMember(tx, group.id, OWNER_CODE, 'Bob');
      const ownerAsMember = await attempt(tx, () =>
        tx.execute(sql`
          update public.group_members set role = 'member'
          where group_id = ${group.id}::uuid and user_id = ${base.userId}::uuid
        `),
      );
      expect(ownerAsMember.code).toBe('23514');
      expect(ownerAsMember.message).toContain('group_member_role_mismatch');

      const memberAsOwner = await attempt(tx, () =>
        tx.execute(sql`
          update public.group_members set role = 'owner'
          where group_id = ${group.id}::uuid and user_id = ${member.userId}::uuid
        `),
      );
      expect(memberAsOwner.code).toBe('23514');
      expect(memberAsOwner.message).toContain('group_member_role_mismatch');

      // EF-2 — the owner's membership cannot be deleted while the group exists (CL-4).
      const removeOwner = await attempt(tx, () =>
        tx.execute(sql`
          delete from public.group_members
          where group_id = ${group.id}::uuid and user_id = ${base.userId}::uuid
        `),
      );
      expect(removeOwner.code).toBe('23514');
      expect(removeOwner.message).toContain('group_owner_cannot_leave');

      // EF-2 — only the three membership statuses of CL-5 are admitted.
      const archived = await attempt(tx, () =>
        tx.execute(sql`
          update public.group_members set member_status = 'archived'
          where group_id = ${group.id}::uuid and user_id = ${member.userId}::uuid
        `),
      );
      expect(archived.code).toBe('23514');
      expect(archived.message).toContain('group_members_member_status_check');
    });
  });

  it('CA-1, CL-2 — un code déjà utilisé est retiré sans écraser l’autre groupe', async () => {
    await withRollback(async (tx) => {
      const alice = await createBase(tx, { firstName: 'Alice' });
      const first = await createGroupFor(tx, alice, { code: OWNER_CODE });
      expect(first.inviteCode).toBe(OWNER_CODE);

      const bob = await createBase(tx, { title: 'Formation de Bob', firstName: 'Bob' });
      const second = await createGroup(tx, {
        formationId: bob.formationId,
        ownerId: bob.userId,
        now: FIXED,
        random: sequenceOfCodes(OWNER_CODE, ROTATED_CODE),
      });
      expect(second.inviteCode).toBe(ROTATED_CODE);
      expect(second.inviteCode).not.toBe(first.inviteCode);

      const storedFirst = await findGroupByInviteCode(tx, { inviteCode: OWNER_CODE });
      expect(storedFirst?.id).toBe(first.id);
      const storedSecond = await findGroupByInviteCode(tx, { inviteCode: ROTATED_CODE });
      expect(storedSecond?.id).toBe(second.id);
      expect(await count(tx, 'groups', 'id', first.id)).toBe(1);
    });
  });

  it('CA-1 / CL-1 — la dixième place est unique sous concurrence, la onzième est refusée', async () => {
    // Deliberately outside withRollback: the two joins must really commit and race.
    const seed = await serviceDb().transaction(async (tx) => {
      const owner = await createBase(tx, { firstName: 'Owner' });
      const group = await createGroupFor(tx, owner);
      const members: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        const member = await addMember(tx, group.id, OWNER_CODE, `Membre ${String(index + 1)}`);
        members.push(member.userId);
      }
      const tenth = await createTestUser(tx, { firstName: 'Dixième' });
      const eleventh = await createTestUser(tx, { firstName: 'Onzième' });
      const twelfth = await createTestUser(tx, { firstName: 'Douzième' });
      return {
        ...owner,
        groupId: group.id,
        userIds: [owner.userId, ...members, tenth.id, eleventh.id, twelfth.id],
        tenthId: tenth.id,
        eleventhId: eleventh.id,
        twelfthId: twelfth.id,
      };
    });

    try {
      const join = (userId: string) =>
        serviceDb().transaction((tx) =>
          joinGroup(tx, { inviteCode: OWNER_CODE, userId, now: FIXED }),
        );
      const settled = await Promise.allSettled([join(seed.tenthId), join(seed.eleventhId)]);
      const fulfilled = settled.filter((result) => result.status === 'fulfilled');
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const failure = failureOf(rejected[0]?.reason);
      expect(failure.code).toBe('CONFLICT');
      expect(failure.message).toContain('complet');
      expect(rejected[0]?.reason).toBeInstanceOf(AppError);

      expect(await countActiveGroupMembers(serviceDb(), { groupId: seed.groupId })).toBe(10);
      expect(await count(serviceDb(), 'group_members', 'group_id', seed.groupId)).toBe(10);

      // A later attempt is refused too.
      const late = await serviceDb()
        .transaction((tx) =>
          joinGroup(tx, { inviteCode: OWNER_CODE, userId: seed.twelfthId, now: FIXED }),
        )
        .then(
          () => null,
          (error: unknown) => failureOf(error),
        );
      expect(late?.code).toBe('CONFLICT');
    } finally {
      await serviceDb().execute(sql`
        delete from public.formations where id = ${seed.formationId}::uuid
      `);
      for (const userId of seed.userIds) {
        await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    }
  });

  it('CA-2, EF-4, ET-3 — la vue ne projette que six champs et jamais une donnée personnelle', async () => {
    const alice = await serviceDb().transaction(async (tx) => {
      const owner = await createBase(tx, { firstName: 'Alice' });
      const group = await createGroupFor(tx, owner);
      const bob = await addMember(tx, group.id, OWNER_CODE, 'Bob');
      const carol = await addMember(tx, group.id, OWNER_CODE, 'Carol');
      const [firstModule, secondModule] = owner.moduleIds;
      if (firstModule === undefined || secondModule === undefined) {
        throw new Error('programme de démonstration incomplet');
      }

      // Personal progress: Alice has validated module 1 and opened module 2.
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id, status, validated_at)
        values (${owner.userId}::uuid, ${firstModule}::uuid, 'validated', ${FIXED.toISOString()}::timestamptz)
      `);
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id, status)
        values (${owner.userId}::uuid, ${secondModule}::uuid, 'open')
      `);
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id, status, validated_at)
        values (${bob.userId}::uuid, ${firstModule}::uuid, 'validated', ${FIXED.toISOString()}::timestamptz)
      `);
      await tx.execute(
        sql`update public.profiles set streak_days = 7 where id = ${bob.userId}::uuid`,
      );
      await tx.execute(
        sql`update public.profiles set streak_days = 3 where id = ${carol.userId}::uuid`,
      );

      // Bob's personal notes, gap card and slot must stay invisible to Alice.
      await tx.execute(sql`
        insert into public.notion_states (user_id, notion_id, fsrs)
        values (
          ${bob.userId}::uuid,
          (select id from public.notions where formation_id = ${owner.formationId}::uuid limit 1),
          ${JSON.stringify({
            due: '2026-11-12T12:20:00.000Z',
            stability: 1.5,
            difficulty: 4.2,
            elapsed_days: 0,
            scheduled_days: 1,
            reps: 1,
            lapses: 0,
            state: 2,
            last_review: '2026-11-11T12:20:00.000Z',
          })}::jsonb
        )
      `);
      await tx.execute(sql`
        insert into public.resources (owner_id, formation_id, kind, title, content_text)
        values (${bob.userId}::uuid, ${owner.formationId}::uuid, 'note', 'Note privée de Bob', 'secret')
      `);
      await tx.execute(sql`
        insert into public.schedule_slots (
          user_id, formation_id, kind, title, starts_at, ends_at, created_by
        )
        values (
          ${bob.userId}::uuid, ${owner.formationId}::uuid, 'course', 'Séance privée de Bob',
          '2026-11-11T17:00:00Z'::timestamptz, '2026-11-11T18:00:00Z'::timestamptz, 'planner'
        )
      `);

      return {
        owner,
        groupId: group.id,
        bobId: bob.userId,
        carolId: carol.userId,
        inviteCode: group.inviteCode,
      };
    });

    try {
      const progress = await userDb({ userId: alice.owner.userId }).run((tx) =>
        listGroupProgress(tx, { groupId: alice.groupId }),
      );
      expect(progress.map((row) => row.firstName)).toEqual(['Alice', 'Bob', 'Carol']);
      expect(progress).toHaveLength(3);
      for (const row of progress) {
        expect(Object.keys(row).sort()).toEqual([
          'currentModulePosition',
          'firstName',
          'groupId',
          'streakDays',
          'userId',
          'validatedModules',
        ]);
        expect(row.groupId).toBe(alice.groupId);
      }
      const aliceRow = progress.find((row) => row.userId === alice.owner.userId);
      expect(aliceRow).toMatchObject({
        currentModulePosition: 2,
        validatedModules: 1,
        streakDays: 0,
      });
      const bobRow = progress.find((row) => row.userId === alice.bobId);
      expect(bobRow).toMatchObject({
        currentModulePosition: 1,
        validatedModules: 1,
        streakDays: 7,
      });
      const carolRow = progress.find((row) => row.userId === alice.carolId);
      expect(carolRow).toMatchObject({
        currentModulePosition: 1,
        validatedModules: 0,
        streakDays: 3,
      });

      // The raw view exposes exactly the six column names.
      const raw = await userDb({ userId: alice.owner.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select * from public.group_member_progress where group_id = ${alice.groupId}::uuid
        `);
        return rows;
      });
      expect(raw).toHaveLength(3);
      expect(Object.keys(raw[0] ?? {}).sort()).toEqual([
        'current_module_position',
        'first_name',
        'group_id',
        'streak_days',
        'user_id',
        'validated_modules',
      ]);

      // CL-7 — Alice cannot read Bob's notes, gaps or slots even through a join on the shared
      // programme.
      const leak = await userDb({ userId: alice.owner.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.notion_states where user_id = ${alice.bobId}::uuid) as gaps,
            (select count(*)::int from public.resources where owner_id = ${alice.bobId}::uuid) as notes,
            (select count(*)::int from public.schedule_slots where user_id = ${alice.bobId}::uuid) as slots,
            (
              select count(*)::int
              from public.modules m
              join public.resources r on r.formation_id = m.formation_id
              where m.formation_id = ${alice.owner.formationId}::uuid
                and r.owner_id = ${alice.bobId}::uuid
            ) as joined_notes
        `);
        return rows[0];
      });
      expect(leak).toMatchObject({ gaps: 0, notes: 0, slots: 0, joined_notes: 0 });
    } finally {
      await serviceDb().execute(sql`
        delete from public.formations where id = ${alice.owner.formationId}::uuid
      `);
      for (const userId of [alice.owner.userId, alice.bobId, alice.carolId]) {
        await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    }
  });

  it('CA-3, CL-5, CL-6 — le comptage ne double pas le propriétaire et respecte le statut personnel', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const owner = await createBase(tx, { firstName: 'Alice' });
      const group = await createGroupFor(tx, owner);
      const member = await addMember(tx, group.id, OWNER_CODE, 'Bob');

      // A paused and an archived formation owned by Alice must not count.
      const paused = await tx.execute<{ id: string }>(sql`
        insert into public.formations (owner_id, title, objectives, status)
        values (${owner.userId}::uuid, 'Formation en pause', '{operational}', 'paused')
        returning id::text as id
      `);
      const archived = await tx.execute<{ id: string }>(sql`
        insert into public.formations (owner_id, title, objectives, status)
        values (${owner.userId}::uuid, 'Formation archivée', '{operational}', 'archived')
        returning id::text as id
      `);

      // Bob owns one active formation and joins Alice's group, so he must count two.
      const bobOwn = await createTestProgramme(tx, member.userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: 'Formation personnelle de Bob',
      });
      return {
        ownerId: owner.userId,
        memberId: member.userId,
        groupId: group.id,
        formationId: owner.formationId,
        pausedId: paused[0]?.id ?? '',
        archivedId: archived[0]?.id ?? '',
        bobFormationId: bobOwn.formationId,
      };
    });

    try {
      expect(await countActiveFormations(serviceDb(), seed.ownerId)).toBe(1);
      expect(await countActiveFormations(serviceDb(), seed.memberId)).toBe(2);
      expect(await countActiveFormations(serviceDb(), seed.ownerId)).toBe(1);
      expect(seed.pausedId).not.toBe('');
      expect(seed.archivedId).not.toBe('');

      // Under the owner's JWT the same count holds.
      expect(
        await userDb({ userId: seed.ownerId }).run((tx) => countActiveFormations(tx, seed.ownerId)),
      ).toBe(1);
      expect(
        await userDb({ userId: seed.memberId }).run((tx) =>
          countActiveFormations(tx, seed.memberId),
        ),
      ).toBe(2);

      // CL-5 — a paused membership is still visible in the group but no longer counts.
      await serviceDb().execute(sql`
        update public.group_members set member_status = 'paused'
        where group_id = ${seed.groupId}::uuid and user_id = ${seed.memberId}::uuid
      `);
      expect(await countActiveFormations(serviceDb(), seed.memberId)).toBe(1);
      expect(await countActiveGroupMembers(serviceDb(), { groupId: seed.groupId })).toBe(2);
      const progress = await userDb({ userId: seed.ownerId }).run((tx) =>
        listGroupProgress(tx, { groupId: seed.groupId }),
      );
      expect(progress).toHaveLength(2);

      // CL-6 — the owner is a member and owns the formation: one active formation, not two.
      expect(
        await serviceDb().execute<Row>(sql`
          select count(*)::int as active
          from public.formations where owner_id = ${seed.ownerId}::uuid and status = 'active'
        `),
      ).toMatchObject([{ active: 1 }]);

      // ET-5 — an authenticated caller cannot count another user's formations.
      const forbidden = await failureOfUserDb(
        (tx) => countActiveFormations(tx, seed.memberId),
        seed.ownerId,
      );
      expect(forbidden.code).toBe('42501');
      expect(forbidden.message).toContain('count_active_formations_forbidden');
    } finally {
      await serviceDb().execute(sql`
        delete from public.formations where owner_id = ${seed.ownerId}::uuid
      `);
      for (const userId of [seed.ownerId, seed.memberId]) {
        await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    }
  });

  it('CA-4, CL-3, CL-4 — rotation, sortie copiée, retrait et RLS des non-membres', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const owner = await createBase(tx, { firstName: 'Alice' });
      const group = await createGroupFor(tx, owner);
      const bob = await addMember(tx, group.id, OWNER_CODE, 'Bob');
      const carol = await createTestUser(tx, { firstName: 'Carol' });
      return {
        owner,
        group,
        bob,
        carolId: carol.id,
      };
    });

    try {
      // CL-3 — rotating invalidates the old code immediately.
      const rotated = await serviceDb().transaction((tx) =>
        rotateInviteCode(tx, {
          groupId: seed.group.id,
          ownerId: seed.owner.userId,
          now: ROTATED,
          random: deterministicCode(ROTATED_CODE),
        }),
      );
      expect(rotated.inviteCode).toBe(ROTATED_CODE);
      expect(rotated.codeRotatedAt.toISOString()).toBe(ROTATED.toISOString());
      expect(
        await serviceDb().transaction((tx) =>
          findGroupByInviteCode(tx, { inviteCode: OWNER_CODE }),
        ),
      ).toBeNull();
      const oldJoin = await serviceDb()
        .transaction((tx) =>
          joinGroup(tx, { inviteCode: OWNER_CODE, userId: seed.carolId, now: FIXED }),
        )
        .then(
          () => null,
          (error: unknown) => failureOf(error),
        );
      expect(oldJoin?.code).toBe('NOT_FOUND');

      // The new code still works.
      const joined = await serviceDb().transaction((tx) =>
        joinGroup(tx, { inviteCode: ROTATED_CODE, userId: seed.carolId, now: FIXED }),
      );
      expect(joined.alreadyMember).toBe(false);
      expect(await countActiveGroupMembers(serviceDb(), { groupId: seed.group.id })).toBe(3);

      // CL-4 — the owner cannot leave, and the member stays until the copy exists.
      const ownerLeave = await serviceDb()
        .transaction((tx) =>
          leaveGroup(tx, {
            groupId: seed.group.id,
            userId: seed.owner.userId,
            now: FIXED,
            createCopy: () => Promise.resolve(seed.owner.formationId),
          }),
        )
        .then(
          () => null,
          (error: unknown) => failureOf(error),
        );
      expect(ownerLeave?.code).toBe('FORBIDDEN');

      const failedCopy = await serviceDb()
        .transaction((tx) =>
          leaveGroup(tx, {
            groupId: seed.group.id,
            userId: seed.carolId,
            now: FIXED,
            createCopy: () => {
              throw new Error('copie impossible');
            },
          }),
        )
        .then(
          () => null,
          (error: unknown) => failureOf(error),
        );
      expect(failedCopy?.message).toContain('copie impossible');
      expect(
        await serviceDb().transaction((tx) =>
          getGroupMembership(tx, { groupId: seed.group.id, userId: seed.carolId }),
        ),
      ).toMatchObject({ leftAt: null, memberStatus: 'active' });

      // EF-6 — the copy must belong to the member before the membership is closed.
      const foreignCopy = await serviceDb()
        .transaction((tx) =>
          leaveGroup(tx, {
            groupId: seed.group.id,
            userId: seed.carolId,
            now: FIXED,
            createCopy: () => Promise.resolve(seed.owner.formationId),
          }),
        )
        .then(
          () => null,
          (error: unknown) => failureOf(error),
        );
      expect(foreignCopy?.code).toBe('CONFLICT');

      const left = await serviceDb().transaction((tx) =>
        leaveGroup(tx, {
          groupId: seed.group.id,
          userId: seed.carolId,
          now: FIXED,
          createCopy: async (context) => {
            const rows = await tx.execute<{ id: string }>(sql`
              insert into public.formations (owner_id, title, objectives, status)
              values (
                ${context.userId}::uuid,
                'Copie individuelle du programme',
                '{operational}',
                'active'
              )
              returning id::text as id
            `);
            const id = rows[0]?.id;
            if (id === undefined) throw new Error('copie non créée');
            return id;
          },
        }),
      );
      expect(left.member.leftAt?.toISOString()).toBe(FIXED.toISOString());
      expect(left.member.memberStatus).toBe('completed');
      expect(left.copyFormationId).not.toBe(seed.owner.formationId);
      expect(await countActiveGroupMembers(serviceDb(), { groupId: seed.group.id })).toBe(2);
      // The copy counts as an active formation; the closed membership no longer does.
      expect(await countActiveFormations(serviceDb(), seed.carolId)).toBe(1);

      // CA-4 — RLS: a non-member sees nothing and cannot write.
      const carolGroup = await userDb({ userId: seed.carolId }).run((tx) =>
        getGroup(tx, { groupId: seed.group.id }),
      );
      expect(carolGroup).toBeNull();
      expect(
        await userDb({ userId: seed.carolId }).run(async (tx) => {
          const rows = await tx.execute<Row>(sql`select count(*)::int as count from public.groups`);
          return Number(rows[0]?.count ?? -1);
        }),
      ).toBe(0);
      expect(
        await userDb({ userId: seed.carolId }).run((tx) =>
          listGroupProgress(tx, { groupId: seed.group.id }),
        ),
      ).toEqual([]);
      expect(
        await failureOfUserDb(
          (tx) =>
            tx.execute(sql`
              insert into public.group_members (group_id, user_id, role)
              values (${seed.group.id}::uuid, ${seed.carolId}::uuid, 'member')
            `),
          seed.carolId,
        ),
      ).toMatchObject({ code: '42501' });

      // The owner and the remaining member read the group information.
      const ownerView = await userDb({ userId: seed.owner.userId }).run((tx) =>
        getGroup(tx, { groupId: seed.group.id }),
      );
      expect(ownerView?.inviteCode).toBe(ROTATED_CODE);
      expect(
        await userDb({ userId: seed.bob.userId }).run((tx) =>
          getGroup(tx, { groupId: seed.group.id }),
        ),
      ).not.toBeNull();
      expect(
        await userDb({ userId: seed.bob.userId }).run((tx) =>
          getGroupMemberProgress(tx, { groupId: seed.group.id, userId: seed.bob.userId }),
        ),
      ).toMatchObject({ firstName: 'Bob', currentModulePosition: 1 });
      expect(
        await userDb({ userId: seed.carolId }).run((tx) =>
          getGroupMemberProgress(tx, { groupId: seed.group.id, userId: seed.carolId }),
        ),
      ).toBeNull();

      // BR-GRP-05 — the owner removes a member by closing the membership.
      const removed = await serviceDb().transaction((tx) =>
        removeGroupMember(tx, {
          groupId: seed.group.id,
          ownerId: seed.owner.userId,
          userId: seed.bob.userId,
          now: FIXED,
        }),
      );
      expect(removed.memberStatus).toBe('completed');
      expect(removed.leftAt?.toISOString()).toBe(FIXED.toISOString());
      expect(await countActiveGroupMembers(serviceDb(), { groupId: seed.group.id })).toBe(1);

      // CL-8 — deleting the formation removes the group and every membership.
      await serviceDb().execute(sql`
        delete from public.formations where id = ${seed.owner.formationId}::uuid
      `);
      expect(await count(serviceDb(), 'groups', 'id', seed.group.id)).toBe(0);
      expect(await count(serviceDb(), 'group_members', 'group_id', seed.group.id)).toBe(0);
    } finally {
      await serviceDb().execute(sql`
        delete from public.formations where id = ${seed.owner.formationId}::uuid
      `);
      for (const userId of [seed.owner.userId, seed.bob.userId, seed.carolId]) {
        await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
      }
    }
  });

  it('CA-1 — un groupe sans appartenance propriétaire est refusé à la validation', async () => {
    const failure = await serviceDb()
      .transaction(async (tx) => {
        const owner = await createBase(tx, { firstName: 'Alice' });
        await tx.execute(sql`
          insert into public.groups (formation_id, owner_id, invite_code)
          values (${owner.formationId}::uuid, ${owner.userId}::uuid, ${OWNER_CODE})
        `);
      })
      .then(
        () => null,
        (error: unknown) => failureOf(error),
      );

    expect(failure?.code).toBe('23514');
    expect(failure?.message).toContain('group_owner_membership_missing');
  });

  it('CA-1 — la génération ne dérive jamais d’un identifiant et reste unique en pratique', () => {
    // Deterministic source: enumerate the 4-symbol space so the assertion proves that distinct
    // draws map to distinct codes. The cryptographic source and rejection sampling are covered by
    // the unit tests; drawing 200 codes from 34^4 with the real source has a ~1.5 % birthday
    // collision, which would make this integration test flaky rather than meaningful.
    let draw = 0;
    const enumerate = (max: number): number => {
      const codeIndex = Math.floor(draw / 4);
      const position = draw % 4;
      draw += 1;
      return Math.floor(codeIndex / 34 ** (3 - position)) % max;
    };
    const codes = new Set<string>();
    for (let index = 0; index < 200; index += 1) codes.add(generateInviteCode(enumerate));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^LRN-[A-Z2-9]{4}$/);
    }
  });

  it('CA-2 — les lectures propriétaire/membre sont bornées et le code inconnu est refusé', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const group = await createGroupFor(tx, base);
      const members = await listGroupMembers(tx, { groupId: group.id });
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        userId: base.userId,
        role: 'owner',
        memberStatus: 'active',
      });
      expect(await findGroupByInviteCode(tx, { inviteCode: 'LRN-ZZZZ' })).toBeNull();
      await expect(findGroupByInviteCode(tx, { inviteCode: 'lrn-ab23' })).resolves.toMatchObject({
        id: group.id,
      });
      await expect(findGroupByInviteCode(tx, { inviteCode: 'PAS-UN-CODE' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });
});
