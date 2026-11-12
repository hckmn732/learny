// Integration tests of the formation programme (SPEC-103 §12): introspection, thresholds,
// objectives, composite coherence, deferred positions, notion links, cascades, FTS and
// performance. Every test runs against the local Supabase database (testing.md §3).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, type DbTx } from '../../src/client';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const TABLES = [
  'formations',
  'cadrage_messages',
  'programme_imports',
  'programme_change_requests',
  'modules',
  'chapters',
  'chapter_progress',
  'module_progress',
  'notions',
  'notion_links',
] as const;

const ENUMS = [
  'formation_objective',
  'formation_status',
  'maintenance_mode',
  'message_role',
  'cadrage_key',
  'import_kind',
  'module_status',
  'contrib_status',
  'link_kind',
] as const;

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

/** SQLSTATE and message of a Drizzle/driver error (Drizzle 0.44 wraps driver errors in `cause`). */
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
  return { code, message: messages.join(' | ') };
}

/** Runs a statement that must fail, then restores the transaction to its savepoint. */
async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec103_${String(savepoint)}`;
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

async function count(tx: Queryable, table: string, where: string, value: string): Promise<number> {
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.raw(`public.${table}`)} where ${sql.raw(where)} = ${value}::uuid`,
  );
  return rows[0]?.count ?? -1;
}

async function createFormation(
  tx: DbTx,
  ownerId: string,
  status: 'cadrage' | 'active' = 'cadrage',
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.formations (owner_id, title, status, objectives)
    values (
      ${ownerId}::uuid,
      'Formation',
      ${status},
      ${status === 'active' ? sql`'{operational}'::public.formation_objective[]` : sql`'{}'::public.formation_objective[]`}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('formation non créée');
  return id;
}

function asText(row: Row, key: string): string {
  return String(row[key]);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-103] formations et programme', () => {
  it('CA-1 — les dix tables, neuf énumérations, contraintes et index existent', async () => {
    await withRollback(async (tx) => {
      const tableList = TABLES.map((table) => `'${table}'`).join(',');
      const tables = await tx.execute<Row>(
        sql.raw(`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in (${tableList})
        order by c.relname
      `),
      );
      expect(tables.map((row) => asText(row, 'name'))).toEqual([...TABLES].sort());
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée (ADR-0112)',
      ).toBe(true);

      const enums = await tx.execute<Row>(sql`
        select t.typname as name
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typnamespace = 'public'::regnamespace
        group by t.typname
        order by t.typname
      `);
      const names = enums.map((row) => asText(row, 'name'));
      for (const name of ENUMS) expect(names, name).toContain(name);

      const deferrable = await tx.execute<Row>(sql`
        select conname as name, condeferrable as deferrable, condeferred as deferred
        from pg_constraint
        where conname in (
          'modules_position_unique', 'chapters_position_unique', 'notions_position_unique'
        )
        order by conname
      `);
      expect(deferrable).toHaveLength(3);
      for (const row of deferrable) {
        expect(row.deferrable, asText(row, 'name')).toBe(true);
        expect(row.deferred, asText(row, 'name')).toBe(true);
      }

      const named = await tx.execute<Row>(sql`
        select conname as name
        from pg_constraint
        where conname in (
          'formations_dates_order', 'formations_objectives_required',
          'formations_objectives_unique', 'formations_maintenance_only_completed',
          'notion_links_unique', 'notion_links_no_self',
          'notion_links_confusion_canonical', 'profiles_current_formation_fk'
        )
        order by conname
      `);
      expect(named.map((row) => asText(row, 'name'))).toEqual([
        'formations_dates_order',
        'formations_maintenance_only_completed',
        'formations_objectives_required',
        'formations_objectives_unique',
        'notion_links_confusion_canonical',
        'notion_links_no_self',
        'notion_links_unique',
        'profiles_current_formation_fk',
      ]);

      const nullsNotDistinct = await tx.execute<Row>(sql`
        select i.indnullsnotdistinct as flag
        from pg_constraint c
        join pg_index i on i.indexrelid = c.conindid
        where c.conname = 'notion_links_unique'
      `);
      expect(nullsNotDistinct[0]?.flag).toBe(true);

      const indexes = await tx.execute<Row>(sql`
        select indexname as name from pg_indexes
        where schemaname = 'public' and tablename = 'notions'
      `);
      expect(indexes.map((row) => asText(row, 'name'))).toContain('notions_fts_idx');

      const triggers = await tx.execute<Row>(sql`
        select tgrelid::regclass::text as table
        from pg_trigger
        where not tgisinternal and tgname = 'set_updated_at'
          and tgrelid::regclass::text in (
            'formations', 'programme_imports', 'programme_change_requests', 'modules',
            'chapters', 'chapter_progress', 'module_progress', 'notions'
          )
        order by 1
      `);
      expect(triggers).toHaveLength(8);

      const functions = await tx.execute<Row>(sql`
        select proname as name from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('enum_array_is_set', 'validate_notion_link')
        order by 1
      `);
      expect(functions.map((row) => asText(row, 'name'))).toEqual([
        'enum_array_is_set',
        'validate_notion_link',
      ]);
    });
  });

  it('EF-1 / EF-2 — la formation et le module reçoivent leurs défauts (CA-2)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const formation = await tx.execute<Row>(sql`
        insert into public.formations (owner_id, title)
        values (${user.id}::uuid, 'Nouvelle formation')
        returning status::text as status, objectives::text as objectives,
                  default_threshold as threshold, cadrage_profile as profile,
                  course_language::text as language
      `);
      expect(formation[0]).toMatchObject({
        status: 'cadrage',
        objectives: '{}',
        threshold: 80,
        profile: {},
        language: 'fr',
      });

      const [module] = await tx.execute<Row>(sql`
        insert into public.modules (formation_id, position, title)
        values ((select id from public.formations where owner_id = ${user.id}::uuid), 1, 'Module')
        returning threshold, status::text as status
      `);
      expect(module).toMatchObject({ threshold: 80, status: 'locked' });
    });
  });

  it('CL-1 / CA-2 — un seuil hors de 60..95 est refusé (formation et module)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const formationId = await createFormation(tx, user.id);
      const [module] = await tx.execute<{ id: string }>(sql`
        insert into public.modules (formation_id, position, title)
        values (${formationId}::uuid, 1, 'Module')
        returning id::text as id
      `);
      const moduleId = module?.id;
      if (moduleId === undefined) throw new Error('module non créé');

      for (const threshold of [59, 96]) {
        const formationAttempt = await attempt(tx, () =>
          tx.execute(
            sql`update public.formations set default_threshold = ${threshold} where id = ${formationId}::uuid`,
          ),
        );
        expect(formationAttempt.code, `formation ${String(threshold)}`).toBe('23514');

        const moduleAttempt = await attempt(tx, () =>
          tx.execute(
            sql`update public.modules set threshold = ${threshold} where id = ${moduleId}::uuid`,
          ),
        );
        expect(moduleAttempt.code, `module ${String(threshold)}`).toBe('23514');
      }

      expect(
        (
          await attempt(tx, () =>
            tx.execute(
              sql`update public.formations set default_threshold = 60 where id = ${formationId}::uuid`,
            ),
          )
        ).code,
      ).toBe('00000');
      expect(
        (
          await attempt(tx, () =>
            tx.execute(sql`update public.modules set threshold = 95 where id = ${moduleId}::uuid`),
          )
        ).code,
      ).toBe('00000');
    });
  });

  it('CL-2 / CA-3 — les objectifs sont requis hors cadrage et sans doublon (BR-FOR-03)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const formationId = await createFormation(tx, user.id);

      const missing = await attempt(tx, () =>
        tx.execute(
          sql`update public.formations set status = 'programme_proposed' where id = ${formationId}::uuid`,
        ),
      );
      expect(missing.code).toBe('23514');
      expect(missing.message).toContain('formations_objectives_required');

      const duplicate = await attempt(tx, () =>
        tx.execute(
          sql`update public.formations
              set status = 'programme_proposed', objectives = '{exam,exam}'::public.formation_objective[]
              where id = ${formationId}::uuid`,
        ),
      );
      expect(duplicate.code).toBe('23514');
      expect(duplicate.message).toContain('formations_objectives_unique');

      const valid = await attempt(tx, () =>
        tx.execute(
          sql`update public.formations
              set status = 'programme_proposed', objectives = '{exam,operational}'::public.formation_objective[]
              where id = ${formationId}::uuid`,
        ),
      );
      expect(valid.code).toBe('00000');
    });
  });

  it('CL-4 / CA-4 — la cohérence formation, module, chapitre et notion est garantie', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const first = await createTestProgramme(tx, user.id, {
        modules: 2,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const second = await createFormation(tx, user.id);

      const chapterOfOtherModule = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notions (formation_id, module_id, chapter_id, label, position)
          values (
            ${first.formationId}::uuid,
            ${first.moduleIds[0] ?? ''}::uuid,
            ${first.chapterIds[1] ?? ''}::uuid,
            'Notion incohérente',
            2
          )
        `),
      );
      expect(chapterOfOtherModule.code).toBe('23503');

      const moduleOfOtherFormation = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notions (formation_id, module_id, chapter_id, label, position)
          values (
            ${second}::uuid,
            ${first.moduleIds[0] ?? ''}::uuid,
            ${first.chapterIds[0] ?? ''}::uuid,
            'Notion inter-formation',
            3
          )
        `),
      );
      expect(moduleOfOtherFormation.code).toBe('23503');
    });
  });

  it('CL-3 / CA-4 — les positions sont échangeables dans une transaction (différées)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 2,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const [first, second] = programme.moduleIds;
      if (first === undefined || second === undefined) throw new Error('modules manquants');

      await tx.execute(sql`update public.modules set position = 2 where id = ${first}::uuid`);
      await tx.execute(sql`update public.modules set position = 1 where id = ${second}::uuid`);
      await tx.execute(sql`set constraints all immediate`);

      const positions = await tx.execute<Row>(sql`
        select position from public.modules
        where formation_id = ${programme.formationId}::uuid order by position
      `);
      expect(positions.map((row) => Number(row.position))).toEqual([1, 2]);
    });
  });

  it('CL-3 — hors transaction, le même échange échoue à la première instruction', async () => {
    const created = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 2,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      return { userId: user.id, ...programme };
    });
    const [first] = created.moduleIds;
    if (first === undefined) throw new Error('module manquant');
    try {
      let failure: Failure = { code: '00000', message: '' };
      try {
        await serviceDb().execute(
          sql`update public.modules set position = 2 where id = ${first}::uuid`,
        );
      } catch (error) {
        failure = failureOf(error);
      }
      expect(failure.code).toBe('23505');
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${created.userId}::uuid`);
    }
  });

  it('EF-5 / CL-5 à CL-7 / CA-5 — les liens de notions sont validés', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const first = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 6,
      });
      const second = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const [a, b, c, d, e, f] = first.notionIds;
      const foreign = second.notionIds[0];
      if (
        a === undefined ||
        b === undefined ||
        c === undefined ||
        d === undefined ||
        e === undefined ||
        f === undefined ||
        foreign === undefined
      ) {
        throw new Error('notions manquantes');
      }

      const self = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${a}::uuid, ${a}::uuid, 'tutor')
        `),
      );
      expect(self.code).toBe('23514');

      const crossFormation = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${a}::uuid, ${foreign}::uuid, 'tutor')
        `),
      );
      expect(crossFormation.code).toBe('23514');
      expect(crossFormation.message).toContain('notion_link_cross_formation');

      // Programme prerequisite chain A -> B -> C, then C -> A must close a cycle.
      for (const [from, to] of [
        [a, b],
        [b, c],
      ] as const) {
        const created = await attempt(tx, () =>
          tx.execute(sql`
            insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
            values (${first.formationId}::uuid, ${from}::uuid, ${to}::uuid, 'prerequisite')
          `),
        );
        expect(created.code).toBe('00000');
      }
      const cycle = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${c}::uuid, ${a}::uuid, 'prerequisite')
        `),
      );
      expect(cycle.code).toBe('23514');
      expect(cycle.message).toContain('notion_link_cycle');

      const personalCycle = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind, owner_id)
          values (${first.formationId}::uuid, ${c}::uuid, ${a}::uuid, 'prerequisite', ${user.id}::uuid)
        `),
      );
      expect(personalCycle.code).toBe('00000');

      const tutorCycle = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${c}::uuid, ${a}::uuid, 'tutor')
        `),
      );
      expect(tutorCycle.code).toBe('00000');

      // Confusion links are stored in canonical id order (from < to).
      const [low, high] = d < e ? ([d, e] as const) : ([e, d] as const);
      const reversed = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${high}::uuid, ${low}::uuid, 'confusion')
        `),
      );
      expect(reversed.code).toBe('23514');
      expect(reversed.message).toContain('notion_links_confusion_canonical');

      const canonical = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${low}::uuid, ${high}::uuid, 'confusion')
        `),
      );
      expect(canonical.code).toBe('00000');

      // Two programme links with a null owner are duplicates (NULLS NOT DISTINCT).
      const duplicate = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
          values (${first.formationId}::uuid, ${a}::uuid, ${b}::uuid, 'prerequisite')
        `),
      );
      expect(duplicate.code).toBe('23505');

      // A personal link with the same endpoints and kind is distinct from the programme one.
      const personal = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind, owner_id)
          values (${first.formationId}::uuid, ${a}::uuid, ${b}::uuid, 'prerequisite', ${user.id}::uuid)
        `),
      );
      expect(personal.code).toBe('00000');

      // `f` stays a valid target, proving the duplicate attempt above did not hide a broader bug.
      expect(
        (
          await attempt(tx, () =>
            tx.execute(sql`
              insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
              values (${first.formationId}::uuid, ${e}::uuid, ${f}::uuid, 'tutor')
            `),
          )
        ).code,
      ).toBe('00000');
    });
  });

  it('EF-7 / CL-9 / CA-6 — la suppression d’une formation cascade et remet la formation courante à nul', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 2,
        chaptersPerModule: 2,
        notionsPerChapter: 2,
      });
      await tx.execute(
        sql`update public.profiles set current_formation_id = ${programme.formationId}::uuid where id = ${user.id}::uuid`,
      );
      await tx.execute(sql`
        insert into public.cadrage_messages (formation_id, user_id, role, content, position)
        values (${programme.formationId}::uuid, ${user.id}::uuid, 'tutor', 'Bonjour', 1)
      `);
      await tx.execute(sql`
        insert into public.programme_imports (formation_id, user_id, source_kind, raw_text)
        values (${programme.formationId}::uuid, ${user.id}::uuid, 'text', 'Programme collé')
      `);
      await tx.execute(sql`
        insert into public.programme_change_requests (formation_id, user_id, message)
        values (${programme.formationId}::uuid, ${user.id}::uuid, 'Alléger le programme')
      `);
      await tx.execute(sql`
        insert into public.chapter_progress (user_id, chapter_id)
        values (${user.id}::uuid, ${programme.chapterIds[0] ?? ''}::uuid)
      `);
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id)
        values (${user.id}::uuid, ${programme.moduleIds[0] ?? ''}::uuid)
      `);

      await tx.execute(
        sql`delete from public.formations where id = ${programme.formationId}::uuid`,
      );

      expect(await count(tx, 'modules', 'formation_id', programme.formationId)).toBe(0);
      expect(await count(tx, 'chapters', 'formation_id', programme.formationId)).toBe(0);
      expect(await count(tx, 'notions', 'formation_id', programme.formationId)).toBe(0);
      expect(await count(tx, 'cadrage_messages', 'formation_id', programme.formationId)).toBe(0);
      expect(await count(tx, 'programme_imports', 'formation_id', programme.formationId)).toBe(0);
      expect(
        await count(tx, 'programme_change_requests', 'formation_id', programme.formationId),
      ).toBe(0);
      expect(await count(tx, 'chapter_progress', 'user_id', user.id)).toBe(0);
      expect(await count(tx, 'module_progress', 'user_id', user.id)).toBe(0);

      const profile = await tx.execute<Row>(
        sql`select current_formation_id::text as current from public.profiles where id = ${user.id}::uuid`,
      );
      expect(profile[0]?.current).toBeNull();
    });
  });

  it('CL-8 — le statut d’avancement et sa date restent cohérents', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const chapterId = programme.chapterIds[0] ?? '';
      const moduleId = programme.moduleIds[0] ?? '';

      const chapter = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.chapter_progress (user_id, chapter_id, contributions_status)
          values (${user.id}::uuid, ${chapterId}::uuid, 'done')
        `),
      );
      expect(chapter.code).toBe('23514');

      const module = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status)
          values (${user.id}::uuid, ${moduleId}::uuid, 'validated')
        `),
      );
      expect(module.code).toBe('23514');

      expect(
        (
          await attempt(tx, () =>
            tx.execute(sql`
              insert into public.chapter_progress (user_id, chapter_id, contributions_status, done_at)
              values (${user.id}::uuid, ${chapterId}::uuid, 'done', now())
            `),
          )
        ).code,
      ).toBe('00000');
      expect(
        (
          await attempt(tx, () =>
            tx.execute(sql`
              insert into public.module_progress (user_id, module_id, status, validated_at)
              values (${user.id}::uuid, ${moduleId}::uuid, 'validated', now())
            `),
          )
        ).code,
      ).toBe('00000');
    });
  });

  it('CL-10 — l’entretien de mémoire n’est permis qu’après la fin de la formation', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const formationId = await createFormation(tx, user.id, 'active');
      const failure = await attempt(tx, () =>
        tx.execute(
          sql`update public.formations set maintenance_mode = 'light' where id = ${formationId}::uuid`,
        ),
      );
      expect(failure.code).toBe('23514');
      expect(failure.message).toContain('formations_maintenance_only_completed');

      expect(
        (
          await attempt(tx, () =>
            tx.execute(
              sql`update public.formations set status = 'completed', maintenance_mode = 'light' where id = ${formationId}::uuid`,
            ),
          )
        ).code,
      ).toBe('00000');
    });
  });

  it('EF-6 / CA-7 — la recherche plein texte sans accent utilise notions_fts_idx', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 2,
      });
      await tx.execute(sql`
        update public.notions set label = 'Écriture de régularisation',
          short_definition = 'Passage d''écriture comptable'
        where id = ${programme.notionIds[0] ?? ''}::uuid
      `);
      await tx.execute(sql`
        update public.notions set label = 'Équilibre d’une pièce',
          short_definition = 'Débit et crédit'
        where id = ${programme.notionIds[1] ?? ''}::uuid
      `);

      const matches = await tx.execute<Row>(sql`
        select id::text as id
        from public.notions
        where formation_id = ${programme.formationId}::uuid
          and to_tsvector(
            'simple',
            public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
          ) @@ plainto_tsquery('simple', public.immutable_unaccent('ecriture'))
      `);
      expect(matches).toHaveLength(1);

      await tx.execute(sql`set local enable_seqscan = off`);
      const plan = await tx.execute<Row>(sql`
        explain (format json)
        select id from public.notions
        where to_tsvector(
            'simple',
            public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
          ) @@ plainto_tsquery('simple', public.immutable_unaccent('ecriture'))
      `);
      const rendered = JSON.stringify(plan);
      expect(rendered).toContain('notions_fts_idx');
      expect(rendered).toContain('Bitmap Index Scan');
    });
  });

  it('ET-6 / CA-7 — le programme complet (7 modules, 24 chapitres, 48 notions) se lit en moins de 20 ms', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const programme = await createTestProgramme(tx, user.id, {
        modules: 7,
        chaptersPerModule: 4,
        notionsPerChapter: 2,
      });
      // The factory is uniform: remove one chapter from four modules to reach the stated size.
      for (const chapterId of programme.chapterIds.slice(-4)) {
        await tx.execute(sql`delete from public.chapters where id = ${chapterId}::uuid`);
      }
      const sizes = await tx.execute<Row>(sql`
        select
          (select count(*)::int from public.modules where formation_id = ${programme.formationId}::uuid) as modules,
          (select count(*)::int from public.chapters where formation_id = ${programme.formationId}::uuid) as chapters,
          (select count(*)::int from public.notions where formation_id = ${programme.formationId}::uuid) as notions
      `);
      expect(sizes[0]).toMatchObject({ modules: 7, chapters: 24, notions: 48 });

      const query = sql`
        select m.id, m.position, c.id, c.position, n.id, n.position
        from public.modules m
        left join public.chapters c on c.module_id = m.id
        left join public.notions n on n.chapter_id = c.id
        where m.formation_id = ${programme.formationId}::uuid
        order by m.position, c.position, n.position
      `;
      await tx.execute(query);
      const plan = await tx.execute<Row>(sql`explain (analyze, format json) ${query}`);
      const rendered = JSON.stringify(plan);
      const match = /"Execution Time":\s*([0-9.]+)/.exec(rendered);
      const executionMs = Number(match?.[1] ?? Number.POSITIVE_INFINITY);
      expect(executionMs, `durée mesurée : ${String(executionMs)} ms`).toBeLessThan(20);
    });
  });
});
