import {
  FORMATION_ACCENTS,
  FormationCreateInput,
  type CadrageStateDto,
  type FormationCreateOutput,
  type FormationSummary,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { cadrageScenario, runCadrageTurn } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';
import { formationMonogram } from '../sidebar';

import { persistTutorTurn } from './persist';
import {
  buildState,
  cadrageErrorMessage,
  emptyProfile,
  readFormation,
  readMessages,
  toSummary,
  type FormationRow,
} from './state';

// Creation of a formation and of its first cadrage turn (SPEC-604 EF-4, ET-1; BR-FOR-01,
// BR-FOR-03, ADR-0162). The formation is committed before the tutor is called: an AI failure
// leaves a resumable formation and fills `cadrage.error` instead of returning an error.

interface AccountRow {
  tone: 'vous' | 'tu';
  course_language: string;
  [key: string]: unknown;
}

interface AccentRow {
  accent_color: string;
  [key: string]: unknown;
}

function nextAccent(used: readonly string[]): (typeof FORMATION_ACCENTS)[number] {
  return (
    FORMATION_ACCENTS.find((accent) => !used.includes(accent)) ?? FORMATION_ACCENTS[0]
  );
}

export interface CreateFormationDeps {
  /** Test seam: explicit fixture scenario, otherwise derived from the title and the turn count. */
  scenario?: string;
}

export function createFormation(
  ctx: ServiceContext,
  input: unknown,
  deps: CreateFormationDeps = {},
): Promise<Result<FormationCreateOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const { title } = FormationCreateInput.parse(input);
    const now = ctx.clock.now();

    const created = await db.run(async (tx) => {
      const accounts = await tx.execute<AccountRow>(sql`
        select tone::text as tone, course_language::text as course_language
        from public.profiles
        where id = ${userId}::uuid
        limit 1
      `);
      const account = accounts[0];
      if (account === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
      const accents = await tx.execute<AccentRow>(sql`
        select accent_color::text as accent_color
        from public.formations
        where owner_id = ${userId}::uuid
          and status in ('cadrage', 'programme_proposed', 'active', 'paused')
      `);
      const accent = nextAccent(accents.map((row) => row.accent_color));
      const profile = emptyProfile();
      const rows = await tx.execute<FormationRow>(sql`
        insert into public.formations (
          owner_id, title, status, course_language, monogram, accent_color, cadrage_profile,
          created_at, updated_at
        )
        values (
          ${userId}::uuid,
          ${title},
          'cadrage',
          ${account.course_language}::public.course_language,
          ${formationMonogram(title)},
          ${accent}::public.formation_accent,
          ${JSON.stringify(profile)}::jsonb,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        returning id::text as id,
                  title,
                  status::text as status,
                  cadrage_profile,
                  objectives::text[] as objectives,
                  course_language::text as course_language
      `);
      const formation = rows[0];
      if (formation === undefined) throw new AppError('INTERNAL_ERROR', 'Formation non créée.');
      return { formation, tone: account.tone, courseLanguage: account.course_language };
    });

    const state = buildState(created.formation, []);
    const run = await runCadrageTurn(
      {
        userId,
        formationId: created.formation.id,
        profile: {
          tone: created.tone,
          courseLanguage: created.courseLanguage as TutorProfile['courseLanguage'],
        },
        clock: ctx.clock,
        requestId: ctx.requestId,
        llmDb: serviceDb(),
        scenario: deps.scenario ?? cadrageScenario(title, 0),
      },
      {
        title,
        profile: state.profile,
        history: [],
        learnerMessage: '',
        questionsAsked: 0,
        finished: false,
        pendingQuestionKey: null,
      },
    );

    if (!run.ok) {
      return {
        formation: toSummary(created.formation) satisfies FormationSummary,
        cadrage: {
          ...state,
          error: { code: run.error.code, message: cadrageErrorMessage(run.error.code) },
        } satisfies CadrageStateDto,
      };
    }

    const final = await db.run(async (tx) => {
      const formation = await readFormation(tx, userId, created.formation.id);
      if (formation === null) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }
      await persistTutorTurn(tx, formation, userId, run.value.applied, ctx.clock);
      const updated = await readFormation(tx, userId, formation.id);
      const messages = await readMessages(tx, formation.id);
      return buildState(updated ?? formation, messages, null);
    });

    return {
      formation: {
        id: final.formationId,
        title: final.title,
        status: 'cadrage',
      },
      cadrage: final,
    };
  });
}
