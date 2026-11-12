// Public value types of @learny/llm (SPEC-504 ET-5).
import type { ModelMessage } from 'ai';
import type { z } from 'zod';

export interface SystemPart {
  text: string;
  /** Stable context eligible for the Anthropic prompt cache (ET-4). */
  cache: boolean;
}

export interface DocumentRef {
  /** Identifier returned by the Anthropic Files API (ET-8). */
  fileId: string;
  title?: string | undefined;
  mimeType?: string | undefined;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CitationPart {
  citedText: string;
  documentTitle?: string | undefined;
  documentIndex?: number | undefined;
}

export interface StepInput {
  system: SystemPart[];
  messages: ModelMessage[];
  /** Declared tools; SPEC-504 never executes them (the loop belongs to SPEC-508). */
  tools?: Record<string, { description: string; inputSchema: z.ZodTypeAny }>;
  /** Anthropic documents (ET-4, ET-8); ignored by other providers (CL-10). */
  documents?: DocumentRef[];
  citations?: boolean;
  /** Provider-side web search, programme task only (ET-4, SPEC-512). */
  webSearch?: { maxUses: number };
  abortSignal?: AbortSignal;
}

export interface ToolCallOutput {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export type StepFinishReason = 'stop' | 'tool-calls' | 'length' | 'refusal' | 'error';

export interface StepOutput {
  text: string;
  toolCalls: ToolCallOutput[];
  finishReason: StepFinishReason;
  usage: Usage;
  responseMessages: ModelMessage[];
  modelId: string;
  citations?: CitationPart[];
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

/** Rough token estimate of ET-3 / docs/architecture/ai.md §6: four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
