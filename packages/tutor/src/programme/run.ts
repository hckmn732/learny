import {
  ProgrammeDraftSchema,
  type ProgrammeDraft,
  type TutorDocument,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, err, isAppError, ok, type Clock, type Result } from '@learny/core';
import type { Db } from '@learny/db';
import { llm } from '@learny/llm';

import { buildProgrammePrompt, PROGRAMME_PROMPT_ID, type ProgrammePromptInput } from './prompt';
import { PROGRAMME_MAX_CORRECTIONS } from './schema';

// One structured programme call (SPEC-605 EF-1 to EF-3, ET-3, ET-4). The model proposes a
// `ProgrammeDraft`; the service numbers it and validates it again before any write. An invalid
// output is corrected at most twice, then the caller receives `AI_TASK_FAILED`; no provider SDK is
// imported here.

export interface ProgrammeRunContext {
  userId: string;
  formationId: string;
  profile: TutorProfile;
  clock: Clock;
  requestId: string;
  llmDb: Db;
  /** Test and demonstration seam: explicit simulated scenario (ADR-0153). */
  scenario?: string;
}

export interface ProgrammeRunState {
  title: string;
  message: string;
  context?: string;
  documents?: readonly TutorDocument[];
  history?: readonly { role: 'learner' | 'tutor'; content: string }[];
}

export interface ProgrammeDraftResult {
  draft: ProgrammeDraft;
  attempts: number;
  promptId: string;
  promptVersion: number;
}

function programmeTaskFailed(cause?: unknown): AppError {
  return new AppError(
    'AI_TASK_FAILED',
    'Le tuteur n’a pas pu structurer le programme.',
    cause === undefined ? {} : { cause },
  );
}

function retryable(error: AppError): boolean {
  return error.code === 'AI_UNAVAILABLE' || error.code === 'AI_RATE_LIMITED';
}

function mapped(error: AppError): AppError {
  return retryable(error) ? error : programmeTaskFailed(error);
}

function promptInput(state: ProgrammeRunState, profile: TutorProfile): ProgrammePromptInput {
  return {
    title: state.title,
    profile,
    message: state.message,
    ...(state.context === undefined ? {} : { context: state.context }),
    ...(state.documents === undefined ? {} : { documents: state.documents }),
    ...(state.history === undefined ? {} : { history: state.history }),
  };
}

/** Runs the programme task once and returns the draft to persist, never a partially applied one. */
export async function runProgrammeDraft(
  ctx: ProgrammeRunContext,
  state: ProgrammeRunState,
): Promise<Result<ProgrammeDraftResult>> {
  const prompt = buildProgrammePrompt(promptInput(state, ctx.profile));
  const created = await llm.session(
    { userId: ctx.userId, db: ctx.llmDb, requestId: ctx.requestId },
    {
      task: 'programme',
      formationId: ctx.formationId,
      promptId: PROGRAMME_PROMPT_ID,
      ...(ctx.scenario === undefined ? {} : { mock: { scenario: ctx.scenario } }),
    },
  );
  if (!created.ok) return err(mapped(created.error));
  const session = created.value;

  let correction: string | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= PROGRAMME_MAX_CORRECTIONS; attempt += 1) {
    attempts += 1;
    const correctionMessage =
      correction === null
        ? null
        : `Correction: the previous answer violated the ProgrammeDraft contract (${correction}). Return a valid complete ProgrammeDraft now.`;
    // The programme task streams its answer at the provider level (32k output tokens), so the
    // structured draft is requested as JSON text and validated here by the same Zod contract.
    const generated = await session.step({
      system: prompt.system,
      messages:
        correctionMessage === null
          ? prompt.messages
          : [...prompt.messages, { role: 'user' as const, content: correctionMessage }],
    });
    if (!generated.ok) {
      if (generated.error.code === 'INVALID_OUTPUT') {
        correction = 'the answer was not valid JSON';
        continue;
      }
      return err(mapped(generated.error));
    }
    const text = generated.value.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      correction = 'the answer was not valid JSON';
      continue;
    }
    const parsed = ProgrammeDraftSchema.safeParse(value);
    if (parsed.success) {
      return ok({
        draft: parsed.data,
        attempts,
        promptId: prompt.id,
        promptVersion: prompt.version,
      });
    }
    correction = parsed.error.issues.map((issue) => issue.message).join('; ');
  }
  return err(
    programmeTaskFailed(new AppError('INVALID_OUTPUT', 'Sortie invalide après corrections.')),
  );
}

/** Kept for symmetry with the cadrage runner and to make error mapping testable. */
export function programmeRunFailed(error: AppError): AppError {
  return isAppError(error) ? mapped(error) : programmeTaskFailed(error);
}
