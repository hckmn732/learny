// Database resolver of brick references (SPEC-501 ET-8, BR-BRI-05). Every query is filtered by the
// learner and the formation explicitly, on top of RLS: no other user's notion, passage, resource or
// brick can ever be discovered through a validation error.
import { sql } from 'drizzle-orm';

import type { BrickReferenceResolver, BrickResourceInfo, BrickResourceKind } from '@learny/bricks';
import type { DbTx } from '@learny/db';

function uuidList(ids: readonly string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

export class DbBrickReferenceResolver implements BrickReferenceResolver {
  constructor(
    private readonly tx: DbTx,
    private readonly userId: string,
    private readonly formationId: string,
  ) {}

  async existingNotionIds(formationId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.tx.execute<{ id: string }>(sql`
      select n.id::text as id
      from public.notions n
      join public.formations f on f.id = n.formation_id
      where n.formation_id = ${formationId}::uuid
        and f.owner_id = ${this.userId}::uuid
        and n.id in (${uuidList(ids)})
    `);
    return new Set(rows.map((row) => row.id));
  }

  async chunks(ids: string[]): Promise<Map<string, { resourceId: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.tx.execute<{ id: string; resource_id: string }>(sql`
      select c.id::text as id, c.resource_id::text as resource_id
      from public.resource_chunks c
      join public.resources r on r.id = c.resource_id
      where c.id in (${uuidList(ids)})
        and c.owner_id = ${this.userId}::uuid
        and c.formation_id = ${this.formationId}::uuid
        and r.deleted_at is null
    `);
    return new Map(rows.map((row) => [row.id, { resourceId: row.resource_id }]));
  }

  async resources(ids: string[]): Promise<Map<string, BrickResourceInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.tx.execute<{
      id: string;
      kind: string;
      pages: number | null;
      duration_sec: number | null;
      deleted: boolean;
    }>(sql`
      select
        id::text as id,
        kind::text as kind,
        case when metadata->>'pages' is null then null else (metadata->>'pages')::int end as pages,
        case
          when metadata->>'durationSec' is null then null
          else (metadata->>'durationSec')::double precision
        end as duration_sec,
        deleted_at is not null as deleted
      from public.resources
      where id in (${uuidList(ids)})
        and owner_id = ${this.userId}::uuid
        and formation_id = ${this.formationId}::uuid
    `);
    return new Map(
      rows.map((row) => [
        row.id,
        {
          kind: row.kind as BrickResourceKind,
          pages: row.pages,
          durationSec: row.duration_sec,
          deleted: row.deleted,
        },
      ]),
    );
  }

  async existingBrickIds(formationId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.tx.execute<{ id: string }>(sql`
      select id::text as id
      from public.bricks
      where id in (${uuidList(ids)})
        and formation_id = ${formationId}::uuid
        and owner_id = ${this.userId}::uuid
    `);
    return new Set(rows.map((row) => row.id));
  }
}
