// Programme factory of the integration harness (SPEC-103 §9). SPEC-115 enriches it with the
// demonstration dataset; every caller must run it inside a transaction, typically `withRollback`.
import { sql } from 'drizzle-orm';

import type { DbTx } from '../client';

export interface TestProgrammeOptions {
  /** Number of modules (default 2). */
  modules?: number;
  /** Number of chapters per module (default 2). */
  chaptersPerModule?: number;
  /** Number of notions per chapter (default 2). */
  notionsPerChapter?: number;
  /** Formation title (default « Formation de démonstration »). */
  title?: string;
}

export interface TestProgramme {
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
}

interface IdRow {
  id: string;
  [key: string]: unknown;
}

function positive(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`createTestProgramme : ${name} doit être un entier positif.`);
  }
  return value;
}

/**
 * Creates a formation with an ordered programme: `modules` modules, `chaptersPerModule` chapters
 * per module and `notionsPerChapter` notions per chapter. Notions are attached to their chapter
 * and module so that the composite foreign keys hold; positions start at 1.
 */
export async function createTestProgramme(
  tx: DbTx,
  ownerId: string,
  options: TestProgrammeOptions = {},
): Promise<TestProgramme> {
  const moduleCount = positive(options.modules ?? 2, 'modules');
  const chaptersPerModule = positive(options.chaptersPerModule ?? 2, 'chaptersPerModule');
  const notionsPerChapter = positive(options.notionsPerChapter ?? 2, 'notionsPerChapter');

  const [formation] = await tx.execute<IdRow>(sql`
    insert into public.formations (owner_id, title, objectives, status)
    values (
      ${ownerId}::uuid,
      ${options.title ?? 'Formation de démonstration'},
      '{operational}'::public.formation_objective[],
      'active'
    )
    returning id::text as id
  `);
  if (formation === undefined) throw new Error('createTestProgramme : formation non créée.');

  const moduleIds: string[] = [];
  const chapterIds: string[] = [];
  const notionIds: string[] = [];

  for (let modulePosition = 1; modulePosition <= moduleCount; modulePosition += 1) {
    const [module] = await tx.execute<IdRow>(sql`
      insert into public.modules (formation_id, position, title)
      values (${formation.id}::uuid, ${modulePosition}, ${`Partie ${String(modulePosition)}`})
      returning id::text as id
    `);
    if (module === undefined) throw new Error('createTestProgramme : module non créé.');
    moduleIds.push(module.id);

    for (let chapterPosition = 1; chapterPosition <= chaptersPerModule; chapterPosition += 1) {
      const [chapter] = await tx.execute<IdRow>(sql`
        insert into public.chapters (module_id, formation_id, position, title)
        values (
          ${module.id}::uuid,
          ${formation.id}::uuid,
          ${chapterPosition},
          ${`Chapitre ${String(modulePosition)}.${String(chapterPosition)}`}
        )
        returning id::text as id
      `);
      if (chapter === undefined) throw new Error('createTestProgramme : chapitre non créé.');
      chapterIds.push(chapter.id);

      for (let notionPosition = 1; notionPosition <= notionsPerChapter; notionPosition += 1) {
        const [notion] = await tx.execute<IdRow>(sql`
          insert into public.notions (
            formation_id, module_id, chapter_id, label, short_definition, position
          )
          values (
            ${formation.id}::uuid,
            ${module.id}::uuid,
            ${chapter.id}::uuid,
            ${`Notion ${String(modulePosition)}.${String(chapterPosition)}.${String(notionPosition)}`},
            ${`Définition courte ${String(notionPosition)}`},
            ${notionPosition}
          )
          returning id::text as id
        `);
        if (notion === undefined) throw new Error('createTestProgramme : notion non créée.');
        notionIds.push(notion.id);
      }
    }
  }

  return {
    formationId: formation.id,
    moduleIds,
    chapterIds,
    notionIds,
  };
}
