// SPEC-807 EF-5, ET-2 — isolated data of the mock-exam journey. Each run creates its own learner
// and formation (the declared initial fixture of ET-3): a four-module programme whose first two
// modules are studied, one choice question per notion and an exam guide whose official format is
// only proposed, so the learner has to confirm it before starting. Everything else (format
// confirmation, start, answers, marks, resumption, submission, gaps) goes through the product.
import { createBrick } from '@learny/testing';
import { serviceDb, sql } from '@learny/testing/db';
import { createTestProgramme } from '@learny/testing/db';

/** Official format of the guide: 8 questions in 16 minutes, 75 % to pass (≠ default 20/40/70). */
export const GUIDE_FORMAT = { questions: 8, durationMin: 16, threshold: 75 } as const;

export const MODULES = [
  { title: 'Fondamentaux et Fiori', notions: ['Launchpad Fiori', 'Rôles métier'], studied: true },
  {
    title: 'Structure organisationnelle',
    notions: ['Société comptable', 'Plan de comptes'],
    studied: true,
  },
  {
    title: 'Comptabilité générale',
    notions: ['Pièce comptable', 'Clé de comptabilisation'],
    studied: false,
  },
  {
    title: 'Comptabilité fournisseurs',
    notions: ['Facture fournisseur', 'Paiement automatique'],
    studied: false,
  },
] as const;

/** Studied notion the learner deliberately misses: it must become the diagnosed gap. */
export const MISSED_NOTION = 'Plan de comptes';

export const CORRECT_PREFIX = 'Affirmation exacte';
export const WRONG_PREFIX = 'Affirmation erronée';

export interface MockExamSeed {
  formationId: string;
  moduleIds: string[];
  notionIds: Record<string, string>;
}

export function questionStem(notion: string): string {
  return `${notion} : quelle affirmation est exacte ?`;
}

function choicePayload(notion: string): unknown {
  return {
    stem: questionStem(notion),
    mode: 'single',
    options: [
      { id: 'a', text: `${CORRECT_PREFIX} sur ${notion}`, correct: true, notionId: null },
      { id: 'b', text: `${WRONG_PREFIX} sur ${notion}`, correct: false, notionId: null },
      { id: 'c', text: `Hors sujet pour ${notion}`, correct: false, notionId: null },
      { id: 'd', text: `Réponse incomplète sur ${notion}`, correct: false, notionId: null },
    ],
    explanation: `La notion ${notion} est décrite dans le guide de certification.`,
    objective: `Vérifier la notion ${notion}`,
    sources: [],
  };
}

export async function seedMockExamJourney(userId: string): Promise<MockExamSeed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: MODULES.length,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'Certification SAP Finance',
    });
    const notionIds: Record<string, string> = {};
    for (const [moduleIndex, entry] of MODULES.entries()) {
      const moduleId = programme.moduleIds[moduleIndex];
      if (moduleId === undefined) throw new Error('module du parcours examen introuvable');
      await tx.execute(sql`
        update public.modules
        set title = ${entry.title}, planned_start = '2026-11-02',
            planned_end = ${moduleIndex >= 2 ? '2026-12-04' : '2026-11-30'}::date
        where id = ${moduleId}::uuid
      `);
      for (const [notionIndex, label] of entry.notions.entries()) {
        const notionId = programme.notionIds[moduleIndex * 2 + notionIndex];
        if (notionId === undefined) throw new Error('notion du parcours examen introuvable');
        await tx.execute(sql`
          update public.notions set label = ${label} where id = ${notionId}::uuid
        `);
        notionIds[label] = notionId;
        await createBrick(tx, {
          ownerId: userId,
          formationId: programme.formationId,
          type: 'choice_question',
          purpose: 'bank',
          notionIds: [notionId],
          payload: choicePayload(label),
        });
      }
      if (entry.studied) {
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, validated_at)
          values (
            ${userId}::uuid, ${moduleId}::uuid,
            ${moduleIndex === 0 ? 'validated' : 'open'}::public.module_status,
            ${moduleIndex === 0 ? '2026-11-09T18:00:00Z' : null}::timestamptz
          )
          on conflict (user_id, module_id) do update
          set status = excluded.status, validated_at = excluded.validated_at
        `);
      }
    }
    // The guide only carries an extracted format: `exam_format` stays empty until confirmation.
    await tx.execute(sql`
      insert into public.resources (owner_id, formation_id, kind, origin, title, url, status, metadata)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, 'exam_guide', 'learner',
        'Guide de certification', 'https://example.test/guide-certification.pdf', 'ready',
        ${JSON.stringify({ examFormat: GUIDE_FORMAT })}::jsonb
      )
    `);
    await tx.execute(sql`
      update public.formations
      set objectives = '{exam}'::public.formation_objective[],
          start_date = '2026-11-02', end_date = '2026-12-11',
          default_threshold = 80, exam_format = null
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', timezone = 'Europe/Paris',
          current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return { formationId: programme.formationId, moduleIds: programme.moduleIds, notionIds };
  });
}

/**
 * Declared clock fixture of the interruption (ET-1). The server clock is frozen by
 * `CLOCK_FIXED_AT` for the whole run and cannot move while the server is up, so the minutes
 * spent away are reproduced by moving the attempt's own instants back by the same amount: for
 * the exam timer (`deadline_at - now`) this is exactly a server clock advanced by `minutes`.
 * No answer, mark or status is touched.
 */
export async function elapseExamMinutes(attemptId: string, minutes: number): Promise<void> {
  const interval = `${String(minutes)} minutes`;
  await serviceDb().execute(sql`
    update public.attempts
    set started_at = started_at - ${interval}::interval,
        deadline_at = deadline_at - ${interval}::interval
    where id = ${attemptId}::uuid and status = 'in_progress'
  `);
}

/** Attempts of the formation, as persisted (single-attempt and timer checks). */
export async function readExamAttempts(
  formationId: string,
): Promise<{ id: string; status: string; deadlineAt: string }[]> {
  const rows = await serviceDb().execute<{ id: string; status: string; deadline_at: string }>(sql`
    select at.id::text as id, at.status::text as status,
           to_char(at.deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as deadline_at
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where act.formation_id = ${formationId}::uuid and act.kind = 'mock_exam'
    order by at.attempt_no
  `);
  return rows.map((row) => ({ id: row.id, status: row.status, deadlineAt: row.deadline_at }));
}
