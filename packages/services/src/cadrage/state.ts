import {
  CADRAGE_RUBRIC_KEYS,
  type CadrageMessage,
  type CadrageProfile,
  type CadrageRubricKey,
  type CadrageStateDto,
  type CadrageSuggestion,
} from '@learny/contracts';
import type { DbTx } from '@learny/db';
import { serviceDb, sql } from '@learny/db';

// Reads and projection of the cadrage state (SPEC-604 ET-1, ET-2). One state builder is shared by
// creation, the two message routes and the server page, so the panel, the question number and the
// `canGenerate` flag can never diverge.

export const CADRAGE_ERROR_MESSAGES = {
  AI_UNAVAILABLE:
    'Aucun modèle d’IA n’est disponible pour le tuteur. Ajoutez votre clé ou souscrivez à l’IA fournie.',
  AI_TASK_FAILED: 'Le tuteur n’a pas pu répondre.',
  RATE_LIMITED: 'Trop de demandes en peu de temps. Patientez une minute.',
  AI_RATE_LIMITED: 'Trop de demandes en peu de temps. Patientez une minute.',
} as const;

export function cadrageErrorMessage(code: string): string {
  return (
    CADRAGE_ERROR_MESSAGES[code as keyof typeof CADRAGE_ERROR_MESSAGES] ??
    CADRAGE_ERROR_MESSAGES.AI_TASK_FAILED
  );
}

export interface FormationRow {
  id: string;
  title: string;
  status: string;
  cadrage_profile: unknown;
  objectives: string[];
  course_language: string;
  [key: string]: unknown;
}

export interface MessageRow {
  id: string;
  role: 'tutor' | 'learner';
  content: string;
  question_key: string | null;
  suggestions: unknown;
  position: number;
  created_at: string | Date;
  [key: string]: unknown;
}

export function emptyProfile(): CadrageProfile {
  return Object.fromEntries(
    CADRAGE_RUBRIC_KEYS.map((key) => [key, { value: null, state: 'todo' }]),
  ) as CadrageProfile;
}

/** Stored JSON is bounded and completed with the five rubrics, in display order. */
export function readProfile(value: unknown): CadrageProfile {
  const base = emptyProfile();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return base;
  for (const key of CADRAGE_RUBRIC_KEYS) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const state =
      record.state === 'done' || record.state === 'waiting' || record.state === 'todo'
        ? record.state
        : 'todo';
    const rawValue = typeof record.value === 'string' ? record.value : null;
    base[key as CadrageRubricKey] = { value: rawValue, state };
  }
  return base;
}

function readSuggestions(value: unknown): CadrageSuggestion[] | null {
  if (!Array.isArray(value)) return null;
  const suggestions: CadrageSuggestion[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.label !== 'string' || typeof record.value !== 'string') continue;
    suggestions.push({
      label: record.label,
      value: record.value,
      description: typeof record.description === 'string' ? record.description : null,
      multi: record.multi === true,
    });
  }
  return suggestions.length === 0 ? null : suggestions;
}

function messageDto(row: MessageRow, questionNumber: number | null): CadrageMessage {
  const suggestions = row.role === 'tutor' ? readSuggestions(row.suggestions) : null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    questionNumber,
    suggestions,
    multi: suggestions?.some((suggestion) => suggestion.multi) === true,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function toSummary(row: FormationRow): {
  id: string;
  title: string;
  status:
    | 'cadrage'
    | 'programme_proposed'
    | 'active'
    | 'paused'
    | 'completed'
    | 'archived';
} {
  return {
    id: row.id,
    title: row.title,
    status: row.status as
      | 'cadrage'
      | 'programme_proposed'
      | 'active'
      | 'paused'
      | 'completed'
      | 'archived',
  };
}

/** CL-1 — a learner message with no tutor answer is the interrupted turn. */
export function interruptedError(messages: readonly MessageRow[]): {
  code: string;
  message: string;
} | null {
  const last = messages.at(-1);
  if (last?.role !== 'learner') return null;
  return { code: 'AI_TASK_FAILED', message: CADRAGE_ERROR_MESSAGES.AI_TASK_FAILED };
}

export function buildState(
  formation: FormationRow,
  rows: readonly MessageRow[],
  error: { code: string; message: string } | null = interruptedError(rows),
): CadrageStateDto {
  let questionCount = 0;
  const messages: CadrageMessage[] = [];
  for (const row of rows) {
    const isQuestion = row.role === 'tutor' && row.question_key !== null;
    if (isQuestion) questionCount = Math.min(questionCount + 1, 5);
    messages.push(messageDto(row, isQuestion ? questionCount : null));
  }

  let lastTutor: MessageRow | undefined;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === 'tutor') {
      lastTutor = row;
      break;
    }
  }
  const finished = lastTutor !== undefined && lastTutor.question_key === null;

  let pendingQuestion: CadrageStateDto['pendingQuestion'] = null;
  const last = rows.at(-1);
  if (last?.role === 'tutor' && last.question_key !== null) {
    pendingQuestion = {
      messageId: last.id,
      questionKey: last.question_key as NonNullable<
        CadrageStateDto['pendingQuestion']
      >['questionKey'],
      multi: readSuggestions(last.suggestions)?.some((suggestion) => suggestion.multi) === true,
    };
  }

  const profile = readProfile(formation.cadrage_profile);
  return {
    formationId: formation.id,
    title: formation.title,
    messages,
    profile,
    questionsAsked: questionCount,
    finished,
    canGenerate: profile.scope.state === 'done' && profile.target_level.state === 'done',
    pendingQuestion,
    error: error ?? interruptedError(rows),
  };
}

export async function readFormation(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FormationRow | null> {
  const rows = await tx.execute<FormationRow>(sql`
    select id::text as id,
           title,
           status::text as status,
           cadrage_profile,
           objectives::text[] as objectives,
           course_language::text as course_language
    from public.formations
    where id = ${formationId}::uuid
      and owner_id = ${userId}::uuid
    limit 1
  `);
  return rows[0] ?? null;
}

export async function readMessages(tx: DbTx, formationId: string): Promise<MessageRow[]> {
  return tx.execute<MessageRow>(sql`
    select id::text as id,
           role::text as role,
           content,
           question_key::text as question_key,
           suggestions,
           position,
           created_at
    from public.cadrage_messages
    where formation_id = ${formationId}::uuid
    order by position asc
  `);
}

/** ST/ET-2 — one more position; the unique constraint protects a concurrent insert. */
export async function nextPosition(tx: DbTx, formationId: string): Promise<number> {
  const rows = await tx.execute<{ next: number }>(sql`
    select coalesce(max(position), 0) + 1 as next
    from public.cadrage_messages
    where formation_id = ${formationId}::uuid
  `);
  return rows[0]?.next ?? 1;
}

export function suggestionsJson(
  suggestions: readonly { label: string; description?: string | undefined; value: string }[],
  multi: boolean,
): string {
  return JSON.stringify(
    suggestions.map((suggestion) => ({
      label: suggestion.label,
      value: suggestion.value,
      multi,
      ...(suggestion.description === undefined ? {} : { description: suggestion.description }),
    })),
  );
}

/** Stable identifier of the completion event: one conclusion per formation, whatever the retry. */
export function cadrageCompletedEventId(formationId: string): string {
  return `cadrage-completed:${formationId}`;
}

/** A conclusion already requested keeps the profile frozen even while the status is `cadrage`. */
export async function cadrageAlreadyCompleted(formationId: string): Promise<boolean> {
  const rows = await serviceDb().execute<{ present: boolean }>(sql`
    select true as present
    from public.event_outbox
    where event_id = ${cadrageCompletedEventId(formationId)}
    limit 1
  `);
  return rows.length > 0;
}
