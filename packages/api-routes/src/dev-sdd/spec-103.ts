// Owner-role reads of the SPEC-103 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: the programme tree and every constraint
// probe disappear at the end of the request, so the page never mutates the database.
import { sql, type DbTx } from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

export interface Spec103Notion {
  position: number;
  label: string;
}

export interface Spec103Chapter {
  position: number;
  title: string;
  notions: Spec103Notion[];
}

export interface Spec103Module {
  position: number;
  title: string;
  threshold: number;
  chapters: Spec103Chapter[];
}

export type Spec103ConstraintKey = 'cl1' | 'cl2' | 'cl3' | 'cl4' | 'cl5' | 'cl6' | 'cl7';

export interface Spec103Constraint {
  key: Spec103ConstraintKey;
  expected: string;
  sqlstate: string;
  message: string;
  ok: boolean;
}

export interface Spec103Fts {
  query: string;
  matchCount: number;
  matchedLabel: string;
  plan: string;
  indexUsed: boolean;
}

export interface Spec103Data {
  modules: Spec103Module[];
  constraints: Spec103Constraint[];
  fts: Spec103Fts;
}

interface Row {
  [key: string]: unknown;
}

interface Failure {
  code: string;
  message: string;
}

let savepoint = 0;

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.at(-1) ?? '' };
}

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec103_demo_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

async function loadTree(tx: DbTx, formationId: string): Promise<Spec103Module[]> {
  const rows = await tx.execute<Row>(sql`
    select m.position as module_position, m.title as module_title, m.threshold as module_threshold,
           c.position as chapter_position, c.title as chapter_title,
           n.position as notion_position, n.label as notion_label
    from public.modules m
    left join public.chapters c on c.module_id = m.id
    left join public.notions n on n.chapter_id = c.id
    where m.formation_id = ${formationId}::uuid
    order by m.position, c.position, n.position
  `);

  const modules = new Map<number, Spec103Module>();
  const chapters = new Map<string, Spec103Chapter>();
  for (const row of rows) {
    const modulePosition = Number(row.module_position);
    let moduleNode = modules.get(modulePosition);
    if (moduleNode === undefined) {
      moduleNode = {
        position: modulePosition,
        title: String(row.module_title),
        threshold: Number(row.module_threshold),
        chapters: [],
      };
      modules.set(modulePosition, moduleNode);
    }
    if (row.chapter_position === null) continue;
    const chapterPosition = Number(row.chapter_position);
    const chapterKey = `${String(modulePosition)}:${String(chapterPosition)}`;
    let chapter = chapters.get(chapterKey);
    if (chapter === undefined) {
      chapter = {
        position: chapterPosition,
        title: String(row.chapter_title),
        notions: [],
      };
      chapters.set(chapterKey, chapter);
      moduleNode.chapters.push(chapter);
    }
    if (row.notion_position === null) continue;
    chapter.notions.push({
      position: Number(row.notion_position),
      label: String(row.notion_label),
    });
  }
  return [...modules.values()].sort((left, right) => left.position - right.position);
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec103Demo(): Promise<Spec103Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 2,
      chaptersPerModule: 2,
      notionsPerChapter: 2,
    });
    const modules = await loadTree(tx, programme.formationId);
    const [first, second, third, fourth, fifth, sixth, seventh] = programme.notionIds;
    const firstModule = programme.moduleIds[0] ?? '';
    // Chapters are created module by module: the first chapter of the second module is third.
    const secondModuleChapter = programme.chapterIds[2] ?? '';

    const cl1 = await attempt(tx, () =>
      tx.execute(
        sql`update public.formations set default_threshold = 59 where id = ${programme.formationId}::uuid`,
      ),
    );
    const cl2 = await attempt(tx, () =>
      tx.execute(sql`
        update public.formations
        set status = 'programme_proposed', objectives = '{}'::public.formation_objective[]
        where id = ${programme.formationId}::uuid
      `),
    );
    const cl4 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.notions (formation_id, module_id, chapter_id, label, position)
        values (
          ${programme.formationId}::uuid,
          ${firstModule}::uuid,
          ${secondModuleChapter}::uuid,
          'Notion incohérente',
          3
        )
      `),
    );

    for (const [from, to] of [
      [first, second],
      [second, third],
    ] as const) {
      await tx.execute(sql`
        insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
        values (${programme.formationId}::uuid, ${from ?? ''}::uuid, ${to ?? ''}::uuid, 'prerequisite')
      `);
    }
    const cl5 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
        values (${programme.formationId}::uuid, ${third ?? ''}::uuid, ${first ?? ''}::uuid, 'prerequisite')
      `),
    );

    const [low, high] =
      String(fourth) < String(fifth) ? ([fourth, fifth] as const) : ([fifth, fourth] as const);
    const cl6 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
        values (${programme.formationId}::uuid, ${high ?? ''}::uuid, ${low ?? ''}::uuid, 'confusion')
      `),
    );

    await tx.execute(sql`
      insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
      values (${programme.formationId}::uuid, ${sixth ?? ''}::uuid, ${seventh ?? ''}::uuid, 'tutor')
    `);
    const cl7 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
        values (${programme.formationId}::uuid, ${sixth ?? ''}::uuid, ${seventh ?? ''}::uuid, 'tutor')
      `),
    );

    // CL-3: the two modules exchange their positions inside this transaction (deferred check).
    const [moduleOne, moduleTwo] = programme.moduleIds;
    if (moduleOne !== undefined && moduleTwo !== undefined) {
      await tx.execute(sql`update public.modules set position = 2 where id = ${moduleOne}::uuid`);
      await tx.execute(sql`update public.modules set position = 1 where id = ${moduleTwo}::uuid`);
      await tx.execute(sql`set constraints all immediate`);
    }
    const cl3: Spec103Constraint = {
      key: 'cl3',
      expected: '00000',
      sqlstate: '00000',
      message: 'Réorganisation en transaction acceptée',
      ok: true,
    };

    await tx.execute(sql`
      update public.notions
      set label = 'Écriture de régularisation', short_definition = 'Passage d''écriture comptable'
      where id = ${first ?? ''}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = 'Équilibre d’une pièce', short_definition = 'Débit et crédit'
      where id = ${second ?? ''}::uuid
    `);
    const matches = await tx.execute<Row>(sql`
      select label
      from public.notions
      where formation_id = ${programme.formationId}::uuid
        and to_tsvector(
        'simple',
        public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
      ) @@ plainto_tsquery('simple', public.immutable_unaccent('ecriture'))
    `);
    await tx.execute(sql`set local enable_seqscan = off`);
    const planRows = await tx.execute<Row>(sql`
      explain (format json)
      select id
      from public.notions
      where to_tsvector(
        'simple',
        public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
      ) @@ plainto_tsquery('simple', public.immutable_unaccent('ecriture'))
    `);
    const plan = JSON.stringify(planRows[0]?.['QUERY PLAN'] ?? null);

    const cases: [Spec103ConstraintKey, string, Failure][] = [
      ['cl1', '23514', cl1],
      ['cl2', '23514', cl2],
      ['cl4', '23503', cl4],
      ['cl5', '23514', cl5],
      ['cl6', '23514', cl6],
      ['cl7', '23505', cl7],
    ];

    return {
      modules,
      constraints: [
        ...cases.map(([key, expected, failure]) => ({
          key,
          expected,
          sqlstate: failure.code,
          message: failure.message,
          ok: failure.code === expected,
        })),
        cl3,
      ],
      fts: {
        query: 'ecriture',
        matchCount: matches.length,
        matchedLabel: matches[0] === undefined ? '' : String(matches[0].label),
        plan,
        indexUsed: plan.includes('notions_fts_idx'),
      },
    };
  });
}
