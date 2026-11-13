import {
  CourseChapterDraftSchema,
  type CourseChapterDraft,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, err, isAppError, ok, type Clock, type Result } from '@learny/core';
import type { Db } from '@learny/db';
import { llm } from '@learny/llm';

import {
  buildCoursePrompt,
  COURSE_MAX_CORRECTIONS,
  COURSE_PROMPT_ID,
  type CoursePromptInput,
} from './prompt';

// One structured course call for one chapter (SPEC-608 EF-1, EF-2, ET-4; BR-COU-02). The model
// proposes a `CourseChapterDraft`; the pipeline validates it, corrects at most twice, then returns
// `AI_TASK_FAILED` without persisting anything. Provider SDKs are never imported here.

export interface CourseRunContext {
  userId: string;
  formationId: string;
  profile: TutorProfile;
  clock: Clock;
  requestId: string;
  llmDb: Db;
  /** Test and demonstration seam: explicit simulated scenario (ADR-0153). */
  scenario?: string;
}

export interface CourseChapterResult {
  draft: CourseChapterDraft;
  attempts: number;
  promptId: string;
  promptVersion: number;
  model: string | null;
}

function courseTaskFailed(cause?: unknown): AppError {
  return new AppError(
    'AI_TASK_FAILED',
    'Le tuteur n’a pas pu rédiger le cours de ce chapitre.',
    cause === undefined ? {} : { cause },
  );
}

function retryable(error: AppError): boolean {
  return error.code === 'AI_UNAVAILABLE' || error.code === 'AI_RATE_LIMITED';
}

function mapped(error: AppError): AppError {
  return retryable(error) ? error : courseTaskFailed(error);
}

function assertNever(value: never): never {
  return value;
}

function placeholderValue(key: string, input: CoursePromptInput): string | undefined {
  const [name, rawIndex] = key.split(':');
  const index = rawIndex === undefined ? 0 : Math.max(0, Number(rawIndex) - 1);
  if (name === 'chapterId') return input.chapterId;
  if (name === 'chapterTitle') return input.chapterTitle;
  if (name === 'moduleTitle') return input.moduleTitle;
  if (name === 'formationTitle') return input.formationTitle;
  if (name === 'notionId') return input.notions[index]?.id;
  if (name === 'chunkId') return input.documents[index]?.chunkId;
  return undefined;
}

const PLACEHOLDER = /\{\{([a-zA-Z]+(?::\d+)?)\}\}/g;

/** Substitutes the deterministic ids the fixture cannot know; an unknown id is left for the schema. */
export function replaceCoursePlaceholders(value: unknown, input: CoursePromptInput): unknown {
  const serialised = JSON.stringify(value).replaceAll(PLACEHOLDER, (match, key: string) => {
    return placeholderValue(key, input) ?? match;
  });
  return JSON.parse(serialised) as unknown;
}

function parseObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned) as unknown;
}

function issueSummary(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.map(String).join('.') || '(racine)'}: ${issue.message}`)
    .join('; ');
}

/** Runs one chapter and returns the typed draft, never a partially valid one. */
export async function runCourseChapter(
  ctx: CourseRunContext,
  input: CoursePromptInput,
): Promise<Result<CourseChapterResult>> {
  const prompt = buildCoursePrompt(input);
  const created = await llm.session(
    { userId: ctx.userId, db: ctx.llmDb, requestId: ctx.requestId },
    {
      task: 'course',
      formationId: ctx.formationId,
      promptId: COURSE_PROMPT_ID,
      ...(ctx.scenario === undefined ? {} : { mock: { scenario: ctx.scenario } }),
    },
  );
  if (!created.ok) return err(mapped(created.error));
  const session = created.value;

  let correction: string | null = null;
  for (let attempt = 0; attempt <= COURSE_MAX_CORRECTIONS; attempt += 1) {
    const correctionMessage =
      correction === null
        ? null
        : `Correction: the previous answer violated the CourseChapterDraft contract (${correction}). Return one valid complete chapter now.`;
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

    let value: unknown;
    try {
      value = parseObject(generated.value.text);
    } catch {
      correction = 'the answer was not valid JSON';
      continue;
    }
    const parsed = CourseChapterDraftSchema.safeParse(replaceCoursePlaceholders(value, input));
    if (parsed.success) {
      return ok({
        draft: parsed.data,
        attempts: attempt + 1,
        promptId: prompt.id,
        promptVersion: prompt.version,
        model: session.resolved.modelId,
      });
    }
    correction = issueSummary(parsed.error);
  }

  return err(
    courseTaskFailed(new AppError('INVALID_OUTPUT', 'Sortie invalide après deux corrections.')),
  );
}

/** Kept for symmetry with the other runners and to make error mapping testable. */
export function courseRunFailed(error: AppError): AppError {
  return isAppError(error) ? mapped(error) : courseTaskFailed(error);
}

export { assertNever };
