// Module factory with its chapters (SPEC-115 EF-6). Positions are contiguous per formation.
import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, insert, type IdRow } from './helpers';

export interface ModuleFactoryOverrides {
  id?: string;
  ownerId: string;
  formationId: string;
  position?: number;
  title?: string;
  chapters?: readonly string[];
  plannedStart?: string | null;
  plannedEnd?: string | null;
  status?: 'locked' | 'open' | 'validated';
}

export interface FactoryModule {
  id: string;
  chapterIds: string[];
}

export async function createModule(
  tx: DbTx,
  overrides: ModuleFactoryOverrides,
): Promise<FactoryModule> {
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);
  const countRows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.modules where formation_id = ${overrides.formationId}::uuid`,
  );
  const position = overrides.position ?? (countRows[0]?.count ?? 0) + 1;
  const rows = await insert<IdRow>(
    tx,
    'module',
    sql`
      insert into public.modules (
        id, formation_id, position, title, planned_start, planned_end, status
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.formationId}::uuid,
        ${position},
        ${overrides.title ?? `Module ${String(position)}`},
        ${overrides.plannedStart ?? null},
        ${overrides.plannedEnd ?? null},
        ${overrides.status ?? 'locked'}
      )
      returning id::text as id
    `,
  );
  const module = rows[0];
  if (module === undefined) throw new Error('Fabrique module : aucune ligne insérée.');

  const chapterIds: string[] = [];
  const chapters = overrides.chapters ?? [`Chapitre ${String(position)}.1`];
  for (const [index, title] of chapters.entries()) {
    const chapterRows = await insert<IdRow>(
      tx,
      'chapter',
      sql`
        insert into public.chapters (module_id, formation_id, position, title)
        values (
          ${module.id}::uuid,
          ${overrides.formationId}::uuid,
          ${index + 1},
          ${title}
        )
        returning id::text as id
      `,
    );
    const chapter = chapterRows[0];
    if (chapter === undefined) throw new Error('Fabrique module : chapitre non créé.');
    chapterIds.push(chapter.id);
  }
  return { id: module.id, chapterIds };
}
