// Repository of shared formations (SPEC-111 EF-1 to EF-6, CL-1 to CL-8; ADR-0035, ADR-0246).
//
// The repository composes the caller's transaction: creation and code rotation retry on an
// invitation-code collision inside a savepoint (ET-2, CL-2), joining locks the group row before
// counting seats (EF-3, CL-1), and leaving only marks the membership once the individual copy has
// been created in the same transaction (EF-6, CL-4). Reads of `group_member_progress` run under
// `userDb`, where the security-definer view filters rows by the caller's membership (ET-3).
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import { formations } from '../schema/formations';
import {
  GROUP_MEMBER_STATUSES,
  groupMembers,
  groups,
  type Group,
  type GroupMember,
  type GroupMemberProgress,
  type GroupMemberStatus,
} from '../schema/groups';

import { generateInviteCode, parseInviteCode, type RandomIndexSource } from './invite-code';

const uuidSchema = z.uuid();
const maxMembersSchema = z.int().min(2).max(10);
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});
const memberStatusSchema = z.enum(GROUP_MEMBER_STATUSES);

const MAX_CODE_ATTEMPTS = 8;

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

function optionalInstant(value: Date | undefined, field: string): Date | undefined {
  return value === undefined ? undefined : parse(instantSchema, value, field);
}

interface ErrorDetails {
  code: string | null;
  constraint: string | null;
  message: string;
}

/** Postgres errors may be wrapped by Drizzle; walk the cause chain once. */
function errorDetails(error: unknown): ErrorDetails {
  let current: unknown = error;
  let code: string | null = null;
  let constraint: string | null = null;
  const messages: string[] = [];
  for (let depth = 0; depth < 6 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (code === null && typeof candidate.code === 'string') code = candidate.code;
    if (constraint === null) {
      if (typeof candidate.constraint_name === 'string') constraint = candidate.constraint_name;
      else if (typeof candidate.constraint === 'string') constraint = candidate.constraint;
    }
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, constraint, message: messages.join(' | ') };
}

function isInviteCodeCollision(error: unknown): boolean {
  const details = errorDetails(error);
  return (
    details.code === '23505' &&
    (details.constraint === 'groups_invite_code_unique' ||
      details.message.includes('groups_invite_code_unique'))
  );
}

function isFormationCollision(error: unknown): boolean {
  const details = errorDetails(error);
  return (
    details.code === '23505' &&
    (details.constraint === 'groups_formation_id_unique' ||
      details.message.includes('groups_formation_id_unique'))
  );
}

function mapFormationCollision(error: unknown): never {
  if (isFormationCollision(error)) {
    throw new AppError('CONFLICT', 'Un groupe existe déjà pour cette formation.');
  }
  if (isInviteCodeCollision(error)) {
    throw new AppError(
      'CONFLICT',
      'Le code d’invitation n’a pas pu être généré sans collision ; réessayez.',
    );
  }
  throw error;
}

type Queryable = Pick<DbTx, 'execute' | 'select' | 'insert' | 'update' | 'transaction'>;

export interface CreateGroupInput {
  formationId: string;
  ownerId: string;
  maxMembers?: number;
  /** Deterministic clock for the demonstration and the tests (ADR-0047). */
  now?: Date;
  /** Deterministic random source for the unit tests (ET-2). */
  random?: RandomIndexSource;
}

/**
 * EF-1, ET-2, CL-2 — creates the group of an active formation owned by `ownerId`, its owner
 * membership and the back-reference `formations.group_id`. A collision on the invitation code is
 * retried inside a savepoint; a second group for the same formation is a `CONFLICT`.
 */
export async function createGroup(tx: Queryable, input: CreateGroupInput): Promise<Group> {
  const formationId = identifier(input.formationId, 'formationId');
  const ownerId = identifier(input.ownerId, 'ownerId');
  const maxMembers = parse(maxMembersSchema, input.maxMembers ?? 10, 'maxMembers');
  const now = optionalInstant(input.now, 'now');

  const formationRows = await tx.execute<{
    id: string;
    owner_id: string;
    status: string;
  }>(sql`
    select id::text as id, owner_id::text as owner_id, status::text as status
    from public.formations
    where id = ${formationId}::uuid
    for update
  `);
  const formation = formationRows[0];
  if (formation === undefined) {
    throw new AppError('NOT_FOUND', 'Formation introuvable.');
  }
  if (formation.owner_id !== ownerId) {
    throw new AppError('FORBIDDEN', 'Seul le propriétaire peut créer le groupe de sa formation.');
  }
  if (formation.status !== 'active') {
    throw new AppError('CONFLICT', 'Une formation doit être active pour devenir un groupe.');
  }

  const existing = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.formationId, formationId));
  if (existing.length > 0) {
    throw new AppError('CONFLICT', 'Un groupe existe déjà pour cette formation.');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const inviteCode = generateInviteCode(input.random);
    try {
      return await tx.transaction(async (inner) => {
        const [group] = await inner
          .insert(groups)
          .values({
            formationId,
            ownerId,
            inviteCode,
            maxMembers,
            createdAt: now ?? sql`now()`,
            codeRotatedAt: now ?? sql`now()`,
          })
          .returning();
        if (group === undefined) {
          throw new AppError('INTERNAL_ERROR', 'Groupe introuvable après insertion.');
        }
        await inner.insert(groupMembers).values({
          groupId: group.id,
          userId: ownerId,
          role: 'owner',
          memberStatus: 'active',
          ...(now === undefined ? {} : { joinedAt: now }),
        });
        await inner
          .update(formations)
          .set({ groupId: group.id })
          .where(eq(formations.id, formationId));
        return group;
      });
    } catch (error) {
      if (isInviteCodeCollision(error)) {
        lastError = error;
        continue;
      }
      mapFormationCollision(error);
    }
  }
  throw new AppError(
    'CONFLICT',
    `Le code d’invitation n’a pas pu être généré après ${String(MAX_CODE_ATTEMPTS)} essais.`,
    { cause: lastError },
  );
}

export interface GroupRef {
  groupId: string;
}

/** EF-6 — reads a group under the caller's RLS (owner or member only). */
export async function getGroup(tx: Queryable, input: GroupRef): Promise<Group | null> {
  const groupId = identifier(input.groupId, 'groupId');
  const rows = await tx.select().from(groups).where(eq(groups.id, groupId));
  return rows[0] ?? null;
}

export interface GroupCodeInput {
  inviteCode: string;
}

/**
 * EF-6, CL-3 — resolves an invitation code. The lookup is meant for the service transaction of
 * SPEC-724: an invitee is not a member yet, so the RLS of `groups` hides the row from `userDb`
 * (ADR-0246). A rotated code returns `null` immediately.
 */
export async function findGroupByInviteCode(
  tx: Queryable,
  input: GroupCodeInput,
): Promise<Group | null> {
  const inviteCode = parseInviteCode(input.inviteCode);
  const rows = await tx.select().from(groups).where(eq(groups.inviteCode, inviteCode));
  return rows[0] ?? null;
}

export interface GroupMembershipRef extends GroupRef {
  userId: string;
}

/** EF-6 — reads one membership, including a past one (`left_at` may be set). */
export async function getGroupMembership(
  tx: Queryable,
  input: GroupMembershipRef,
): Promise<GroupMember | null> {
  const groupId = identifier(input.groupId, 'groupId');
  const userId = identifier(input.userId, 'userId');
  const rows = await tx
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return rows[0] ?? null;
}

/** EF-6 — lists the current members of a group, oldest entry first. */
export async function listGroupMembers(tx: Queryable, input: GroupRef): Promise<GroupMember[]> {
  const groupId = identifier(input.groupId, 'groupId');
  return tx
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId));
}

/** EF-3, CL-1 — active seats (the owner is a member and counts). */
export async function countActiveGroupMembers(tx: Queryable, input: GroupRef): Promise<number> {
  const groupId = identifier(input.groupId, 'groupId');
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count
    from public.group_members
    where group_id = ${groupId}::uuid and left_at is null
  `);
  return Number(rows[0]?.count ?? '0');
}

export interface JoinGroupInput {
  inviteCode: string;
  userId: string;
  now?: Date;
}

export interface JoinGroupResult {
  group: Group;
  member: GroupMember;
  /** True when the membership already existed and no seat was consumed. */
  alreadyMember: boolean;
}

/**
 * EF-3, CL-1, CL-3 — joins a group through its current code. The group row is locked before the
 * seat count, so two concurrent requests for the tenth place produce one success and one
 * `CONFLICT`. A former member who rejoins consumes a seat again. Must run in the service transaction
 * of SPEC-724 (an invitee has no membership yet, ADR-0246).
 */
export async function joinGroup(tx: Queryable, input: JoinGroupInput): Promise<JoinGroupResult> {
  const inviteCode = parseInviteCode(input.inviteCode);
  const userId = identifier(input.userId, 'userId');
  const now = optionalInstant(input.now, 'now');

  const groupRows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.groups
    where invite_code = ${inviteCode}
    for update
  `);
  const groupId = groupRows[0]?.id;
  if (groupId === undefined) {
    throw new AppError('NOT_FOUND', 'Code d’invitation inconnu ou expiré.');
  }
  const group = await getGroup(tx, { groupId });
  if (group === null) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }

  const existing = await getGroupMembership(tx, { groupId, userId });
  if (existing !== null && existing.leftAt === null) {
    return { group, member: existing, alreadyMember: true };
  }

  const active = await countActiveGroupMembers(tx, { groupId });
  if (active >= group.maxMembers) {
    throw new AppError('CONFLICT', 'Le groupe est complet : dix membres au plus.');
  }

  if (existing !== null) {
    const [member] = await tx
      .update(groupMembers)
      .set({
        memberStatus: 'active',
        leftAt: null,
        ...(now === undefined ? { joinedAt: sql`now()` } : { joinedAt: now }),
      })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning();
    if (member === undefined) {
      throw new AppError('INTERNAL_ERROR', 'Appartenance introuvable après réactivation.');
    }
    return { group, member, alreadyMember: false };
  }

  const [member] = await tx
    .insert(groupMembers)
    .values({
      groupId,
      userId,
      role: 'member',
      memberStatus: 'active',
      ...(now === undefined ? {} : { joinedAt: now }),
    })
    .returning();
  if (member === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Appartenance introuvable après insertion.');
  }
  return { group, member, alreadyMember: false };
}

export interface RotateInviteCodeInput extends GroupRef {
  ownerId: string;
  now?: Date;
  random?: RandomIndexSource;
}

/**
 * BR-GRP-05, CL-3 — replaces the invitation code; the previous code stops working immediately.
 * The group row is locked and a collision on the new code is retried in a savepoint (ET-2).
 */
export async function rotateInviteCode(
  tx: Queryable,
  input: RotateInviteCodeInput,
): Promise<Group> {
  const groupId = identifier(input.groupId, 'groupId');
  const ownerId = identifier(input.ownerId, 'ownerId');
  const now = optionalInstant(input.now, 'now');

  const groupRows = await tx.execute<{ owner_id: string }>(sql`
    select owner_id::text as owner_id
    from public.groups
    where id = ${groupId}::uuid
    for update
  `);
  const current = groupRows[0];
  if (current === undefined) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }
  if (current.owner_id !== ownerId) {
    throw new AppError('FORBIDDEN', 'Seul le propriétaire peut régénérer le code.');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const inviteCode = generateInviteCode(input.random);
    try {
      return await tx.transaction(async (inner) => {
        const [group] = await inner
          .update(groups)
          .set({
            inviteCode,
            codeRotatedAt: now ?? sql`now()`,
          })
          .where(eq(groups.id, groupId))
          .returning();
        if (group === undefined) {
          throw new AppError('INTERNAL_ERROR', 'Groupe introuvable après rotation.');
        }
        return group;
      });
    } catch (error) {
      if (isInviteCodeCollision(error)) {
        lastError = error;
        continue;
      }
      mapFormationCollision(error);
    }
  }
  throw new AppError(
    'CONFLICT',
    `Le code d’invitation n’a pas pu être généré après ${String(MAX_CODE_ATTEMPTS)} essais.`,
    { cause: lastError },
  );
}

export interface RemoveGroupMemberInput extends GroupMembershipRef {
  ownerId: string;
  now?: Date;
}

/** BR-GRP-05 — the owner removes a member; the owner's own row is never removable (CL-4). */
export async function removeGroupMember(
  tx: Queryable,
  input: RemoveGroupMemberInput,
): Promise<GroupMember> {
  const groupId = identifier(input.groupId, 'groupId');
  const ownerId = identifier(input.ownerId, 'ownerId');
  const userId = identifier(input.userId, 'userId');
  const now = optionalInstant(input.now, 'now');
  if (ownerId === userId) {
    throw new AppError('FORBIDDEN', 'Le propriétaire ne peut pas être retiré de son groupe.');
  }

  const group = await getGroup(tx, { groupId });
  if (group === null) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }
  if (group.ownerId !== ownerId) {
    throw new AppError('FORBIDDEN', 'Seul le propriétaire peut retirer un membre.');
  }

  const [member] = await tx
    .update(groupMembers)
    .set({
      memberStatus: 'completed' satisfies GroupMemberStatus,
      leftAt: now ?? sql`now()`,
    })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        isNull(groupMembers.leftAt),
      ),
    )
    .returning();
  if (member === undefined) {
    throw new AppError('NOT_FOUND', 'Membre actif introuvable.');
  }
  return member;
}

export interface LeaveGroupInput extends GroupMembershipRef {
  now?: Date;
  /**
   * SPEC-724 creates the individual copy of the programme inside this transaction and returns the
   * new formation identifier. The membership is only closed once the copy exists (EF-6).
   */
  createCopy: (context: { group: Group; userId: string }) => Promise<string>;
}

export interface LeaveGroupResult {
  group: Group;
  member: GroupMember;
  copyFormationId: string;
}

/**
 * EF-6, CL-4 — leaves a group without ever exposing an intermediate state without a formation.
 * The owner cannot use this path (property transfer is out of V1 scope); a failure of the copy
 * callback rolls the whole transaction back, so the member stays in the group.
 */
export async function leaveGroup(tx: Queryable, input: LeaveGroupInput): Promise<LeaveGroupResult> {
  const groupId = identifier(input.groupId, 'groupId');
  const userId = identifier(input.userId, 'userId');
  const now = optionalInstant(input.now, 'now');

  const groupRows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.groups
    where id = ${groupId}::uuid
    for update
  `);
  if (groupRows[0] === undefined) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }
  const group = await getGroup(tx, { groupId });
  if (group === null) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }

  const membership = await getGroupMembership(tx, { groupId, userId });
  if (membership === null || membership.leftAt !== null) {
    throw new AppError('NOT_FOUND', 'Appartenance active introuvable.');
  }
  if (membership.role === 'owner') {
    throw new AppError(
      'FORBIDDEN',
      'Le propriétaire ne peut pas quitter son groupe : le transfert de propriété est hors périmètre V1.',
    );
  }

  const copyFormationId = identifier(await input.createCopy({ group, userId }), 'copyFormationId');
  const copyRows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.formations
    where id = ${copyFormationId}::uuid and owner_id = ${userId}::uuid
  `);
  if (copyRows[0] === undefined) {
    throw new AppError(
      'CONFLICT',
      'La copie individuelle du programme doit appartenir au membre avant sa sortie.',
    );
  }

  const [member] = await tx
    .update(groupMembers)
    .set({
      memberStatus: 'completed' satisfies GroupMemberStatus,
      leftAt: now ?? sql`now()`,
    })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        isNull(groupMembers.leftAt),
      ),
    )
    .returning();
  if (member === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Appartenance introuvable après la sortie.');
  }
  return { group, member, copyFormationId };
}

export interface GroupProgressInput extends GroupRef {
  /** Optional filter on one member; the view already restricts rows to the caller's groups. */
  memberId?: string;
  /** EF-4 — a member can read their own row and the rows of the same group. */
  status?: GroupMemberStatus;
}

/**
 * EF-4, ET-3 — reads the limited projection of the group. Under `userDb`, the security-definer view
 * returns only the groups the caller belongs to; the query never touches a personal table.
 */
export async function listGroupProgress(
  tx: Queryable,
  input: GroupProgressInput,
): Promise<GroupMemberProgress[]> {
  const groupId = identifier(input.groupId, 'groupId');
  const memberId = input.memberId === undefined ? null : identifier(input.memberId, 'memberId');
  const status =
    input.status === undefined ? null : parse(memberStatusSchema, input.status, 'status');

  const rows = await tx.execute<{
    group_id: string;
    user_id: string;
    first_name: string | null;
    current_module_position: number | string;
    validated_modules: number | string;
    streak_days: number | string;
  }>(sql`
    select group_id, user_id, first_name, current_module_position, validated_modules, streak_days
    from public.group_member_progress
    where group_id = ${groupId}::uuid
      and (${memberId}::uuid is null or user_id = ${memberId}::uuid)
      and (
        ${status}::public.formation_status is null
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = ${groupId}::uuid
            and gm.user_id = group_member_progress.user_id
            and gm.member_status = ${status}::public.formation_status
            and gm.left_at is null
        )
      )
    order by first_name nulls last, user_id
  `);
  return rows.map((row) => ({
    groupId: row.group_id,
    userId: row.user_id,
    firstName: row.first_name,
    currentModulePosition: Number(row.current_module_position),
    validatedModules: Number(row.validated_modules),
    streakDays: Number(row.streak_days),
  }));
}

/** EF-4 — the limited progress row of one member, or `null` when the caller is not in the group. */
export async function getGroupMemberProgress(
  tx: Queryable,
  input: GroupMembershipRef,
): Promise<GroupMemberProgress | null> {
  const groupId = identifier(input.groupId, 'groupId');
  const userId = identifier(input.userId, 'userId');
  const rows = await listGroupProgress(tx, { groupId, memberId: userId });
  return rows[0] ?? null;
}

/**
 * EF-5, ET-5, CL-5, CL-6 — counts the active formations of a user: owned formations with status
 * `active` plus memberships whose `member_status` is `active` and still open. The SQL function uses
 * `union`, so a member who owns their own group is counted once; a paused membership does not
 * count. Under `userDb` it refuses an identifier other than `auth.uid()`.
 */
export async function countActiveFormations(tx: Queryable, userId: string): Promise<number> {
  const parsed = identifier(userId, 'userId');
  const rows = await tx.execute<{ count: number | string }>(sql`
    select public.count_active_formations(${parsed}::uuid) as count
  `);
  return Number(rows[0]?.count ?? 0);
}
