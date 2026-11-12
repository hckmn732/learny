// Nightly account deletion of SPEC-211 (EF-7, ET-4, ET-5, CL-7, CL-8, CL-9, ADR-0216).
//
// Steps run in the order fixed by ADR-0216: capture the address under `select … for update`, transfer
// or delete the shared formations, remove the private blobs, anonymise `ai_calls`, delete the
// business rows (the profile cascades), delete the Auth user, then send `deletion_completed` to the
// captured address. Every step is idempotent: a replay after a failed step resumes at that step.
import { sql } from 'drizzle-orm';

import { type Clock, type LearnyLogger } from '@learny/core';
import { serviceDb } from '@learny/db';
import { sendEmail } from '@learny/notifications/email';

import type { JobContext } from '../context';
import type { StepRunner } from '../functions/data-export';

import { defaultDeletionDeps, type DeletionDeps } from './deps';
import { formatLongDate } from './zip-layout';

type Row = Record<string, unknown>;

export interface AccountDeletionArgs {
  ctx: JobContext & { clock: Clock };
  step: StepRunner;
  logger: LearnyLogger;
  userId: string;
}

export interface RemainingRow {
  table: string;
  remaining: number;
}

export interface AccountDeletionOutcome {
  deleted: boolean;
  tables: RemainingRow[];
  authStatus: 'supprimé' | 'présent';
  emails: { template: string; to: string; at: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Tables of the public schema that reference a learner (`user_id` or `owner_id`). */
async function personalTables(): Promise<{ table: string; column: string }[]> {
  const rows = await serviceDb().execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name in ('user_id', 'owner_id')
      and table_name <> 'profiles'
    order by table_name
  `);
  return rows
    .filter((row) => /^[a-z_]+$/.test(row.table_name) && /^[a-z_]+$/.test(row.column_name))
    .map((row) => ({ table: row.table_name, column: row.column_name }));
}

/** Counts the rows still linked to a learner, table by table (the EF-5 information_schema check). */
export async function remainingPersonalRows(userId: string): Promise<RemainingRow[]> {
  if (!UUID.test(userId)) throw new Error('identifiant utilisateur invalide');
  const tables = await personalTables();
  const result: RemainingRow[] = [];
  for (const { table, column } of tables) {
    const rows = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${userId}::uuid`,
    );
    result.push({ table, remaining: rows[0]?.n ?? 0 });
  }
  return result;
}

async function transferGroups(userId: string): Promise<{ transferred: number; removed: number }> {
  const db = serviceDb();
  return db.transaction(async (tx) => {
    const groups = await tx.execute<Row>(sql`
      select g.id::text as id, g.formation_id::text as formation_id,
             (
               select gm.user_id::text
               from public.group_members gm
               where gm.group_id = g.id
                 and gm.user_id <> ${userId}::uuid
                 and gm.left_at is null
               order by gm.joined_at, gm.user_id
               limit 1
             ) as new_owner
      from public.groups g
      where g.owner_id = ${userId}::uuid
      for update
    `);
    let transferred = 0;
    let removed = 0;
    for (const group of groups) {
      const groupId = text(group.id);
      const formationId = text(group.formation_id);
      const newOwner = text(group.new_owner);
      if (newOwner === '') {
        // No member left: the shared formation goes with the account (ADR-0216).
        await tx.execute(sql`delete from public.formations where id = ${formationId}::uuid`);
        removed += 1;
        continue;
      }
      await tx.execute(
        sql`update public.groups set owner_id = ${newOwner}::uuid where id = ${groupId}::uuid`,
      );
      await tx.execute(sql`
        update public.group_members set role = 'owner'
        where group_id = ${groupId}::uuid and user_id = ${newOwner}::uuid
      `);
      await tx.execute(sql`
        update public.group_members set role = 'member'
        where group_id = ${groupId}::uuid and user_id = ${userId}::uuid
      `);
      await tx.execute(
        sql`update public.formations set owner_id = ${newOwner}::uuid where id = ${formationId}::uuid`,
      );
      transferred += 1;
    }
    return { transferred, removed };
  });
}

/** Runs the deletion of one due account; exported for the demo page and the integration suite. */
export async function runAccountDeletion(
  args: AccountDeletionArgs,
  deps: DeletionDeps = defaultDeletionDeps(),
): Promise<AccountDeletionOutcome> {
  const { ctx, step, logger, userId } = args;
  const prefix = (name: string): string => `deletion:${userId}:${name}`;

  const captured = await step.run(prefix('capture'), async () => {
    return ctx.sdb.transaction(async (tx) => {
      const [profile] = await tx.execute<Row>(sql`
        select id::text as id, email, tutor_tone::text as tutor_tone, timezone,
               deletion_requested_at, deletion_scheduled_for
        from public.profiles
        where id = ${userId}::uuid
        for update
      `);
      if (profile === undefined) return { proceed: false as const };
      const scheduledFor =
        profile.deletion_scheduled_for instanceof Date
          ? profile.deletion_scheduled_for
          : new Date(String(profile.deletion_scheduled_for));
      if (
        Number.isNaN(scheduledFor.getTime()) ||
        scheduledFor.getTime() > ctx.clock.now().getTime()
      ) {
        // CL-7 — cancelled before the run: nothing is deleted.
        return { proceed: false as const };
      }
      return {
        proceed: true as const,
        email: text(profile.email),
        timezone: text(profile.timezone) || 'Europe/Paris',
        requestedAt:
          profile.deletion_requested_at instanceof Date
            ? profile.deletion_requested_at.toISOString()
            : new Date(String(profile.deletion_requested_at)).toISOString(),
        scheduledFor: scheduledFor.toISOString(),
      };
    });
  });
  if (!captured.proceed) {
    return {
      deleted: false,
      tables: await remainingPersonalRows(userId),
      authStatus: 'présent',
      emails: [],
    };
  }

  const groups = await step.run(prefix('groups'), () => transferGroups(userId));

  await step.run(prefix('storage'), async () => {
    const resources = await ctx.sdb.execute<Row>(sql`
      select storage_path from public.resources
      where owner_id = ${userId}::uuid and storage_path is not null
    `);
    const exports = await ctx.sdb.execute<Row>(sql`
      select storage_path from public.data_exports
      where user_id = ${userId}::uuid and storage_path is not null
    `);
    for (const row of resources) {
      await deps.removeObject('resources', text(row.storage_path));
    }
    for (const row of exports) {
      await deps.removeObject('exports', text(row.storage_path));
    }
    return { resources: resources.length, exports: exports.length };
  });

  await step.run(prefix('anonymise'), async () => {
    const rows = await ctx.sdb.execute<{ id: string }>(sql`
      update public.ai_calls set user_id = null where user_id = ${userId}::uuid returning id::text as id
    `);
    return { anonymised: rows.length };
  });

  // ADR-0267 — the Auth deletion runs before the profile cascade so that a failed Auth call leaves
  // the due request (and its captured address) in place for the next nightly retry (CL-8). A success
  // cascades every business row; `delete-data` is the idempotent cleanup of a profile left behind
  // by an interrupted run.
  await step.run(prefix('delete-auth'), async () => {
    await deps.admin.deleteUser(userId);
    return { authDeleted: true };
  });

  await step.run(prefix('delete-data'), async () => {
    const removed = await ctx.sdb.execute<{ id: string }>(sql`
      delete from public.profiles where id = ${userId}::uuid returning id::text as id
    `);
    return { profiles: removed.length };
  });

  const sentAt = ctx.clock.now().toISOString();
  await step.run(prefix('email'), async () => {
    const result = await sendEmail(
      { sdb: ctx.sdb, clock: ctx.clock, logger },
      {
        userId,
        template: 'deletion_completed',
        props: {
          requestedLabel: formatLongDate(new Date(captured.requestedAt), captured.timezone),
        },
        idempotencyKey: `deletion-completed:${userId}`,
        toOverride: captured.email,
        toneOverride: 'vous',
      },
    );
    if (!result.ok) throw result.error;
    return { messageId: result.value.messageId };
  });

  const tables = await remainingPersonalRows(userId);
  logger.info('account deletion completed', {
    userId,
    outcome: `groups=${String(groups.transferred + groups.removed)} tables=${String(tables.length)}`,
  });
  return {
    deleted: true,
    tables,
    authStatus: (await deps.admin.exists(userId)) ? 'présent' : 'supprimé',
    emails: [{ template: 'deletion_completed', to: captured.email, at: sentAt }],
  };
}
