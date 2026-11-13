// Public API of @learny/llm (SPEC-504). This is the only package allowed to import an AI provider
// SDK (ET-9, BR-IA-09); learning-engine and bricks must not depend on it.
export { resolveModel } from './resolve';
export type { ManagedModelId, ResolvedModel, ResolveInput } from './resolve';
export {
  defaultModelForTask,
  needsProviderStreaming,
  TASK_CONFIG,
  TASK_CAPABILITIES,
} from './tasks';
export type { TaskCapability, TaskConfig } from './tasks';
export {
  buildAnthropicOptions,
  buildAnthropicRequestPreview,
  buildAnthropicSystem,
  isFallbackEnabled,
  countCacheBreakpoints,
  FALLBACK_BETA,
} from './anthropic-options';
export type {
  AnthropicOptions,
  AnthropicRequestInput,
  AnthropicRequestPreview,
} from './anthropic-options';
export { anthropicFetch, createAnthropicFetch, rewriteAnthropicInit } from './anthropic-fetch';
export { PROVIDER_CATALOG, providerRegion, providerSupports } from './providers/catalog';
export type { ProviderCapabilities, ProviderCatalogEntry } from './providers/catalog';
export { createLanguageModel } from './providers/factory';
export type { ProviderSecrets } from './providers/factory';
export { createSession, outgoingMessages } from './session';
export type {
  BudgetGuard,
  CallEstimate,
  LlmContext,
  LlmSession,
  LlmStreamResult,
  SessionOptions,
} from './session';
export { aiUnavailable, invalidOutput, mapProviderError, refused } from './errors';
export type { AiErrorContext } from './errors';
export { logCall, zeroCost } from './log';
export type { CallUsage, CostCalculator, CostInput, LogCallInput } from './log';
export { mockFileId, uploadDocument } from './files';
export { createMockModel, LearnMockModel } from './mock/mock-model';
export { selectFixture, canonicalJson, markerScenario, stripMockMarkers } from './mock/select';
export type { SelectFixtureInput, SelectFixtureOptions } from './mock/select';
export { FIXTURE_FILE_SCHEMA, parseFixture, MOCK_ERROR_KINDS } from './mock/fixture-schema';
export type { FixtureFile, FixtureStep, MockErrorKind } from './mock/fixture-schema';
export { FIXTURE_REGISTRY, fixturesForTask } from './mock/fixture-registry';
export type { RegisteredFixture } from './mock/fixture-registry';
export type {
  CitationPart,
  DocumentRef,
  StepFinishReason,
  StepInput,
  StepOutput,
  SystemPart,
  ToolCallOutput,
  Usage,
} from './types';
export { emptyUsage, estimateTokens } from './types';

import { resolveModel } from './resolve';
import { createSession, type LlmSession } from './session';

/** ET-5 — the two entry points every consumer uses. */
export const llm = { session: createSession, resolveModel } satisfies {
  session: typeof createSession;
  resolveModel: typeof resolveModel;
};

export type { LlmSession as Session };
