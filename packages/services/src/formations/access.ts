// Read-only access check of a formation (SPEC-615 ET-1, CL-1; ADR-0075).
//
// The page proxy needs the answer *before* the root loading boundary starts streaming: once the
// response headers are sent, `notFound()` can only render the 404 UI, not change the HTTP status.
// This read uses the learner's RLS client and mirrors the visibility of the formation itself:
// owner or active member of its group, anything else is indistinguishable from a missing row.

import type { Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AccessRow {
  id: string;
  [key: string]: unknown;
}

/**
 * ET-1 — `true` only for a formation the caller may read: owner or active group member. An unknown,
 * malformed or foreign identifier is `false`, never an existence leak.
 */
export function canAccessFormation(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<boolean>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.test(formationId)) return false;
    return db.run(async (tx) => {
      const rows = await tx.execute<AccessRow>(sql`
        select f.id::text as id
        from public.formations f
        where f.id = ${formationId}::uuid
          and (
            f.owner_id = ${userId}::uuid
            or exists (
              select 1
              from public.groups g
              join public.group_members gm on gm.group_id = g.id
              where g.formation_id = f.id
                and gm.user_id = ${userId}::uuid
                and gm.member_status = 'active'
                and gm.left_at is null
            )
          )
      `);
      return rows.length > 0;
    });
  });
}
