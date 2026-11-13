import {
  TUTOR_MAX_CORRECTIONS,
  TUTOR_MAX_TURNS,
  TutorInputSchema,
  TutorRunResultSchema,
  type TutorInput,
  type TutorRunResult,
  type TutorRunStatus,
  type TutorTask,
  type TutorToolCall,
} from '@learny/contracts';
import { AppError, err, isAppError, ok, type Result } from '@learny/core';
import { llm, emptyUsage, type StepInput, type StepOutput } from '@learny/llm';

import { buildTutorPrompt, type TutorContext, type TutorLlmSession } from './context';
import {
  TUTOR_TOOLS,
  createDbNotifier,
  createDbToolRuntime,
  toolDefinitions,
  type TutorToolRuntime,
} from './tools/index';
import { CreateOrUpdateInput } from './tools/schemas';
import type { ToolScope, TutorTool } from './tools/types';

// Deterministic agent loop of SPEC-508 (docs/architecture/ai.md §4). One call to `step` per turn;
// validation, guard and execution of a tool call share one user transaction; the loop stops at the
// end of the turn, after twelve turns, or after the correction budget of a brick is exhausted.

export interface RunTutorRequest {
  task: TutorTask;
  input: TutorInput;
  ctx: TutorContext;
}

interface ToolFailure {
  code: string;
  message: string;
  issues?: { code?: string; path: string; message: string }[];
}

interface ToolOutcome {
  status: 'executed' | 'guard_refused' | 'invalid_input' | 'failed';
  output?: unknown;
  error?: ToolFailure;
}

function addUsage(total: ReturnType<typeof emptyUsage>, step: StepOutput): void {
  total.inputTokens += step.usage.inputTokens;
  total.outputTokens += step.usage.outputTokens;
  total.cacheReadTokens += step.usage.cacheReadTokens;
  total.cacheWriteTokens += step.usage.cacheWriteTokens;
}

function safeFailure(error: unknown): ToolFailure {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.detail,
      ...(error.errors === undefined
        ? {}
        : {
            issues: error.errors.map((issue) => ({
              ...(issue.code === undefined ? {} : { code: issue.code }),
              path: issue.path,
              message: issue.message,
            })),
          }),
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' };
}

function jsonValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  }
}

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  outcome: ToolOutcome,
): StepInput['messages'][number] {
  const value =
    outcome.status === 'executed'
      ? { ok: true, result: outcome.output }
      : { ok: false, error: outcome.error ?? { code: 'INTERNAL_ERROR' } };
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: { type: 'json', value: JSON.parse(jsonValue(value)) as never },
      },
    ],
  };
}

function brickKeyOf(input: unknown): string | null {
  const parsed = CreateOrUpdateInput.safeParse(input);
  if (!parsed.success) return null;
  if (parsed.data.data.kind !== 'brick') return null;
  const draft = parsed.data.data.draft;
  return [
    parsed.data.action,
    parsed.data.targetId ?? 'new',
    draft.type,
    draft.purpose,
    [...draft.notionIds].sort().join(','),
  ].join(':');
}

async function withRuntime<T>(
  ctx: TutorContext,
  fn: (runtime: TutorToolRuntime) => Promise<T>,
): Promise<T> {
  if (ctx.runtime !== undefined) return fn(ctx.runtime);
  if (ctx.db === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Client de base de données manquant pour cette tâche.');
  }
  return ctx.db.run((tx) =>
    fn(
      createDbToolRuntime(tx, {
        ...(ctx.webSearch === undefined ? {} : { webSearch: ctx.webSearch }),
        ...(ctx.questionBank === undefined ? {} : { questionBank: ctx.questionBank }),
      }),
    ),
  );
}

async function callTool(
  tool: TutorTool,
  rawInput: unknown,
  scope: ToolScope,
  ctx: TutorContext,
): Promise<ToolOutcome> {
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: 'invalid_input',
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Les paramètres de l’action sont invalides.',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.length === 0 ? '(racine)' : issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }
  try {
    return await withRuntime(ctx, async (runtime) => {
      const toolCtx = { ...scope, runtime };
      const decision = await tool.guard(toolCtx, parsed.data);
      if (!decision.ok) {
        return {
          status: 'guard_refused',
          error: { code: decision.code, message: decision.message },
        };
      }
      try {
        const output = await tool.execute(toolCtx, parsed.data);
        const validated = tool.outputSchema.safeParse(output);
        if (!validated.success) {
          return {
            status: 'failed',
            error: {
              code: 'INVALID_OUTPUT',
              message: 'La sortie de l’action est invalide.',
              issues: validated.error.issues.map((issue) => ({
                code: issue.code,
                path: issue.path.length === 0 ? '(racine)' : issue.path.join('.'),
                message: issue.message,
              })),
            },
          };
        }
        return { status: 'executed', output: validated.data };
      } catch (error) {
        return { status: 'failed', error: safeFailure(error) };
      }
    });
  } catch (error) {
    return { status: 'failed', error: safeFailure(error) };
  }
}

async function notifyInvalidOutput(
  ctx: TutorContext,
  scope: ToolScope,
  task: TutorTask,
  brickKey: string,
): Promise<boolean> {
  const notice = {
    task,
    formationId: ctx.formationId,
    tone: ctx.profile.tone,
    brickKey,
  };
  try {
    if (ctx.notifier !== undefined) {
      await ctx.notifier.notifyInvalidOutput(scope, notice);
      return true;
    }
    if (ctx.db !== undefined) {
      await createDbNotifier(ctx.db).notifyInvalidOutput(scope, notice);
      return true;
    }
  } catch (error) {
    ctx.logger?.error('tutor.notification.failed', { operation: 'tutor.notify' }, error);
    return false;
  }
  return false;
}

function promptLogFields(status: TutorRunStatus): {
  operation: 'tutor.run';
  status: string;
  attempt: number;
} {
  return { operation: 'tutor.run', status, attempt: 1 };
}

/**
 * ET-2 — runs the tutor loop. A session is created through `@learny/llm` unless the caller injects
 * one (unit tests and demonstration). A provider/session failure is returned as is; a controlled
 * stop (correction budget, twelve turns) is a typed result so the caller can show it.
 */
export async function runTutor(
  request: RunTutorRequest,
): Promise<Result<TutorRunResult>> {
  const { task, input, ctx } = request;
  const parsedInput = TutorInputSchema.parse(input);
  const prompt = buildTutorPrompt(task, parsedInput, ctx.profile);
  let session: TutorLlmSession;
  if (ctx.session !== undefined) {
    session = ctx.session;
  } else {
    if (ctx.llmDb === undefined) {
      return err(
        new AppError('INTERNAL_ERROR', 'Client de journalisation IA manquant pour cette tâche.'),
      );
    }
    const created = await llm.session(
      { userId: ctx.userId, db: ctx.llmDb, requestId: ctx.requestId },
      {
        task,
        formationId: ctx.formationId,
        promptId: prompt.id,
        ...(ctx.mock === undefined ? {} : { mock: ctx.mock }),
      },
    );
    if (!created.ok) return created;
    session = created.value;
  }

  const tools = ctx.tools ?? TUTOR_TOOLS;
  const definitions = toolDefinitions();
  const scope: ToolScope = {
    userId: ctx.userId,
    formationId: ctx.formationId,
    profile: ctx.profile,
    task,
    now: ctx.clock.now(),
    newId: ctx.newId ?? (() => crypto.randomUUID()),
  };
  const maxTurns = Math.min(ctx.maxTurns ?? TUTOR_MAX_TURNS, TUTOR_MAX_TURNS);
  const usage = emptyUsage();
  const trace: TutorToolCall[] = [];
  const correctionErrors = new Map<string, number>();
  let messages = prompt.messages;
  let text = '';
  let finishReason = 'stop';
  let stop: TutorRunStatus | null = null;
  let consecutiveValidationErrors = 0;
  let turnsUsed = 0;
  let model = session.resolved?.modelId ?? null;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    turnsUsed = turn;
    const step = await session.step({
      system: prompt.system,
      messages,
      tools: definitions,
    });
    if (!step.ok) {
      ctx.logger?.warn('tutor.step.failed', promptLogFields('refused'), step.error);
      return err(step.error);
    }
    addUsage(usage, step.value);
    model = session.resolved?.modelId ?? (step.value.modelId || model);
    finishReason = step.value.finishReason;
    messages = [...messages, ...step.value.responseMessages];
    if (step.value.finishReason === 'refusal') {
      text = step.value.text;
      stop = 'refused';
      break;
    }
    if (step.value.toolCalls.length === 0) {
      text = step.value.text;
      stop = 'completed';
      break;
    }

    let invalidNow = false;
    for (const call of step.value.toolCalls) {
      const tool = tools.find((candidate) => candidate.name === call.toolName);
      if (tool === undefined) {
        // CL-1 — an unknown name is refused before any runtime access or write.
        const failure: ToolFailure = {
          code: 'TOOL_UNKNOWN',
          message: 'Cette action n’existe pas dans le registre du tuteur.',
        };
        trace.push({
          turn,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          status: 'unknown_tool',
          error: failure,
        });
        messages.push(toolResultMessage(call.toolCallId, call.toolName, {
          status: 'failed',
          error: failure,
        }));
        consecutiveValidationErrors += 1;
        if (consecutiveValidationErrors >= 2) {
          stop = 'invalid_output';
          invalidNow = true;
          break;
        }
        continue;
      }

      const outcome = await callTool(tool, call.input, scope, ctx);
      trace.push({
        turn,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        status: outcome.status,
        ...(outcome.output === undefined ? {} : { output: outcome.output }),
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
      });
      messages.push(toolResultMessage(call.toolCallId, call.toolName, outcome));

      if (outcome.status === 'executed') {
        consecutiveValidationErrors = 0;
        continue;
      }

      const brickKey = tool.name === 'create_or_update' ? brickKeyOf(call.input) : null;
      if (brickKey !== null && outcome.error?.code === 'BRICK_INVALID') {
        const errors = (correctionErrors.get(brickKey) ?? 0) + 1;
        correctionErrors.set(brickKey, errors);
        if (errors > TUTOR_MAX_CORRECTIONS) {
          stop = 'invalid_output';
          invalidNow = true;
          break;
        }
        continue;
      }
      consecutiveValidationErrors += 1;
      if (consecutiveValidationErrors >= 2) {
        stop = 'invalid_output';
        invalidNow = true;
        break;
      }
    }
    if (invalidNow) break;
  }

  if (stop === null) stop = 'turns_exhausted';

  const corrections = [...correctionErrors.entries()].map(([brickKey, errors]) => ({
    brickKey,
    errors,
    corrections: Math.min(errors, TUTOR_MAX_CORRECTIONS),
  }));
  const lastBrickKey = corrections.at(-1)?.brickKey ?? 'unknown';
  let notified = false;
  if (stop === 'invalid_output') {
    notified = await notifyInvalidOutput(ctx, scope, task, lastBrickKey);
  }

  const result: TutorRunResult = TutorRunResultSchema.parse({
    status: stop,
    task,
    text,
    turns: turnsUsed,
    toolCalls: trace,
    corrections,
    usage,
    model,
    prompt: {
      id: prompt.id,
      version: prompt.version,
      tone: ctx.profile.tone,
      courseLanguage: ctx.profile.courseLanguage,
    },
    notification: notified
      ? { type: 'ai_task_failed', reason: 'INVALID_OUTPUT' }
      : null,
    modelChoiceRequired: stop === 'invalid_output',
    fallback: 'none',
    finishReason,
  });
  ctx.logger?.info('tutor.run', promptLogFields(stop));
  return ok(result);
}
