// Anthropic request contract (SPEC-504 ET-4). One function builds the provider options used by the
// AI SDK, one builds the JSON body shown by the demo page and asserted by the MSW tests.
import type { JSONValue, ModelMessage, SystemModelMessage } from 'ai';
import { z } from 'zod';

import type { AiTask } from '@learny/config';
import { AppError } from '@learny/core';

import { TASK_CONFIG } from './tasks';
import type { DocumentRef, SystemPart } from './types';

/** Roles whose stable parts may enter the provider cache (ET-4). */
const MAX_CACHE_BREAKPOINTS = 4;
const CACHE_CONTROL = { type: 'ephemeral' } as const;

export interface AnthropicToolDefinition {
  description: string;
  inputSchema: z.ZodType;
}

export interface AnthropicRequestInput {
  task: AiTask;
  modelId: string;
  structured?: boolean;
  system?: readonly SystemPart[];
  tools?: Record<string, AnthropicToolDefinition>;
  documents?: readonly DocumentRef[];
  citations?: boolean;
  webSearch?: { maxUses: number };
}

export type AnthropicProviderOptions = {
  thinking: { type: 'adaptive' };
  effort: 'low' | 'medium' | 'high';
} & { [key: string]: JSONValue };

export interface AnthropicOptions {
  providerOptions: { anthropic: AnthropicProviderOptions };
}

/** ET-4 — adaptive thinking and effort per task, for the personal Anthropic key. */
export function buildAnthropicOptions(
  input: Pick<AnthropicRequestInput, 'task' | 'modelId'>,
): AnthropicOptions {
  const anthropic: AnthropicProviderOptions = {
    thinking: { type: 'adaptive' },
    effort: TASK_CONFIG[input.task].effort,
  };
  return { providerOptions: { anthropic } };
}

/**
 * ET-4 — cacheable system parts go first; only the last one carries `cache_control`, keeping the
 * request within the four-breakpoint limit.
 */
export function buildAnthropicSystem(
  parts: readonly SystemPart[] = [],
): SystemModelMessage[] | undefined {
  if (parts.length === 0) return undefined;
  const stable = parts.filter((part) => part.cache);
  const volatile = parts.filter((part) => !part.cache);
  const ordered = [...stable, ...volatile];
  const lastCacheIndex = stable.length - 1;
  return ordered.map((part, index) => ({
    role: 'system',
    content: part.text,
    ...(index === lastCacheIndex && lastCacheIndex >= 0
      ? { providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : {}),
  }));
}

/** CITATIONS_WITH_STRUCTURED_OUTPUT is raised before any provider call (ET-4). */
export function assertCitationsCompatible(input: {
  citations?: boolean | undefined;
  structured?: boolean | undefined;
}): void {
  if (input.citations === true && input.structured === true) {
    throw new AppError(
      'CITATIONS_WITH_STRUCTURED_OUTPUT',
      'Les citations ne peuvent pas être combinées avec une sortie structurée.',
    );
  }
}

export function documentMessage(documents: readonly DocumentRef[]): ModelMessage | undefined {
  if (documents.length === 0) return undefined;
  return {
    role: 'user',
    content: documents.map((document) => ({
      type: 'file' as const,
      data: { type: 'reference' as const, reference: { anthropic: document.fileId } },
      mediaType: document.mimeType ?? 'application/pdf',
      ...(document.title === undefined ? {} : { filename: document.title }),
      providerOptions: { anthropic: { citations: { enabled: true } } },
    })),
  };
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  return { ...json, additionalProperties: false };
}

/**
 * ET-4 — JSON of the request sent to `POST /v1/messages` (without key). The demo page shows it and
 * the contract tests assert it; `anthropicFetch` enforces the same invariants on the real body.
 */
export interface AnthropicRequestPreview {
  model: string;
  max_tokens: number;
  thinking: { type: 'adaptive' };
  output_config: { effort: string; format?: { type: 'json_schema'; schema: unknown } };
  tool_choice: { type: 'auto' };
  tools?: { name: string; description: string; input_schema: unknown; strict: true }[];
  system?: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: unknown[];
}

export function buildAnthropicRequestPreview(input: AnthropicRequestInput): AnthropicRequestPreview {
  assertCitationsCompatible({ citations: input.citations, structured: input.structured });
  if (input.structured === true && input.tools !== undefined) {
    throw new AppError(
      'CITATIONS_WITH_STRUCTURED_OUTPUT',
      'Une sortie structurée ne peut pas être combinée avec des outils.',
    );
  }
  const stable = (input.system ?? []).filter((part) => part.cache);
  const volatile = (input.system ?? []).filter((part) => !part.cache);
  const system = [...stable, ...volatile].map((part, index) => ({
    type: 'text' as const,
    text: part.text,
    ...(index === stable.length - 1 && stable.length > 0
      ? { cache_control: CACHE_CONTROL }
      : {}),
  }));
  const tools =
    input.tools === undefined
      ? undefined
      : Object.entries(input.tools).map(([name, definition]) => ({
          name,
          description: definition.description,
          input_schema: jsonSchemaOf(definition.inputSchema),
          strict: true as const,
        }));
  const doc = input.documents?.at(0);
  const messages =
    doc === undefined
      ? []
      : [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'file', file_id: doc.fileId },
                citations: { enabled: input.citations === true },
              },
            ],
          },
        ];
  return {
    model: input.modelId,
    max_tokens: TASK_CONFIG[input.task].maxOutputTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: TASK_CONFIG[input.task].effort,
      ...(input.structured === true
        ? {
            format: {
              type: 'json_schema' as const,
              schema: { type: 'object', additionalProperties: false },
            },
          }
        : {}),
    },
    tool_choice: { type: 'auto' },
    ...(tools === undefined ? {} : { tools }),
    ...(system.length === 0 ? {} : { system }),
    messages,
  };
}

/** One stable cache point per request at most on the system block (ET-4). */
export function countCacheBreakpoints(body: unknown): number {
  const text = JSON.stringify(body);
  return (text.match(/"cache_control"/g) ?? []).length;
}

export { MAX_CACHE_BREAKPOINTS };
