import { eq } from 'drizzle-orm';

import {
  CadrageMessageCreateInput,
  type CadrageQuestionKey,
  type CadrageStateDto,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { schema, serviceDb, sql, type DbTx } from '@learny/db';
import { cadrageScenario, runCadrageTurn } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { persistTutorTurn } from './persist';
import {
  buildState,
  cadrageAlreadyCompleted,
  nextPosition,
  readFormation,
  readMessages,
  type FormationRow,
  type MessageRow,
} from './state';

const { profiles } = schema;

// One learner answer and the tutor turn it triggers (SPEC-604 EF-5 to EF-9, ET-2; CL-1, CL-6,
// CL-7). The learner message is committed in its own transaction, the model is called outside any
// transaction, then the validated turn is committed in a second transaction. A failed tutor turn
// therefore keeps the answer and can be retried without losing it.

interface PendingQuestion {
  key: string;
  multi: boolean;
  values: Set<string>;
  labels: Map<string, string>;
}

function pendingOf(rows: readonly MessageRow[]): PendingQuestion | null {
  const last = rows.at(-1);
  if (last?.role !== 'tutor' || last.question_key === null) return null;
  const suggestions = Array.isArray(last.suggestions) ? last.suggestions : [];
  const values = new Set<string>();
  const labels = new Map<string, string>();
  let multi = false;
  for (const entry of suggestions) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.value !== 'string' || typeof record.label !== 'string') continue;
    values.add(record.value);
    labels.set(record.value, record.label);
    if (record.multi === true) multi = true;
  }
  return { key: last.question_key, multi, values, labels };
}

function staleAnswer(): AppError {
  return new AppError('VALIDATION_FAILED', 'Cette question a déjà reçu une réponse.', {
    status: 400,
  });
}

function composeSelections(
  input: { selections?: readonly string[] | undefined },
  pending: PendingQuestion | null,
): string {
  if (pending === null || input.selections === undefined) throw staleAnswer();
  const selected: string[] = [];
  for (const value of input.selections) {
    if (!pending.values.has(value)) throw staleAnswer();
    selected.push(pending.labels.get(value) ?? value);
  }
  return selected.join(', ');
}

function countLearner(rows: readonly MessageRow[]): number {
  return rows.filter((row) => row.role === 'learner').length;
}

function countQuestions(rows: readonly MessageRow[]): number {
  return Math.min(rows.filter((row) => row.role === 'tutor' && row.question_key !== null).length, 5);
}

function historyOf(rows: readonly MessageRow[]) {
  return rows.map((row) => ({ role: row.role, content: row.content }));
}

async function readTutorProfile(tx: DbTx, userId: string) {
  const rows = await tx
    .select({ tone: profiles.tutorTone, courseLanguage: profiles.courseLanguage })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return { tone: row.tone, courseLanguage: row.courseLanguage } satisfies TutorProfile;
}

export interface PostCadrageMessageDeps {
  scenario?: string;
}

interface PreparedTurn {
  formation: FormationRow;
  history: { role: 'tutor' | 'learner'; content: string }[];
  learnerContent: string;
  pendingKey: string | null;
  questionsAsked: number;
  finished: boolean;
  profile: TutorProfile;
  learnerAnswers: number;
}

export function postCadrageMessage(
  ctx: ServiceContext,
  formationId: string,
  input: unknown,
  deps: PostCadrageMessageDeps = {},
): Promise<Result<CadrageStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = CadrageMessageCreateInput.parse(input);
    if (await cadrageAlreadyCompleted(formationId)) {
      throw new AppError('CONFLICT', 'Le cadrage de cette formation est terminé.', { status: 409 });
    }

    const prepared = await db.run<PreparedTurn>(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status !== 'cadrage') {
        throw new AppError('CONFLICT', 'Le cadrage de cette formation est terminé.', {
          status: 409,
        });
      }
      const rows = await readMessages(tx, formationId);
      const last = rows.at(-1);
      const pending = pendingOf(rows);
      const profile = await readTutorProfile(tx, userId);

      if (parsed.retry === true) {
        if (rows.length === 0) {
          return {
            formation,
            history: [],
            learnerContent: '',
            pendingKey: null,
            questionsAsked: 0,
            finished: false,
            profile,
            learnerAnswers: 0,
          };
        }
        if (last?.role !== 'learner') {
          throw new AppError('CONFLICT', 'Aucune réponse du tuteur à réessayer.', { status: 409 });
        }
        const before = rows.slice(0, -1);
        return {
          formation,
          history: historyOf(before),
          learnerContent: last.content,
          pendingKey: pendingOf(before)?.key ?? null,
          questionsAsked: countQuestions(before),
          finished: buildState(formation, before, null).finished,
          profile,
          learnerAnswers: countLearner(rows),
        };
      }

      if (last?.role === 'learner') {
        throw new AppError('CONFLICT', 'Le tuteur n’a pas encore répondu à votre message.', {
          status: 409,
        });
      }

      const learnerContent =
        parsed.selections === undefined
          ? (parsed.content ?? '')
          : composeSelections(parsed, pending);

      const position = await nextPosition(tx, formationId);
      await tx.execute(sql`
        insert into public.cadrage_messages (
          formation_id, user_id, role, content, question_key, suggestions, position, created_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          'learner',
          ${learnerContent},
          null,
          null,
          ${position},
          ${ctx.clock.now().toISOString()}::timestamptz
        )
      `);
      return {
        formation,
        history: historyOf(rows),
        learnerContent,
        pendingKey: pending?.key ?? null,
        questionsAsked: countQuestions(rows),
        finished: buildState(formation, rows, null).finished,
        profile,
        learnerAnswers: countLearner(rows) + 1,
      };
    });

    const run = await runCadrageTurn(
      {
        userId,
        formationId,
        profile: prepared.profile,
        clock: ctx.clock,
        requestId: ctx.requestId,
        llmDb: serviceDb(),
        scenario: deps.scenario ?? cadrageScenario(prepared.formation.title, prepared.learnerAnswers),
      },
      {
        title: prepared.formation.title,
        profile: buildState(prepared.formation, [], null).profile,
        history: prepared.history,
        learnerMessage: prepared.learnerContent,
        questionsAsked: prepared.questionsAsked,
        finished: prepared.finished,
        pendingQuestionKey: prepared.pendingKey as CadrageQuestionKey | null,
      },
    );
    if (!run.ok) throw run.error;

    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status !== 'cadrage') {
        throw new AppError('CONFLICT', 'Le cadrage de cette formation est terminé.', {
          status: 409,
        });
      }
      await persistTutorTurn(tx, formation, userId, run.value.applied, ctx.clock);
      const updated = await readFormation(tx, userId, formationId);
      const messages = await readMessages(tx, formationId);
      return buildState(updated ?? formation, messages, null);
    });
  });
}
