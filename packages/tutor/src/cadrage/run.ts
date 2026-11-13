import type { TutorProfile } from '@learny/contracts';
import { AppError, err, isAppError, ok, type Clock, type Result } from '@learny/core';
import type { Db } from '@learny/db';
import { llm } from '@learny/llm';

import {
  applyTutorTurn,
  type AppliedTutorTurn,
  type CadrageProfile,
} from './apply-tutor-turn';
import {
  buildCadragePrompt,
  CADRAGE_PROMPT_ID,
  type CadrageHistoryEntry,
} from './prompt';
import {
  CADRAGE_MAX_CORRECTIONS,
  CadrageTurnSchema,
  type CadrageQuestionKey,
  type CadrageTurn,
} from './schema';

// One synchronous, non-streamed cadrage turn (SPEC-604 ET-2 to ET-5, ADR-0164). The model answers
// with a structured `CadrageTurn`; the code validates and applies it. An invalid output is sent
// back to the model at most twice; after that the caller receives `AI_TASK_FAILED` (CL-4). Model
// resolution and the journal belong to @learny/llm: this module never imports a provider SDK.

export interface CadrageTutorState {
  title: string;
  profile: CadrageProfile;
  history: readonly CadrageHistoryEntry[];
  learnerMessage: string;
  questionsAsked: number;
  finished: boolean;
  pendingQuestionKey: CadrageQuestionKey | null;
}

export interface CadrageRunContext {
  userId: string;
  formationId: string;
  profile: TutorProfile;
  clock: Clock;
  requestId: string;
  llmDb: Db;
  /** Test and demonstration seam: explicit simulated scenario (ADR-0153). */
  scenario?: string;
}

export interface CadrageTurnResult {
  turn: CadrageTurn;
  applied: AppliedTutorTurn;
  attempts: number;
  promptId: string;
  promptVersion: number;
}

export function cadrageTaskFailed(cause?: unknown): AppError {
  return new AppError(
    'AI_TASK_FAILED',
    'Le tuteur n’a pas pu répondre.',
    cause === undefined ? {} : { cause },
  );
}

function retryable(error: AppError): boolean {
  return error.code === 'AI_UNAVAILABLE' || error.code === 'AI_RATE_LIMITED';
}

function mapped(error: AppError): AppError {
  return retryable(error) ? error : cadrageTaskFailed(error);
}

/**
 * Runs the tutor and applies its turn. The returned state is the one to persist: the service only
 * writes it, so the profile can never be modified outside `applyTutorTurn`.
 */
export async function runCadrageTurn(
  ctx: CadrageRunContext,
  state: CadrageTutorState,
): Promise<Result<CadrageTurnResult>> {
  const prompt = buildCadragePrompt(
    {
      title: state.title,
      profile: state.profile,
      history: state.history,
      learnerMessage: state.learnerMessage,
    },
    ctx.profile,
  );
  const created = await llm.session(
    { userId: ctx.userId, db: ctx.llmDb, requestId: ctx.requestId },
    {
      task: 'tutor',
      formationId: ctx.formationId,
      promptId: CADRAGE_PROMPT_ID,
      ...(ctx.scenario === undefined ? {} : { mock: { scenario: ctx.scenario } }),
    },
  );
  if (!created.ok) return err(mapped(created.error));
  const session = created.value;

  let correction: string | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= CADRAGE_MAX_CORRECTIONS; attempt += 1) {
    attempts += 1;
    const content =
      correction === null
        ? prompt.message
        : `${prompt.message}\n\nCorrection: the previous answer violated the CadrageTurn contract (${correction}). Return a valid turn now.`;
    const generated = await session.object({
      system: prompt.system,
      messages: [{ role: 'user', content }],
      schema: CadrageTurnSchema,
    });
    if (!generated.ok) {
      if (generated.error.code === 'INVALID_OUTPUT') {
        correction = 'the object does not match the CadrageTurn schema';
        continue;
      }
      return err(mapped(generated.error));
    }
    try {
      const applied = applyTutorTurn(state.profile, generated.value, {
        questionsAsked: state.questionsAsked,
        finished: state.finished,
        pendingQuestionKey: state.pendingQuestionKey,
        learnerAnswer: state.learnerMessage,
        doneFallback:
          'Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez.',
      });
      return ok({
        turn: generated.value,
        applied,
        attempts,
        promptId: prompt.id,
        promptVersion: prompt.version,
      });
    } catch (error) {
      if (isAppError(error) && error.code === 'INVALID_OUTPUT') {
        correction = error.detail;
        continue;
      }
      throw error;
    }
  }
  return err(cadrageTaskFailed(new AppError('INVALID_OUTPUT', 'Sortie invalide après corrections.')));
}
