import { sql, type DbTx } from '@learny/db';

// SPEC-609 EF-4, BR-MEM-09 — a reported section suspends the bank bricks that were built for the
// same notions, so a new quiz draw cannot select them. A correction restores only the bricks that
// were suspended by a section report; a brick reported directly by the learner stays reported until
// its own correction.

/** Active bank/validation bricks of the owner that share at least one notion with the section. */
export async function suspendBricksForNotions(
  tx: DbTx,
  userId: string,
  formationId: string,
  notionIds: readonly string[],
): Promise<string[]> {
  if (notionIds.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(sql`
    select b.id::text as id
    from public.bricks b
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.purpose in ('bank', 'validation')
      and b.status = 'active'
      and b.notion_ids && ${`{${notionIds.join(',')}}`}::uuid[]
    order by b.id asc
  `);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  await tx.execute(sql`
    update public.bricks
    set status = 'reported'
    where owner_id = ${userId}::uuid
      and id = any(${`{${ids.join(',')}}`}::uuid[])
      and status = 'active'
  `);
  return ids;
}

/**
 * Restores the bricks suspended by resolved section reports. A brick stays reported while another
 * open section report lists it or while the learner reported it directly.
 */
export async function reactivateBricks(
  tx: DbTx,
  userId: string,
  brickIds: readonly string[],
): Promise<void> {
  if (brickIds.length === 0) return;
  await tx.execute(sql`
    update public.bricks b
    set status = 'active'
    where b.owner_id = ${userId}::uuid
      and b.id = any(${`{${brickIds.join(',')}}`}::uuid[])
      and b.status = 'reported'
      and not exists (
        select 1
        from public.course_section_reports r
        where r.status = 'open'
          and b.id = any(r.affected_brick_ids)
      )
      and not exists (
        select 1
        from public.brick_reports br
        where br.brick_id = b.id and br.status = 'open'
      )
  `);
}
