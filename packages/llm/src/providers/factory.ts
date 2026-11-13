// AI SDK provider factory (SPEC-504 ET-3, ET-9). No provider SDK is imported outside this package.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import { AppError, ok, type Result } from '@learny/core';
import type { AiProviderValue, Db } from '@learny/db';

import { anthropicFetch } from '../anthropic-fetch';
import { anthropicApiKey } from '../config';
import { decryptCredentialKey } from '../credentials/read';
import type { ResolvedModel } from '../resolve';

export interface ProviderSecrets {
  /**
   * Personal key, decrypted by SPEC-505 immediately before the call. Never logged, never returned.
   * The provided AI reads its key from the server environment instead.
   */
  apiKey: string | null;
}

/**
 * Resolves the key of one call. An explicitly supplied secret wins (tests and callers holding a
 * short-lived key); otherwise a BYOK model is decrypted from its row under the owner's scope.
 * This function stays internal to @learny/llm: it is never re-exported by the package entry point.
 */
export async function providerSecrets(
  db: Db,
  userId: string,
  resolved: ResolvedModel,
  explicitApiKey: string | null = null,
): Promise<Result<ProviderSecrets>> {
  if (explicitApiKey !== null) return ok({ apiKey: explicitApiKey });
  if (resolved.kind === 'managed') return ok({ apiKey: null });
  const decrypted = await decryptCredentialKey(db, {
    userId,
    credentialId: resolved.credentialId,
  });
  if (!decrypted.ok) return decrypted;
  return ok({ apiKey: decrypted.value });
}

function missingKey(provider: AiProviderValue): AppError {
  return new AppError('AI_KEY_INVALID', `Aucune clé utilisable pour le fournisseur ${provider}.`);
}

function incompatible(provider: AiProviderValue, detail: string): AppError {
  return new AppError('AI_PROVIDER_ERROR', `Fournisseur ${provider} mal configuré : ${detail}`);
}

function compatibleBaseUrl(resolved: Extract<ResolvedModel, { kind: 'byok' }>): string {
  if (resolved.baseUrl === null || resolved.baseUrl.trim() === '') {
    throw incompatible(resolved.provider, 'adresse de service absente');
  }
  return resolved.baseUrl;
}

/** ET-3 — one AI SDK language model for a resolved call. */
export function createLanguageModel(
  resolved: ResolvedModel,
  secrets: ProviderSecrets,
): LanguageModel {
  if (resolved.kind === 'managed') {
    const apiKey = anthropicApiKey() ?? secrets.apiKey;
    if (apiKey === null) throw missingKey('anthropic');
    return createAnthropic({ apiKey, fetch: anthropicFetch })(resolved.modelId);
  }

  const { provider, modelId } = resolved;
  switch (provider) {
    case 'anthropic': {
      if (secrets.apiKey === null) throw missingKey(provider);
      return createAnthropic({ apiKey: secrets.apiKey, fetch: anthropicFetch })(modelId);
    }
    case 'openai': {
      if (secrets.apiKey === null) throw missingKey(provider);
      return createOpenAI({
        apiKey: secrets.apiKey,
        ...(resolved.baseUrl === null ? {} : { baseURL: resolved.baseUrl }),
      })(modelId);
    }
    case 'mistral': {
      if (secrets.apiKey === null) throw missingKey(provider);
      return createMistral({
        apiKey: secrets.apiKey,
        ...(resolved.baseUrl === null ? {} : { baseURL: resolved.baseUrl }),
      })(modelId);
    }
    case 'deepseek': {
      if (secrets.apiKey === null) throw missingKey(provider);
      return createDeepSeek({
        apiKey: secrets.apiKey,
        ...(resolved.baseUrl === null ? {} : { baseURL: resolved.baseUrl }),
      })(modelId);
    }
    case 'openai_compatible': {
      if (secrets.apiKey === null) throw missingKey(provider);
      return createOpenAICompatible({
        name: 'learny-byok',
        baseURL: compatibleBaseUrl(resolved),
        apiKey: secrets.apiKey,
      })(modelId);
    }
    case 'local': {
      return createOpenAICompatible({
        name: 'learny-local',
        baseURL: compatibleBaseUrl(resolved),
        apiKey: secrets.apiKey ?? 'not-needed',
      })(modelId);
    }
  }
}
