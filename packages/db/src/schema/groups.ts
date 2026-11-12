// Group schema (SPEC-111 EF-1, EF-2, ET-1; docs/architecture/data-model.md §10, ADR-0035).
//
// A group shares one `formations` row and therefore the same modules, chapters, notions and
// programme links; everything personal stays indexed by `user_id` (BR-GRP-04). The owner is also a
// member and counts towards the ten seats (EF-2). The invitation code is unique and follows the
// `LRN-XXXX` shape over the unambiguous alphabet `A-Z2-9` (ET-2). `formations.group_id` is declared
// by SPEC-103; its foreign key back to `groups` is added by the custom migration `groups_rules`
// because Drizzle cannot express the cycle between the two table modules (ADR-0246).
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { formationStatus, formations } from './formations';
import { profiles } from './identity';

/** BR-GRP-05 — the owner administers the group; every other member is a simple member. */
export const groupRole = pgEnum('group_role', ['owner', 'member']);

export const GROUP_ROLES = groupRole.enumValues;

/**
 * EF-2, CL-5 — the status of the shared formation *for this member*. The column reuses the
 * `formation_status` enumeration of `data-model.md` §10, but only these three values make sense for
 * a membership; the `check` in the table enforces it (ADR-0246).
 */
export const GROUP_MEMBER_STATUSES = ['active', 'paused', 'completed'] as const;

/** EF-1 — the canonical invitation-code shape (`LRN-` and four characters from `A-Z2-9`). */
export const GROUP_INVITE_CODE_PATTERN = /^LRN-[A-Z2-9]{4}$/;

/** EF-1, ET-1 — one group per shared formation, at most ten members (owner included). */
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    inviteCode: text('invite_code').notNull(),
    maxMembers: smallint('max_members').notNull().default(10),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    codeRotatedAt: timestamp('code_rotated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-1 — one group per formation.
    unique('groups_formation_id_unique').on(table.formationId),
    // EF-1, EF-3 — the invitation code identifies exactly one group.
    unique('groups_invite_code_unique').on(table.inviteCode),
    index('groups_owner_id_idx').on(table.ownerId),
    // ET-1 — the shape is checked in the database too, not only in the repository.
    check('groups_invite_code_format_check', sql`${table.inviteCode} ~ '^LRN-[A-Z2-9]{4}$'`),
    // ET-1 — the owner is a member, so at least two seats and never more than ten.
    check('groups_max_members_check', sql`${table.maxMembers} between 2 and 10`),
    check('groups_code_rotated_at_check', sql`${table.codeRotatedAt} >= ${table.createdAt}`),
  ],
);

/**
 * EF-2, EF-3 — membership of a shared formation. The composite primary key makes joining the same
 * group twice impossible; `left_at` frees the seat without erasing the history needed by a later
 * audit. The owner's row carries `role = 'owner'` and is protected by triggers (ADR-0246).
 */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: groupRole('role').notNull().default('member'),
    memberStatus: formationStatus('member_status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ name: 'group_members_pkey', columns: [table.groupId, table.userId] }),
    // EF-6 — the member reads the groups they belong to; the owner reads the members of a group.
    index('group_members_user_id_idx').on(table.userId),
    index('group_members_group_id_active_idx')
      .on(table.groupId)
      .where(sql`${table.leftAt} is null`),
    // ET-1, EF-2 — only a membership status is meaningful for a member.
    check(
      'group_members_member_status_check',
      sql`${table.memberStatus} in ('active', 'paused', 'completed')`,
    ),
    // EF-2 — a departure cannot precede the entry.
    check(
      'group_members_left_at_check',
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
  ],
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
export type GroupRole = (typeof GROUP_ROLES)[number];
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

/** EF-4 — the six columns the limited progress view is allowed to return. */
export interface GroupMemberProgress {
  groupId: string;
  userId: string;
  firstName: string | null;
  currentModulePosition: number;
  validatedModules: number;
  streakDays: number;
}

export const GROUP_MEMBER_PROGRESS_COLUMNS = [
  'group_id',
  'user_id',
  'first_name',
  'current_module_position',
  'validated_modules',
  'streak_days',
] as const;
