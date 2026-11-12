// Notion factory (SPEC-115 EF-6). A notion always belongs to the chapter, module and formation
// given by the caller; the composite keys of SPEC-103 are verified before the insert.
import { sql, type DbTx } from '@learny/db';

import {
  assertChapterBelongsTo,
  assertFormationAccess,
  assertModuleBelongsTo,
  insert,
  type IdRow,
} from './helpers';

export interface NotionFactoryOverrides {
  id?: string;
  ownerId: string;
  formationId: string;
  moduleId: string;
  chapterId?: string;
  label?: string;
  definition?: string;
  position?: number;
}

export interface FactoryNotion {
  id: string;
  chapterId: string;
}

export async function createNotion(
  tx: DbTx,
  overrides: NotionFactoryOverrides,
): Promise<FactoryNotion> {
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);
  await assertModuleBelongsTo(tx, overrides.moduleId, overrides.formationId);

  let chapterId = overrides.chapterId;
  if (chapterId === undefined) {
    const rows = await tx.execute<IdRow>(sql`
      select id::text as id from public.chapters
      where module_id = ${overrides.moduleId}::uuid
      order by position
      limit 1
    `);
    chapterId = rows[0]?.id;
    if (chapterId === undefined) {
      throw new Error('Fabrique notion : le module n’a aucun chapitre.');
    }
  }
  await assertChapterBelongsTo(tx, chapterId, overrides.moduleId, overrides.formationId);

  const positionRows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notions where chapter_id = ${chapterId}::uuid`,
  );
  const position = overrides.position ?? (positionRows[0]?.count ?? 0) + 1;
  const rows = await insert<IdRow>(
    tx,
    'notion',
    sql`
      insert into public.notions (
        id, formation_id, module_id, chapter_id, label, short_definition, position
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.formationId}::uuid,
        ${overrides.moduleId}::uuid,
        ${chapterId}::uuid,
        ${overrides.label ?? `Notion ${String(position)}`},
        ${overrides.definition ?? null},
        ${position}
      )
      returning id::text as id
    `,
  );
  const notion = rows[0];
  if (notion === undefined) throw new Error('Fabrique notion : aucune ligne insérée.');
  return { id: notion.id, chapterId };
}
