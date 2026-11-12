// Deterministic simulated model (SPEC-504 ET-6, ADR-0153). Each call consumes the next step of the
// selected fixture; no network, no clock, no random value. `doStream` replays `chunks`.
import { APICallError } from 'ai';
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

import { AppError } from '@learny/core';

import type { FixtureFile, FixtureStep } from './fixture-schema';

const MOCK_PROVIDER = 'learny-mock';

type V4Usage = {
  inputTokens: {
    total: number;
    noCache: number;
    cacheRead: number;
    cacheWrite: number;
  };
  outputTokens: { total: number; text: number; reasoning: number };
};

type V4FinishReason = {
  unified: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
  raw: string | undefined;
};

function usageOf(step: FixtureStep): V4Usage {
  return {
    inputTokens: {
      total: step.usage.inputTokens,
      noCache: Math.max(0, step.usage.inputTokens - step.usage.cacheReadTokens),
      cacheRead: step.usage.cacheReadTokens,
      cacheWrite: step.usage.cacheWriteTokens,
    },
    outputTokens: {
      total: step.usage.outputTokens,
      text: step.usage.outputTokens,
      reasoning: 0,
    },
  };
}

function finishOf(step: FixtureStep): V4FinishReason {
  if (step.type === 'tool-calls') return { unified: 'tool-calls', raw: 'tool_use' };
  if (step.type === 'error' && step.error.kind === 'refusal') {
    return { unified: 'content-filter', raw: 'refusal' };
  }
  if (step.type === 'text' && step.finishReason === 'refusal') {
    return { unified: 'content-filter', raw: 'refusal' };
  }
  if (step.type === 'text' && step.finishReason === 'length') {
    return { unified: 'length', raw: 'max_tokens' };
  }
  return { unified: 'stop', raw: 'end_turn' };
}

function stripMarkers(text: string): string {
  return text.replaceAll(/\[\[mock:[a-z0-9]+(?:-[a-z0-9]+)*\]\]/g, '');
}

function apiError(kind: string, message: string): APICallError {
  const base = {
    url: 'https://provider.invalid/v1/messages',
    requestBodyValues: {},
    isRetryable: false,
  };
  switch (kind) {
    case 'rate_limit':
      return new APICallError({ ...base, message, statusCode: 429, isRetryable: true });
    case 'timeout':
      return new APICallError({ ...base, message, statusCode: 408 });
    case 'auth':
      return new APICallError({ ...base, message, statusCode: 401 });
    case 'context_length':
      return new APICallError({
        ...base,
        message: 'prompt is too long: 300000 tokens > 200000 maximum',
        statusCode: 400,
      });
    case 'overloaded':
      return new APICallError({ ...base, message, statusCode: 529 });
    default:
      return new APICallError({ ...base, message, statusCode: 500 });
  }
}

export interface MockModelOptions {
  /** First step to consume, for a test that starts in the middle of a fixture. */
  startIndex?: number;
}

/**
 * A `MockLanguageModelV4` that exposes the step it just returned, so the session can journal the
 * fixture usage and latency instead of a measured value (EF-4).
 */
export class LearnMockModel extends MockLanguageModelV4 {
  private index: number;
  private last: FixtureStep | undefined;

  constructor(
    readonly fixture: FixtureFile,
    options: MockModelOptions = {},
  ) {
    const state = { index: options.startIndex ?? 0, last: undefined as FixtureStep | undefined };
    super({
      provider: MOCK_PROVIDER,
      modelId: `mock-${fixture.task}`,
      doGenerate: () => {
        state.last = this.consume(state);
        return Promise.resolve(this.generateResult(state.last));
      },
      doStream: () => {
        state.last = this.consume(state);
        return Promise.resolve(this.streamResult(state.last));
      },
    });
    this.index = state.index;
    this.last = state.last;
  }

  stepIndex(): number {
    return this.index;
  }

  lastStep(): FixtureStep | undefined {
    return this.last;
  }

  /**
   * Constructor closures receive a private state so `super()` does not read fields before they are
   * initialised; this method is called only after construction.
   */
  private consume(state: { index: number; last: FixtureStep | undefined }): FixtureStep {
    const step = this.fixture.steps[state.index];
    if (step === undefined) {
      throw new AppError(
        'MOCK_STEPS_EXHAUSTED',
        `La fixture ${this.fixture.task}/${this.fixture.scenario} n’a plus d’étape (${this.fixture.steps.length} consommée(s)).`,
      );
    }
    // A provider error is retried by the AI SDK (429: two retries); the same step is served until
    // a non-error outcome is produced, so the fixture describes the failure, not each attempt.
    if (step.type !== 'error' || step.error.kind === 'refusal') {
      state.index += 1;
      this.index = state.index;
    }
    this.last = step;
    return step;
  }

  private generateResult(step: FixtureStep): LanguageModelV4GenerateResult {
    if (step.type === 'error' && step.error.kind !== 'refusal') {
      throw apiError(step.error.kind, step.error.message);
    }
    if (step.type === 'tool-calls') {
      return {
        content: step.toolCalls.map((call) => ({
          type: 'tool-call',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: JSON.stringify(call.input),
        })),
        finishReason: finishOf(step),
        usage: usageOf(step),
        warnings: [],
      };
    }
    const text =
      step.type === 'text'
        ? stripMarkers(step.text)
        : step.type === 'object'
          ? JSON.stringify(step.object)
          : step.type === 'stream'
            ? stripMarkers(step.chunks.join(''))
            : '';
    return {
      content: text === '' ? [] : [{ type: 'text', text }],
      finishReason: finishOf(step),
      usage: usageOf(step),
      warnings: [],
    };
  }

  private streamResult(step: FixtureStep): LanguageModelV4StreamResult {
    if (step.type === 'error' && step.error.kind !== 'refusal') {
      throw apiError(step.error.kind, step.error.message);
    }
    const chunks: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
    if (step.type === 'tool-calls') {
      for (const call of step.toolCalls) {
        chunks.push(
          { type: 'tool-input-start', id: call.toolCallId, toolName: call.toolName },
          {
            type: 'tool-input-delta',
            id: call.toolCallId,
            delta: JSON.stringify(call.input),
          },
          { type: 'tool-input-end', id: call.toolCallId },
          {
            type: 'tool-call',
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: JSON.stringify(call.input),
          },
        );
      }
    } else if (step.type === 'text' || step.type === 'stream') {
      const text = stripMarkers(step.type === 'text' ? step.text : step.chunks.join(''));
      chunks.push({ type: 'text-start', id: 'mock-text' });
      if (step.type === 'stream') {
        for (const chunk of step.chunks) {
          chunks.push({ type: 'text-delta', id: 'mock-text', delta: stripMarkers(chunk) });
        }
      } else {
        chunks.push({ type: 'text-delta', id: 'mock-text', delta: text });
      }
      chunks.push({ type: 'text-end', id: 'mock-text' });
    } else if (step.type === 'object') {
      chunks.push(
        { type: 'text-start', id: 'mock-text' },
        { type: 'text-delta', id: 'mock-text', delta: JSON.stringify(step.object) },
        { type: 'text-end', id: 'mock-text' },
      );
    }
    chunks.push({ type: 'finish', finishReason: finishOf(step), usage: usageOf(step) });
    return { stream: convertArrayToReadableStream(chunks) };
  }
}

/** ET-6 — builds the AI SDK mock model for one fixture. */
export function createMockModel(
  fixture: FixtureFile,
  options: MockModelOptions = {},
): LearnMockModel {
  return new LearnMockModel(fixture, options);
}
