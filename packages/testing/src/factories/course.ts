// Course factory (SPEC-115 EF-6). Creates a ready current course with one text section per chapter.
import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, assertModuleBelongsTo, insert, type IdRow } from './helpers';

export interface CourseFactoryOverrides {
  id?: string;
  ownerId: string;
  formationId: string;
  moduleId: string;
  sectionsPerChapter?: number;
  model?: string;
}

export interface FactoryCourse {
  id: string;
  sectionIds: string[];
}

export async function createCourse(
  tx: DbTx,
  overrides: CourseFactoryOverrides,
): Promise<FactoryCourse> {
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);
  await assertModuleBelongsTo(tx, overrides.moduleId, overrides.formationId);

  const versionRows = await tx.execute<{ version: number }>(sql`
    select coalesce(max(version), 0)::int as version
    from public.courses
    where owner_id = ${overrides.ownerId}::uuid and module_id = ${overrides.moduleId}::uuid
  `);
  const version = (versionRows[0]?.version ?? 0) + 1;
  const rows = await insert<IdRow>(
    tx,
    'course',
    sql`
      insert into public.courses (
        id, owner_id, formation_id, module_id, version, is_current, status, model
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.ownerId}::uuid,
        ${overrides.formationId}::uuid,
        ${overrides.moduleId}::uuid,
        ${version},
        true,
        'ready',
        ${overrides.model ?? null}
      )
      returning id::text as id
    `,
  );
  const course = rows[0];
  if (course === undefined) throw new Error('Fabrique cours : aucune ligne insérée.');

  const chapters = await tx.execute<{ id: string; title: string }>(sql`
    select id::text as id, title from public.chapters
    where module_id = ${overrides.moduleId}::uuid
    order by position
  `);
  const sectionIds: string[] = [];
  const sectionsPerChapter = overrides.sectionsPerChapter ?? 1;
  for (const chapter of chapters) {
    for (let index = 1; index <= sectionsPerChapter; index += 1) {
      const sectionRows = await insert<IdRow>(
        tx,
        'course section',
        sql`
          insert into public.course_sections (
            course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin
          )
          values (
            ${course.id}::uuid,
            ${overrides.ownerId}::uuid,
            ${chapter.id}::uuid,
            ${index},
            'text',
            ${`section-${chapter.id.slice(0, 8)}-${String(index)}`},
            ${chapter.title},
            ${`Contenu de fabrique : ${chapter.title}.`},
            'tutor'
          )
          returning id::text as id
        `,
      );
      const section = sectionRows[0];
      if (section === undefined) throw new Error('Fabrique cours : section non créée.');
      sectionIds.push(section.id);
    }
  }
  return { id: course.id, sectionIds };
}
