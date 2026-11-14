import { z } from 'zod';

import {
  GROUP_MAX_MEMBERS,
  type FormationGroupStatus,
  type GroupDto,
  type GroupLeaveResult,
  type GroupMemberView,
  type GroupState,
  type GroupViewerRole,
  type InvitationAccepted,
  type InvitationPreview,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import {
  countActiveFormations,
  createGroup,
  findGroupByInviteCode,
  getGroup,
  getGroupMembership,
  joinGroup,
  leaveGroup,
  listGroupMembers,
  listGroupProgress,
  parseInviteCode,
  removeGroupMember,
  rotateInviteCode,
  serviceDb,
  sql,
  type Db,
  type DbTx,
  type Group,
  type GroupMember,
} from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

// Shared-formation service (SPEC-724 EF-1 to EF-5, ET-1 to ET-5; BR-GRP-01 to BR-GRP-05,
// BR-APP-03, ADR-0035). The programme of a group is one `formations` row shared by its members;
// every personal row stays indexed by its owner and is only moved — never copied to another
// learner — when a member leaves (ET-5). The invitation lookup and the acceptance run with the
// service client because an invitee has no membership yet (ADR-0246); everything else runs with the
// caller's RLS client, so another learner's group is a 404, never a 403.

/** The service client is optional so unit tests inject a fake; routes use the real one. */
export interface GroupServiceContext extends ServiceContext {
  sdb?: Db;
}

const uuidSchema = z.uuid();
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^LRN-[A-Z0-9]{4}$/);

function validationError(field: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${message}`, {
    errors: [{ path: field, message }],
  });
}

function identifier(value: string, field: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw validationError(field, 'identifiant UUID attendu');
  return parsed.data;
}

function inviteCode(value: string): string {
  const parsed = codeSchema.safeParse(value);
  if (!parsed.success) throw validationError('code', 'format LRN-XXXX attendu');
  try {
    return parseInviteCode(parsed.data);
  } catch {
    throw validationError('code', 'format LRN-XXXX attendu');
  }
}

function systemDb(ctx: GroupServiceContext): Db {
  return ctx.sdb ?? serviceDb();
}

interface FormationAccessRow {
  [key: string]: unknown;
  id: string;
  title: string;
  status: FormationGroupStatus;
  owner_id: string;
  group_id: string | null;
  group_owner_id: string | null;
}

/**
 * CL-1, ET-1 — the formation is readable only by its owner or an active member of its group.
 * RLS already hides the row; the explicit membership condition keeps the same answer when the
 * service runs with the test double of the caller client.
 */
async function readFormationAccess(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FormationAccessRow> {
  const rows = await tx.execute<FormationAccessRow>(sql`
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.owner_id::text as owner_id,
           f.group_id::text as group_id,
           g.owner_id::text as group_owner_id
    from public.formations f
    left join public.groups g on g.id = f.group_id
    where f.id = ${formationId}::uuid
      and (
        f.owner_id = ${userId}::uuid
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = f.group_id
            and gm.user_id = ${userId}::uuid
            and gm.left_at is null
        )
      )
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return row;
}

async function readGroupFormation(tx: DbTx, groupId: string): Promise<FormationAccessRow> {
  const rows = await tx.execute<FormationAccessRow>(sql`
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.owner_id::text as owner_id,
           f.group_id::text as group_id,
           g.owner_id::text as group_owner_id
    from public.formations f
    join public.groups g on g.id = f.group_id
    where g.id = ${groupId}::uuid
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  return row;
}

function memberSortKey(member: GroupMemberView): string {
  const name = (member.firstName ?? '').toLocaleLowerCase('fr-FR');
  return `${member.role === 'owner' ? '0' : '1'}:${name}:${member.userId}`;
}

/** ET-5 — the membership row reuses `formation_status`; only the three member states are legal. */
function memberStatusOf(value: GroupMember['memberStatus']): GroupMemberView['memberStatus'] {
  return value === 'paused' || value === 'completed' ? value : 'active';
}

/**
 * ET-5 — builds the only projection a group page may receive. The progress view returns six
 * columns; the membership contributes the role and status, never an address, note, gap, resource,
 * course or discussion.
 */
async function buildGroupDto(
  tx: DbTx,
  group: Group,
  formationTitle: string,
  viewerRole: GroupViewerRole,
): Promise<GroupDto> {
  const [members, progress] = await Promise.all([
    listGroupMembers(tx, { groupId: group.id }),
    listGroupProgress(tx, { groupId: group.id }),
  ]);
  const progressByUser = new Map(progress.map((row) => [row.userId, row]));
  const views: GroupMemberView[] = members.map((member: GroupMember) => {
    const row = progressByUser.get(member.userId);
    return {
      userId: member.userId,
      firstName: row?.firstName ?? null,
      role: member.role,
      memberStatus: memberStatusOf(member.memberStatus),
      currentModulePosition: row?.currentModulePosition ?? 0,
      validatedModules: row?.validatedModules ?? 0,
      streakDays: row?.streakDays ?? 0,
    };
  });
  views.sort((left, right) => memberSortKey(left).localeCompare(memberSortKey(right)));
  return {
    id: group.id,
    formationId: group.formationId,
    formationTitle,
    inviteCode: group.inviteCode,
    inviteLink: `/invitation/${group.inviteCode}`,
    maxMembers: group.maxMembers,
    memberCount: views.length,
    ownerId: group.ownerId,
    viewerRole,
    canManage: viewerRole === 'owner',
    canLeave: viewerRole === 'member',
    members: views,
  };
}

async function buildGroupState(
  tx: DbTx,
  userId: string,
  access: FormationAccessRow,
): Promise<GroupState> {
  if (access.group_id === null) {
    return {
      formationId: access.id,
      formationTitle: access.title,
      formationStatus: access.status,
      group: null,
      canCreate: access.owner_id === userId && access.status === 'active',
    };
  }
  const group = await getGroup(tx, { groupId: access.group_id });
  if (group === null) throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  const membership = await getGroupMembership(tx, {
    groupId: group.id,
    userId,
  });
  if (membership === null || membership.leftAt !== null) {
    throw new AppError('NOT_FOUND', 'Groupe introuvable.');
  }
  const dto = await buildGroupDto(tx, group, access.title, membership.role);
  return {
    formationId: access.id,
    formationTitle: access.title,
    formationStatus: access.status,
    group: dto,
    canCreate: false,
  };
}

/** EF-3 — `GET /formations/:fid/group`; the owner of a formation without group gets `group: null`. */
export function getFormationGroup(
  ctx: GroupServiceContext,
  formationId: string,
): Promise<Result<GroupState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const fid = identifier(formationId, 'fid');
    return db.run(async (tx) => {
      const access = await readFormationAccess(tx, userId, fid);
      return buildGroupState(tx, userId, access);
    });
  });
}

/**
 * BR-GRP-01, ET-3 — creates the group of an active formation owned by the caller. The repository
 * already validates ownership, active status, code uniqueness and the owner membership; the event
 * is emitted only after the commit with a stable identifier, so a replay creates nothing (CL-2).
 */
export function createFormationGroup(
  ctx: GroupServiceContext,
  formationId: string,
): Promise<Result<GroupState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const fid = identifier(formationId, 'fid');
    const now = ctx.clock.now();
    const state = await db.run(async (tx) => {
      await createGroup(tx, { formationId: fid, ownerId: userId, now });
      const access = await readFormationAccess(tx, userId, fid);
      if (access.group_id === null) {
        throw new AppError('INTERNAL_ERROR', 'Le groupe n’a pas pu être rattaché à la formation.');
      }
      return buildGroupState(tx, userId, access);
    });
    await emitAfterCommit(
      db,
      'group/member-joined',
      { groupId: state.group?.id ?? fid, formationId: fid, userId },
      { id: `group-member-joined:${state.group?.id ?? fid}:${userId}` },
    );
    return state;
  });
}

/** BR-GRP-05 — the owner rotates the code; the repository locks the row and retries collisions. */
export function rotateGroupCode(
  ctx: GroupServiceContext,
  groupId: string,
): Promise<Result<GroupState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const gid = identifier(groupId, 'gid');
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      await rotateInviteCode(tx, { groupId: gid, ownerId: userId, now });
      const access = await readGroupFormation(tx, gid);
      return buildGroupState(tx, userId, access);
    });
  });
}

/** BR-GRP-05, EF-4 — the owner removes a member; the removed member keeps their private history. */
export function removeMemberFromGroup(
  ctx: GroupServiceContext,
  groupId: string,
  memberId: string,
): Promise<Result<GroupState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const gid = identifier(groupId, 'gid');
    const uid = identifier(memberId, 'uid');
    const now = ctx.clock.now();
    const state = await db.run(async (tx) => {
      await removeGroupMember(tx, { groupId: gid, userId: uid, ownerId: userId, now });
      const access = await readGroupFormation(tx, gid);
      return buildGroupState(tx, userId, access);
    });
    // The owner acts on another learner: the event is enqueued with the service role, which is
    // the only role allowed to write a `userId` different from `auth.uid()` (ADR-0122).
    await emitAfterCommit(
      systemDb(ctx),
      'group/member-left',
      { groupId: gid, formationId: state.formationId, userId: uid },
      { id: `group-member-left:${gid}:${uid}` },
    );
    return state;
  });
}

/**
 * EF-4, CL-5 — a member leaves: the repository creates the individual copy in the same transaction
 * and only then closes the membership. The owner is refused (property transfer is out of V1).
 */
export function leaveFormationGroup(
  ctx: GroupServiceContext,
  groupId: string,
): Promise<Result<GroupLeaveResult>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const gid = identifier(groupId, 'gid');
    const now = ctx.clock.now();
    const db = systemDb(ctx);
    const result = await db.transaction(async (tx) => {
      const left = await leaveGroup(tx, {
        groupId: gid,
        userId,
        now,
        createCopy: ({ group }) =>
          copyProgrammeForMember(tx, {
            sourceFormationId: group.formationId,
            userId,
            now,
          }),
      });
      await tx.execute(sql`
        update public.profiles
        set current_formation_id = ${left.copyFormationId}::uuid
        where id = ${userId}::uuid
          and current_formation_id = ${left.group.formationId}::uuid
      `);
      const rows = await tx.execute<{ title: string }>(sql`
        select title
        from public.formations
        where id = ${left.copyFormationId}::uuid
      `);
      return {
        formationId: left.copyFormationId,
        formationTitle: rows[0]?.title ?? 'Formation individuelle',
        previousGroupId: gid,
        leftAt: now.toISOString(),
        sourceFormationId: left.group.formationId,
      };
    });
    await emitAfterCommit(
      db,
      'group/member-left',
      { groupId: gid, formationId: result.sourceFormationId, userId },
      { id: `group-member-left:${gid}:${userId}` },
    );
    return {
      formationId: result.formationId,
      formationTitle: result.formationTitle,
      previousGroupId: result.previousGroupId,
      leftAt: result.leftAt,
    };
  });
}

/** ET-3 — public preview; a rotated or unknown code is a 404 without revealing the group. */
export function getInvitationPreview(
  ctx: GroupServiceContext,
  code: string,
): Promise<Result<InvitationPreview>> {
  return toResult(async () => {
    const invite = inviteCode(code);
    const db = systemDb(ctx);
    return db.transaction(async (tx) => {
      const group = await findGroupByInviteCode(tx, { inviteCode: invite });
      if (group === null) throw new AppError('NOT_FOUND', 'Invitation inconnue ou expirée.');
      const rows = await tx.execute<{ title: string }>(sql`
        select title from public.formations where id = ${group.formationId}::uuid
      `);
      const title = rows[0]?.title;
      if (title === undefined) throw new AppError('NOT_FOUND', 'Invitation inconnue ou expirée.');
      const active = await countActiveGroupMembersSafe(tx, group.id);
      return {
        code: group.inviteCode,
        formationId: group.formationId,
        formationTitle: title,
        memberCount: Math.max(1, active),
        maxMembers: group.maxMembers,
        full: active >= group.maxMembers,
      };
    });
  });
}

async function countActiveGroupMembersSafe(tx: DbTx, groupId: string): Promise<number> {
  const rows = await tx.execute<{ count: number | string }>(sql`
    select count(*)::int as count
    from public.group_members
    where group_id = ${groupId}::uuid and left_at is null
  `);
  return Number(rows[0]?.count ?? 0);
}

interface AcceptOutcome {
  accepted: InvitationAccepted;
  groupId: string;
  alreadyMember: boolean;
  formationId: string;
}

/**
 * EF-2, ET-4, CL-4 — accepts an invitation. An advisory lock on the learner serialises the
 * three-active-formations count; the group row is locked by `joinGroup` before the seat count, so a
 * simultaneous eleventh request cannot pass. A replay is a no-op without a second event.
 */
export function acceptInvitation(
  ctx: GroupServiceContext,
  code: string,
): Promise<Result<InvitationAccepted>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const invite = inviteCode(code);
    const db = systemDb(ctx);
    const now = ctx.clock.now();
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('formations:' || ${userId}, 0))
      `);
      const group = await findGroupByInviteCode(tx, { inviteCode: invite });
      if (group === null) throw new AppError('NOT_FOUND', 'Invitation inconnue ou expirée.');
      const existing = await getGroupMembership(tx, { groupId: group.id, userId });
      if (existing !== null && existing.leftAt === null) {
        return {
          accepted: await acceptedDto(tx, group.formationId, group.id, userId),
          groupId: group.id,
          alreadyMember: true,
          formationId: group.formationId,
        } satisfies AcceptOutcome;
      }
      const activeCount = await countActiveFormations(tx, userId);
      if (activeCount >= 3) {
        throw new AppError(
          'FORMATION_LIMIT_REACHED',
          'Trois formations actives au plus. Mettez une formation en pause pour rejoindre celle-ci.',
        );
      }
      try {
        const joined = await joinGroup(tx, { inviteCode: group.inviteCode, userId, now });
        await initializeMemberProgress(tx, joined.group.formationId, userId, now);
        await tx.execute(sql`
          update public.profiles
          set current_formation_id = ${joined.group.formationId}::uuid
          where id = ${userId}::uuid
        `);
        return {
          accepted: await acceptedDto(tx, joined.group.formationId, joined.group.id, userId),
          groupId: joined.group.id,
          alreadyMember: joined.alreadyMember,
          formationId: joined.group.formationId,
        } satisfies AcceptOutcome;
      } catch (error) {
        if (error instanceof AppError && error.code === 'CONFLICT') {
          throw new AppError('GROUP_FULL', 'Le groupe est complet : dix membres au plus.', {
            cause: error,
          });
        }
        throw error;
      }
    });
    if (!outcome.alreadyMember) {
      await emitAfterCommit(
        db,
        'group/member-joined',
        {
          groupId: outcome.groupId,
          formationId: outcome.formationId,
          userId,
        },
        { id: `group-member-joined:${outcome.groupId}:${userId}` },
      );
    }
    return outcome.accepted;
  });
}

async function acceptedDto(
  tx: DbTx,
  formationId: string,
  groupId: string,
  userId: string,
): Promise<InvitationAccepted> {
  const rows = await tx.execute<{ title: string }>(sql`
    select title from public.formations where id = ${formationId}::uuid
  `);
  const title = rows[0]?.title;
  if (title === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  const names = await tx.execute<{ first_name: string | null }>(sql`
    select p.first_name
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = ${groupId}::uuid
      and gm.left_at is null
      and gm.user_id <> ${userId}::uuid
    order by p.first_name nulls last, gm.user_id
  `);
  return {
    formationId,
    formationTitle: title,
    memberFirstNames: names
      .map((row) => row.first_name?.trim() ?? '')
      .filter((name) => name !== '')
      .slice(0, GROUP_MAX_MEMBERS - 1),
  };
}

/** EF-2 — a new member gets their own module progression; the shared programme is untouched. */
async function initializeMemberProgress(
  tx: DbTx,
  formationId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into public.module_progress (user_id, module_id, status, opened_at, updated_at)
    select ${userId}::uuid,
           m.id,
           case when m.position = 1 then 'open'::public.module_status
                else 'locked'::public.module_status end,
           case when m.position = 1 then ${now.toISOString()}::timestamptz else null end,
           ${now.toISOString()}::timestamptz
    from public.modules m
    where m.formation_id = ${formationId}::uuid
      and not exists (
        select 1 from public.module_progress mp
        where mp.user_id = ${userId}::uuid and mp.module_id = m.id
      )
  `);
}

interface ModuleRow {
  [key: string]: unknown;
  id: string;
  position: number;
}

interface IdRow {
  [key: string]: unknown;
  id: string;
}

function pairs(values: readonly (readonly [string, string])[]) {
  return sql.join(
    values.map(([oldId, newId]) => sql`(${oldId}::uuid, ${newId}::uuid)`),
    sql`, `,
  );
}

/**
 * EF-4, ET-5 — the individual copy of the shared programme created when a member leaves (or is
 * removed through the same transaction). The programme entities are new rows owned by the member;
 * every personal row of the member is then *moved* to the copied entities: progress, apports,
 * course versions and their sections, reading progress, summaries, memory states, bricks,
 * activities and planned sessions. Another learner's rows are never selected (BR-APP-03).
 */
export async function copyProgrammeForMember(
  tx: DbTx,
  input: { sourceFormationId: string; userId: string; now: Date },
): Promise<string> {
  const sourceId = identifier(input.sourceFormationId, 'sourceFormationId');
  const userId = identifier(input.userId, 'userId');
  const now = input.now.toISOString();

  const sourceRows = await tx.execute<{ title: string; status: string }>(sql`
    select title, status::text as status
    from public.formations
    where id = ${sourceId}::uuid
  `);
  const source = sourceRows[0];
  if (source === undefined) throw new AppError('NOT_FOUND', 'Formation source introuvable.');
  if (source.status !== 'active' && source.status !== 'paused') {
    throw new AppError('CONFLICT', 'Seule une formation active peut être copiée.');
  }

  const copied = await tx.execute<IdRow>(sql`
    insert into public.formations (
      owner_id, title, monogram, accent_color, description, objectives, status,
      cadrage_profile, volume_hours, start_date, end_date, study_override, default_threshold,
      exam_format, course_language, last_opened_at, created_at, updated_at
    )
    select ${userId}::uuid, title, monogram, accent_color, description, objectives, 'active',
           cadrage_profile, volume_hours, start_date, end_date, study_override, default_threshold,
           exam_format, course_language, ${now}::timestamptz, ${now}::timestamptz,
           ${now}::timestamptz
    from public.formations
    where id = ${sourceId}::uuid
    returning id::text as id
  `);
  const formationId = copied[0]?.id;
  if (formationId === undefined) {
    throw new AppError('INTERNAL_ERROR', 'La copie individuelle n’a pas pu être créée.');
  }

  await tx.execute(sql`
    insert into public.modules (
      formation_id, position, title, objectives, planned_start, planned_end, threshold,
      status, created_at, updated_at
    )
    select ${formationId}::uuid, position, title, objectives, planned_start, planned_end, threshold,
           'locked'::public.module_status, ${now}::timestamptz, ${now}::timestamptz
    from public.modules
    where formation_id = ${sourceId}::uuid
    order by position
  `);

  await tx.execute(sql`
    insert into public.chapters (
      module_id, formation_id, position, title, created_at, updated_at
    )
    select nm.id, ${formationId}::uuid, c.position, c.title, ${now}::timestamptz,
           ${now}::timestamptz
    from public.chapters c
    join public.modules om on om.id = c.module_id and om.formation_id = ${sourceId}::uuid
    join public.modules nm on nm.formation_id = ${formationId}::uuid and nm.position = om.position
  `);

  await tx.execute(sql`
    insert into public.notions (
      formation_id, module_id, chapter_id, label, short_definition, position, created_by,
      created_at, updated_at
    )
    select ${formationId}::uuid, nm.id, nc.id, n.label, n.short_definition, n.position,
           n.created_by, ${now}::timestamptz, ${now}::timestamptz
    from public.notions n
    join public.modules om on om.id = n.module_id and om.formation_id = ${sourceId}::uuid
    join public.chapters oc on oc.id = n.chapter_id
    join public.modules nm on nm.formation_id = ${formationId}::uuid and nm.position = om.position
    join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
  `);

  const modules = await tx.execute<ModuleRow>(sql`
    select om.id::text as id, om.position
    from public.modules om
    where om.formation_id = ${sourceId}::uuid
    order by om.position
  `);
  const newModules = await tx.execute<ModuleRow>(sql`
    select nm.id::text as id, nm.position
    from public.modules nm
    where nm.formation_id = ${formationId}::uuid
    order by nm.position
  `);
  const newByPosition = new Map(newModules.map((row) => [row.position, row.id]));
  const modulePairs: [string, string][] = [];
  for (const row of modules) {
    const next = newByPosition.get(row.position);
    if (next !== undefined) modulePairs.push([row.id, next]);
  }

  const notions = await tx.execute<{ old_id: string; new_id: string }>(sql`
    select old_notion.id::text as old_id, new_notion.id::text as new_id
    from public.notions old_notion
    join public.modules om
      on om.id = old_notion.module_id and om.formation_id = ${sourceId}::uuid
    join public.chapters oc on oc.id = old_notion.chapter_id
    join public.modules nm on nm.formation_id = ${formationId}::uuid and nm.position = om.position
    join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
    join public.notions new_notion
      on new_notion.chapter_id = nc.id and new_notion.position = old_notion.position
  `);
  const notionPairs: [string, string][] = notions.map((row) => [row.old_id, row.new_id]);

  const chapters = await tx.execute<{ old_id: string; new_id: string }>(sql`
    select oc.id::text as old_id, nc.id::text as new_id
    from public.chapters oc
    join public.modules om on om.id = oc.module_id and om.formation_id = ${sourceId}::uuid
    join public.modules nm on nm.formation_id = ${formationId}::uuid and nm.position = om.position
    join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
  `);
  const chapterPairs: [string, string][] = chapters.map((row) => [row.old_id, row.new_id]);

  if (notionPairs.length > 0) {
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(notionPairs)})
      insert into public.notion_links (
        formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale, created_at
      )
      select ${formationId}::uuid,
             (select new_id from map where map.old_id = l.from_notion_id),
             (select new_id from map where map.old_id = l.to_notion_id),
             l.kind, l.owner_id, l.rationale, ${now}::timestamptz
      from public.notion_links l
      where l.formation_id = ${sourceId}::uuid
        and (l.owner_id is null or l.owner_id = ${userId}::uuid)
        and exists (select 1 from map where map.old_id = l.from_notion_id)
        and exists (select 1 from map where map.old_id = l.to_notion_id)
    `);
  }

  if (modulePairs.length > 0) {
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(modulePairs)})
      update public.module_progress mp
      set module_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where mp.user_id = ${userId}::uuid and mp.module_id = map.old_id
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(modulePairs)})
      update public.courses c
      set formation_id = ${formationId}::uuid,
          module_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where c.owner_id = ${userId}::uuid
        and c.formation_id = ${sourceId}::uuid
        and c.module_id = map.old_id
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(modulePairs)})
      update public.schedule_slots s
      set formation_id = ${formationId}::uuid,
          module_id = map.new_id,
          group_milestone = false,
          updated_at = ${now}::timestamptz
      from map
      where s.user_id = ${userId}::uuid
        and s.formation_id = ${sourceId}::uuid
        and s.module_id = map.old_id
    `);
    await tx.execute(sql`
      update public.schedule_slots
      set formation_id = ${formationId}::uuid,
          group_milestone = false,
          updated_at = ${now}::timestamptz
      where user_id = ${userId}::uuid
        and formation_id = ${sourceId}::uuid
        and module_id is null
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(modulePairs)})
      update public.activities a
      set formation_id = ${formationId}::uuid,
          module_id = map.new_id
      from map
      where a.owner_id = ${userId}::uuid
        and a.formation_id = ${sourceId}::uuid
        and a.module_id = map.old_id
    `);
    await tx.execute(sql`
      update public.activities
      set formation_id = ${formationId}::uuid
      where owner_id = ${userId}::uuid
        and formation_id = ${sourceId}::uuid
        and module_id is null
    `);
    await tx.execute(sql`
      update public.notifications n
      set formation_id = ${formationId}::uuid,
          href = replace(n.href, ${sourceId}, ${formationId})
      where n.user_id = ${userId}::uuid
        and n.formation_id = ${sourceId}::uuid
    `);
    await tx.execute(sql`
      update public.notifications
      set formation_id = ${formationId}::uuid,
          href = replace(href, ${sourceId}, ${formationId})
      where user_id = ${userId}::uuid
        and formation_id = ${sourceId}::uuid
    `);
    await tx.execute(sql`
      update public.automation_actions
      set formation_id = ${formationId}::uuid
      where user_id = ${userId}::uuid
        and formation_id = ${sourceId}::uuid
    `);
  }

  if (chapterPairs.length > 0) {
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(chapterPairs)})
      update public.chapter_progress cp
      set chapter_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where cp.user_id = ${userId}::uuid and cp.chapter_id = map.old_id
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(chapterPairs)})
      update public.reading_progress rp
      set chapter_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where rp.user_id = ${userId}::uuid and rp.chapter_id = map.old_id
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(chapterPairs)})
      update public.chapter_summaries cs
      set chapter_id = map.new_id
      from map
      where cs.user_id = ${userId}::uuid and cs.chapter_id = map.old_id
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(chapterPairs)})
      update public.course_sections s
      set chapter_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where s.owner_id = ${userId}::uuid and s.chapter_id = map.old_id
    `);
    await tx.execute(sql`
      update public.resources r
      set formation_id = ${formationId}::uuid
      where r.owner_id = ${userId}::uuid
        and r.formation_id = ${sourceId}::uuid
        and r.chapter_id is null
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(chapterPairs)})
      update public.resources r
      set formation_id = ${formationId}::uuid,
          chapter_id = map.new_id,
          updated_at = ${now}::timestamptz
      from map
      where r.owner_id = ${userId}::uuid
        and r.formation_id = ${sourceId}::uuid
        and r.chapter_id = map.old_id
    `);
  }

  if (notionPairs.length > 0) {
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(notionPairs)})
      update public.notion_states ns
      set notion_id = map.new_id,
          gap_confused_with = (
            select m2.new_id from map m2 where m2.old_id = ns.gap_confused_with
          ),
          updated_at = ${now}::timestamptz
      from map
      where ns.user_id = ${userId}::uuid and ns.notion_id = map.old_id
    `);
    await tx.execute(sql`
      update public.bricks b
      set formation_id = ${formationId}::uuid,
          notion_ids = coalesce(
            (
              select array_agg(coalesce(m.new_id, x.old_id) order by x.ord)
              from unnest(b.notion_ids) with ordinality as x(old_id, ord)
              left join (values ${pairs(notionPairs)}) as m(old_id, new_id)
                on m.old_id = x.old_id
            ),
            '{}'::uuid[]
          )
      where b.owner_id = ${userId}::uuid
        and b.formation_id = ${sourceId}::uuid
    `);
    await tx.execute(sql`
      with map(old_id, new_id) as (values ${pairs(notionPairs)})
      update public.course_sections s
      set notion_ids = coalesce(
        (
          select array_agg(coalesce(map.new_id, x.old_id) order by x.ord)
          from unnest(s.notion_ids) with ordinality as x(old_id, ord)
          left join map on map.old_id = x.old_id
        ),
        '{}'::uuid[]
      )
      where s.owner_id = ${userId}::uuid
        and exists (
          select 1 from public.courses c
          where c.id = s.course_id
            and c.owner_id = ${userId}::uuid
            and c.formation_id = ${formationId}::uuid
        )
    `);
  }

  await tx.execute(sql`
    update public.modules m
    set status = mp.status,
        opened_at = mp.opened_at,
        validated_at = mp.validated_at,
        updated_at = ${now}::timestamptz
    from public.module_progress mp
    where mp.module_id = m.id
      and mp.user_id = ${userId}::uuid
      and m.formation_id = ${formationId}::uuid
  `);
  await tx.execute(sql`
    update public.modules m
    set status = 'open'::public.module_status,
        opened_at = ${now}::timestamptz,
        updated_at = ${now}::timestamptz
    where m.formation_id = ${formationId}::uuid
      and m.id = (
        select first_module.id
        from public.modules first_module
        where first_module.formation_id = ${formationId}::uuid
        order by first_module.position
        limit 1
      )
      and not exists (
        select 1 from public.module_progress mp
        where mp.module_id = m.id and mp.user_id = ${userId}::uuid
      )
  `);

  return formationId;
}
