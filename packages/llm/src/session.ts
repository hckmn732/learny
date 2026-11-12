// Session of calls on one resolved model (SPEC-504 EF-3 to EF-5, ET-5).
// Resolution happens once; every `step`, `object` and `stream` produces exactly one `ai_calls` row.
// Tools are declared but never executed: the loop belongs to SPEC-508.
import {
  NoObjectGeneratedError,
  generateObject,
  generateText,
  streamObject,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';

import type { AiTask, LlmMode } from '@learny/config';
import {
  AppError,
  clock,
  err,
  ok,
  type Result,
} from '@learny/core';
import type { AiProviderValue, Db } from '@learny/db';

import {
  assertCitationsCompatible,
  buildAnthropicOptions,
  buildAnthropicSystem,
  documentMessage,
} from './anthropic-options';
import { anthropic } from '@ai-sdk/anthropic';
import { LEARNY_FALLBACK_HEADER, LEARNY_TASK_HEADER } from './anthropic-fetch';
import { llmMode } from './config';
import { mapProviderError, refused } from './errors';
import { logCall, zeroCost, type CallUsage, type CostCalculator } from './log';
import { createMockModel, type LearnMockModel } from './mock/mock-model';
import { selectFixture, stripMockMarkers } from './mock/select';
import type { FixtureFile } from './mock/fixture-schema';
import { createLanguageModel } from './providers/factory';
import { resolveModel, type ResolvedModel } from './resolve';
import { TASK_CONFIG, needsProviderStreaming } from './tasks';
import {
  emptyUsage,
  estimateTokens,
  type StepFinishReason,
  type StepInput,
  type StepOutput,
  type Usage,
} from './types';

export interface LlmContext {
  userId: string;
  db: Db;
  requestId?: string;
}

export interface CallEstimate {
  task: AiTask;
  inputTokens: number;
  maxOutputTokens: number;
  provider: AiProviderValue;
  modelId: string;
  managed: boolean;
}

export type BudgetGuard = (
  ctx: LlmContext,
  input: { resolved: ResolvedModel; estimate: CallEstimate },
) => Promise<Result<{ resolved: ResolvedModel }, AppError>>;

export interface SessionOptions {
  task: AiTask;
  formationId?: string | null;
  promptId: string;
  /** Explicit scenario of the simulated model (tests and demonstration page). */
  mock?: { scenario?: string };
  budgetGuard?: BudgetGuard;
  costCalculator?: CostCalculator;
  /** Key decrypted by SPEC-505 just before the session, kept in memory only. */
  secrets?: { apiKey?: string | null };
  /** Test seam; production uses LLM_MODE from the server environment. */
  mode?: LlmMode;
  /** Test seam for the fixture registry. */
  fixtures?: readonly { path: string; fixture: FixtureFile }[];
}

export type LlmStreamResult = ReturnType<typeof streamText>;

export interface LlmSession {
  resolved: ResolvedModel;
  step(input: StepInput): Promise<Result<StepOutput, AppError>>;
  object<S extends z.ZodTypeAny>(
    input: Omit<StepInput, 'tools'> & { schema: S },
  ): Promise<Result<z.infer<S>, AppError>>;
  stream(input: StepInput): Promise<Result<LlmStreamResult, AppError>>;
}

function providerOf(resolved: ResolvedModel): AiProviderValue {
  return resolved.provider;
}

function usageOf(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  inputTokenDetails?: {
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
  };
}): Usage {
  return {
    inputTokens: Math.max(0, usage.inputTokens ?? 0),
    outputTokens: Math.max(0, usage.outputTokens ?? 0),
    cacheReadTokens: Math.max(0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
    cacheWriteTokens: Math.max(0, usage.inputTokenDetails?.cacheWriteTokens ?? 0),
  };
}

function finishOf(finishReason: string, raw: string | undefined): StepFinishReason {
  if (finishReason === 'tool-calls') return 'tool-calls';
  if (finishReason === 'length') return 'length';
  if (raw === 'refusal' || finishReason === 'content-filter') return 'refusal';
  if (finishReason === 'error') return 'error';
  return 'stop';
}

function refusalFrom(finishReason: string, raw: string | undefined): boolean {
  return raw === 'refusal' || finishReason === 'content-filter';
}

function citationsOf(content: readonly unknown[]): StepOutput['citations'] {
  const citations: NonNullable<StepOutput['citations']> = [];
  for (const part of content) {
    if (part === null || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    const metadata = record.providerMetadata;
    if (metadata === null || typeof metadata !== 'object') continue;
    const anthropic = (metadata as Record<string, unknown>).anthropic;
    if (anthropic === null || typeof anthropic !== 'object') continue;
    const raw = (anthropic as { citations?: unknown }).citations;
    if (!Array.isArray(raw)) continue;
    for (const citation of raw) {
      if (citation === null || typeof citation !== 'object') continue;
      const item = citation as Record<string, unknown>;
      if (typeof item.cited_text !== 'string') continue;
      citations.push({
        citedText: item.cited_text,
        ...(typeof item.document_title === 'string' ? { documentTitle: item.document_title } : {}),
        ...(typeof item.document_index === 'number' ? { documentIndex: item.document_index } : {}),
      });
    }
  }
  return citations.length === 0 ? undefined : citations;
}

function promptText(input: StepInput): string {
  const system = input.system.map((part) => part.text).join('\n');
  return `${system}\n${JSON.stringify(input.messages)}\n${JSON.stringify(input.tools ?? {})}`;
}

function withTimeout(input: StepInput, timeoutMs: number): AbortSignal | undefined {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  const signal = controller.signal;
  if (input.abortSignal === undefined) return signal;
  return AbortSignal.any([input.abortSignal, signal]);
}

export async function createSession(
  ctx: LlmContext,
  opts: SessionOptions,
): Promise<Result<LlmSession, AppError>> {
  const resolvedResult = await resolveModel(ctx.db, { userId: ctx.userId, task: opts.task });
  if (!resolvedResult.ok) return resolvedResult;
  let current = resolvedResult.value;
  const mode = opts.mode ?? llmMode();
  const costCalculator = opts.costCalculator ?? zeroCost;
  const budgetGuard: BudgetGuard =
    opts.budgetGuard ?? ((_, input) => Promise.resolve(ok({ resolved: input.resolved })));
  const mockModels = new Map<string, LearnMockModel>();

  function languageModel(resolved: ResolvedModel): LanguageModel {
    return createLanguageModel(resolved, { apiKey: opts.secrets?.apiKey ?? null });
  }

  async function modelFor(estimate: CallEstimate): Promise<Result<ResolvedModel, AppError>> {
    const guarded = await budgetGuard(ctx, { resolved: current, estimate });
    if (!guarded.ok) return guarded;
    current = guarded.value.resolved;
    return ok(current);
  }

  async function persist(input: {
    resolved: ResolvedModel;
    usage: Usage;
    latencyMs: number;
    effectiveModel: string;
    status: 'ok' | 'error' | 'refused' | 'invalid_output';
    errorCode?: string | null;
  }): Promise<void> {
    await logCall(ctx.db, {
      userId: ctx.userId,
      formationId: opts.formationId ?? null,
      task: opts.task,
      provider: providerOf(input.resolved),
      model: input.effectiveModel,
      managed: input.resolved.kind === 'managed',
      usage: input.usage,
      latencyMs: input.latencyMs,
      status: input.status,
      errorCode: input.errorCode ?? null,
      costCalculator,
    });
  }

  function estimateFor(input: StepInput): CallEstimate {
    return {
      task: opts.task,
      inputTokens: estimateTokens(promptText(input)),
      maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
      provider: providerOf(current),
      modelId: current.modelId,
      managed: current.kind === 'managed',
    };
  }

  function mockFor(input: StepInput): Result<LearnMockModel, AppError> {
    const selected = selectFixture(
      {
        task: opts.task,
        promptId: opts.promptId,
        messages: input.messages,
        explicitScenario: opts.mock?.scenario,
      },
      opts.fixtures === undefined ? {} : { fixtures: opts.fixtures },
    );
    if (!selected.ok) return selected;
    const key = `${selected.value.task}/${selected.value.scenario}`;
    let mock = mockModels.get(key);
    if (mock === undefined) {
      mock = createMockModel(selected.value);
      mockModels.set(key, mock);
    }
    return ok(mock);
  }

  async function executeStep(
    resolved: ResolvedModel,
    input: StepInput,
  ): Promise<Result<StepOutput, AppError>> {
    assertCitationsCompatible({ citations: input.citations, structured: false });
    const started = clock.now();
    const system = buildAnthropicSystem(input.system);
    const tools = buildTools(input, resolved.provider);
    const isManaged = resolved.kind === 'managed';
    const providerOptions =
      resolved.provider === 'anthropic'
        ? buildAnthropicOptions({
            task: opts.task,
            modelId: resolved.modelId,
            managed: isManaged,
          }).providerOptions
        : undefined;
    const headers =
      resolved.provider === 'anthropic'
        ? {
            [LEARNY_TASK_HEADER]: opts.task,
            [LEARNY_FALLBACK_HEADER]: isManaged ? '1' : '0',
          }
        : undefined;
    const messages = outgoingMessages(mode, input, resolved.provider);
    const mock = mode === 'mock' ? mockOrThrow(mockFor(input)) : undefined;
    const currentModel = mock ?? languageModel(resolved);
    const abortSignal = withTimeout(input, TASK_CONFIG[opts.task].timeoutMs);
    try {
      let result;
      if (needsProviderStreaming(opts.task)) {
        const streamed = streamText({
          model: currentModel,
          ...(system === undefined ? {} : { system }),
          messages,
          ...(tools === undefined ? {} : { tools, toolChoice: 'auto' }),
          maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
          ...(abortSignal === undefined ? {} : { abortSignal }),
          ...(providerOptions === undefined ? {} : { providerOptions }),
          ...(headers === undefined ? {} : { headers }),
        });
        const text = await streamed.text;
        const usage = usageOf(await streamed.usage);
        const raw = (await streamed.finishReason) as string;
        const response = await streamed.response;
        result = {
          text,
          toolCalls: await streamed.toolCalls,
          finishReason: finishOf(raw, undefined),
          usage,
          responseMessages: response.messages,
          modelId: response.modelId ?? resolved.modelId,
          content: [] as unknown[],
          rawFinishReason: undefined as string | undefined,
        };
      } else {
        const generated = await generateText({
          model: currentModel,
          ...(system === undefined ? {} : { system }),
          messages,
          ...(tools === undefined ? {} : { tools, toolChoice: 'auto' }),
          maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
          ...(abortSignal === undefined ? {} : { abortSignal }),
          ...(providerOptions === undefined ? {} : { providerOptions }),
          ...(headers === undefined ? {} : { headers }),
        });
        result = {
          text: generated.text,
          toolCalls: generated.toolCalls,
          finishReason: finishOf(generated.finishReason, generated.rawFinishReason),
          usage: usageOf(generated.usage),
          responseMessages: generated.responseMessages,
          modelId: generated.response.modelId ?? resolved.modelId,
          content: generated.content,
          rawFinishReason: generated.rawFinishReason,
        };
      }

      const lastStep = mock?.lastStep();
      const usage = lastStep === undefined ? result.usage : { ...lastStep.usage };
      const latencyMs =
        lastStep?.latencyMs ?? Math.max(0, clock.now().getTime() - started.getTime());
      const refusedNow =
        result.finishReason === 'refusal' ||
        refusalFrom(result.finishReason, result.rawFinishReason);
      const citations = citationsOf(result.content);
      const output: StepOutput = {
        text: result.text,
        toolCalls: result.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
        })),
        finishReason: result.finishReason,
        usage,
        responseMessages: result.responseMessages,
        modelId: result.modelId,
        ...(citations === undefined ? {} : { citations }),
      };
      await persist({
        resolved,
        usage,
        latencyMs,
        effectiveModel: mode === 'mock' ? resolved.modelId : result.modelId,
        status: refusedNow ? 'refused' : 'ok',
        errorCode: refusedNow ? 'AI_REFUSED' : null,
      });
      if (refusedNow) return err(refused({ credentialId: credentialOf(resolved) }));
      return ok(output);
    } catch (error) {
      const mapped = mapProviderError(error, {
        modelId: resolved.modelId,
        ...(credentialOf(resolved) === undefined
          ? {}
          : { credentialId: credentialOf(resolved) }),
      });
      const usage = usageFromError(error);
      await persist({
        resolved,
        usage,
        latencyMs: Math.max(0, clock.now().getTime() - started.getTime()),
        effectiveModel: resolved.modelId,
        status:
          mapped.code === 'AI_REFUSED'
            ? 'refused'
            : mapped.code === 'INVALID_OUTPUT'
              ? 'invalid_output'
              : 'error',
        errorCode: mapped.code,
      });
      return err(mapped);
    }
  }

  async function executeObject<S extends z.ZodTypeAny>(
    resolved: ResolvedModel,
    input: Omit<StepInput, 'tools'> & { schema: S },
  ): Promise<Result<z.infer<S>, AppError>> {
    assertCitationsCompatible({ citations: input.citations, structured: true });
    const started = clock.now();
    const system = buildAnthropicSystem(input.system);
    const isManaged = resolved.kind === 'managed';
    const providerOptions =
      resolved.provider === 'anthropic'
        ? buildAnthropicOptions({
            task: opts.task,
            modelId: resolved.modelId,
            managed: isManaged,
          }).providerOptions
        : undefined;
    const headers =
      resolved.provider === 'anthropic'
        ? {
            [LEARNY_TASK_HEADER]: opts.task,
            [LEARNY_FALLBACK_HEADER]: isManaged ? '1' : '0',
          }
        : undefined;
    const messages = outgoingMessages(mode, input, resolved.provider);
    const mock = mode === 'mock' ? mockOrThrow(mockFor(input)) : undefined;
    const currentModel = mock ?? languageModel(resolved);
    const abortSignal = withTimeout(input, TASK_CONFIG[opts.task].timeoutMs);
    try {
      let object: unknown;
      let usage: Usage;
      let modelId = resolved.modelId;
      if (needsProviderStreaming(opts.task)) {
        const streamed = streamObject({
          model: currentModel,
          schema: input.schema,
          ...(system === undefined ? {} : { system }),
          messages,
          maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
          ...(abortSignal === undefined ? {} : { abortSignal }),
          ...(providerOptions === undefined ? {} : { providerOptions }),
          ...(headers === undefined ? {} : { headers }),
        });
        object = await streamed.object;
        usage = usageOf(await streamed.usage);
        modelId = (await streamed.response).modelId ?? modelId;
      } else {
        const generated = await generateObject({
          model: currentModel,
          schema: input.schema,
          ...(system === undefined ? {} : { system }),
          messages,
          maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
          ...(abortSignal === undefined ? {} : { abortSignal }),
          ...(providerOptions === undefined ? {} : { providerOptions }),
          ...(headers === undefined ? {} : { headers }),
        });
        object = generated.object;
        usage = usageOf(generated.usage);
        modelId = generated.response.modelId ?? modelId;
      }
      const lastStep = mock?.lastStep();
      const effectiveUsage = lastStep === undefined ? usage : { ...lastStep.usage };
      const latencyMs =
        lastStep?.latencyMs ?? Math.max(0, clock.now().getTime() - started.getTime());
      await persist({
        resolved,
        usage: effectiveUsage,
        latencyMs,
        effectiveModel: mode === 'mock' ? resolved.modelId : modelId,
        status: 'ok',
      });
      return ok(object as z.infer<S>);
    } catch (error) {
      const mapped = mapProviderError(error, {
        modelId: resolved.modelId,
        ...(credentialOf(resolved) === undefined ? {} : { credentialId: credentialOf(resolved) }),
      });
      const usage = usageFromError(error);
      await persist({
        resolved,
        usage,
        latencyMs: Math.max(0, clock.now().getTime() - started.getTime()),
        effectiveModel: resolved.modelId,
        status: mapped.code === 'AI_REFUSED' ? 'refused' : 'invalid_output',
        errorCode: mapped.code,
      });
      return err(mapped);
    }
  }

  const session: LlmSession = {
    get resolved() {
      return current;
    },
    async step(input) {
      const estimate = estimateFor(input);
      const guarded = await modelFor(estimate);
      if (!guarded.ok) return guarded;
      return executeStep(guarded.value, input);
    },
    async object(input) {
      const estimate = estimateFor(input);
      const guarded = await modelFor(estimate);
      if (!guarded.ok) return guarded;
      return executeObject(guarded.value, input);
    },
    async stream(input) {
      const estimate = estimateFor(input);
      const guarded = await modelFor(estimate);
      if (!guarded.ok) return guarded;
      const resolved = guarded.value;
      assertCitationsCompatible({ citations: input.citations, structured: false });
      const started = clock.now();
      const system = buildAnthropicSystem(input.system);
      const tools = buildTools(input, resolved.provider);
      const isManaged = resolved.kind === 'managed';
      const providerOptions =
        resolved.provider === 'anthropic'
          ? buildAnthropicOptions({
              task: opts.task,
              modelId: resolved.modelId,
              managed: isManaged,
            }).providerOptions
          : undefined;
      const headers =
        resolved.provider === 'anthropic'
          ? {
              [LEARNY_TASK_HEADER]: opts.task,
              [LEARNY_FALLBACK_HEADER]: isManaged ? '1' : '0',
            }
          : undefined;
      const mock = mode === 'mock' ? mockOrThrow(mockFor(input)) : undefined;
      const currentModel = mock ?? languageModel(resolved);
      const abortSignal = withTimeout(input, TASK_CONFIG[opts.task].timeoutMs);
      let logged = false;
      const result = streamText({
        model: currentModel,
        ...(system === undefined ? {} : { system }),
        messages: outgoingMessages(mode, input, resolved.provider),
        ...(tools === undefined ? {} : { tools, toolChoice: 'auto' }),
        maxOutputTokens: TASK_CONFIG[opts.task].maxOutputTokens,
        ...(abortSignal === undefined ? {} : { abortSignal }),
        ...(providerOptions === undefined ? {} : { providerOptions }),
        ...(headers === undefined ? {} : { headers }),
        onFinish: (event) => {
          if (logged) return;
          logged = true;
          const usage = usageOf(event.usage);
          void persist({
            resolved,
            usage,
            latencyMs: Math.max(0, clock.now().getTime() - started.getTime()),
            effectiveModel:
              mode === 'mock' ? resolved.modelId : (event.response.modelId ?? resolved.modelId),
            status: refusalFrom(event.finishReason, undefined) ? 'refused' : 'ok',
            errorCode: refusalFrom(event.finishReason, undefined) ? 'AI_REFUSED' : null,
          });
        },
        onError: (event) => {
          if (logged) return;
          logged = true;
          const mapped = mapProviderError(event.error, {
            modelId: resolved.modelId,
            ...(credentialOf(resolved) === undefined
              ? {}
              : { credentialId: credentialOf(resolved) }),
          });
          void persist({
            resolved,
            usage: emptyUsage(),
            latencyMs: Math.max(0, clock.now().getTime() - started.getTime()),
            effectiveModel: resolved.modelId,
            status: mapped.code === 'AI_REFUSED' ? 'refused' : 'error',
            errorCode: mapped.code,
          });
        },
      });
      return ok(result);
    },
  };
  return ok(session);
}

function credentialOf(resolved: ResolvedModel): string | undefined {
  return resolved.kind === 'byok' ? resolved.credentialId : undefined;
}

/** Marker stripping is a mock-only behaviour; a live provider receives the text untouched. */
export function outgoingMessages(
  mode: LlmMode,
  input: StepInput,
  provider: AiProviderValue,
): ModelMessage[] {
  // CL-10: a non-Anthropic personal model receives text only; citations are ignored.
  const documents =
    provider === 'anthropic' ? documentMessage(input.documents ?? []) : undefined;
  const base = mode === 'mock' ? stripMockMarkers(input.messages) : [...input.messages];
  return documents === undefined ? base : [documents, ...base];
}

function buildTools(input: StepInput, provider: AiProviderValue): ToolSet | undefined {
  if (input.tools === undefined && input.webSearch === undefined) return undefined;
  const tools: ToolSet = {};
  for (const [name, definition] of Object.entries(input.tools ?? {})) {
    tools[name] = tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      strict: true,
    });
  }
  if (input.webSearch !== undefined && provider === 'anthropic') {
    // Provider-defined tool of Anthropic; declared strictly like the others (ET-4, SPEC-512).
    tools.web_search = anthropic.tools.webSearch_20260209({ maxUses: input.webSearch.maxUses });
  }
  return tools;
}

function mockOrThrow(result: Result<LearnMockModel, AppError>): LearnMockModel {
  if (!result.ok) throw result.error;
  return result.value;
}

function usageFromError(error: unknown): CallUsage {
  if (NoObjectGeneratedError.isInstance(error) && error.usage !== undefined) {
    return usageOf(error.usage);
  }
  return emptyUsage();
}

