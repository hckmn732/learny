// Group factory (SPEC-115 EF-6). The owner is also a member; extra members join in one call.
import { sql, type DbTx } from '@learny/db';

import {
  assertFormationAccess,
  formationOwner,
  insert,
  now,
  uniqueInviteCode,
  type IdRow,
} from './helpers';

export interface GroupFactoryOverrides {
  formationId: string;
  ownerId: string;
  inviteCode?: string;
  memberIds?: readonly string[];
  maxMembers?: number;
}

export interface FactoryGroup {
  id: string;
  inviteCode: string;
}

export async function createGroup(
  tx: DbTx,
  overrides: GroupFactoryOverrides,
): Promise<FactoryGroup> {
  const owner = await formationOwner(tx, overrides.formationId);
  if (owner !== overrides.ownerId) {
    throw new Error('Fabrique groupe : owner_id doit être le propriétaire de la formation.');
  }
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);

  const inviteCode = overrides.inviteCode ?? uniqueInviteCode();
  const rows = await insert<IdRow>(
    tx,
    'groupe',
    sql`
      insert into public.groups (formation_id, owner_id, invite_code, max_members)
      values (
        ${overrides.formationId}::uuid,
        ${overrides.ownerId}::uuid,
        ${inviteCode},
        ${overrides.maxMembers ?? 10}
      )
      returning id::text as id
    `,
  );
  const group = rows[0];
  if (group === undefined) throw new Error('Fabrique groupe : aucune ligne insérée.');
  // SPEC-111: the shared programme is reachable from the formation through `group_id`.
  await tx.execute(
    sql`update public.formations set group_id = ${group.id}::uuid where id = ${overrides.formationId}::uuid`,
  );

  const memberIds = [overrides.ownerId, ...(overrides.memberIds ?? [])];
  for (const userId of new Set(memberIds)) {
    await insert<IdRow>(
      tx,
      'membre de groupe',
      sql`
        insert into public.group_members (group_id, user_id, role, member_status, joined_at)
        values (
          ${group.id}::uuid,
          ${userId}::uuid,
          ${userId === overrides.ownerId ? 'owner' : 'member'},
          'active',
          ${now().toISOString()}::timestamptz
        )
        returning group_id::text as id
      `,
    );
  }
  return { id: group.id, inviteCode };
}
