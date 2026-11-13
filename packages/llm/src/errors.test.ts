import { APICallError, TypeValidationError } from 'ai';
import { describe, expect, it } from 'vitest';

import { aiUnavailable, mapProviderError } from './errors';

function apiError(statusCode: number, responseBody?: string, message = 'failure'): APICallError {
  return new APICallError({
    message,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: { requestSample: 'test-placeholder-never-logged' },
    statusCode,
    ...(responseBody === undefined ? {} : { responseBody }),
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

describe('[SPEC-504] conversion des erreurs', () => {
  it('CA-3 — 401/403 → AI_KEY_INVALID avec la clé personnelle', () => {
    for (const status of [401, 403]) {
      const mapped = mapProviderError(apiError(status), { credentialId: 'cred-1' });
      expect(mapped.code).toBe('AI_KEY_INVALID');
      expect(mapped.credentialId).toBe('cred-1');
      expect(mapped.detail).not.toContain('sk-ant-never-logged');
    }
  });

  it('CA-3 — 429 → AI_RATE_LIMITED, 5xx/529 → AI_PROVIDER_ERROR', () => {
    expect(mapProviderError(apiError(429)).code).toBe('AI_RATE_LIMITED');
    expect(mapProviderError(apiError(500)).code).toBe('AI_PROVIDER_ERROR');
    expect(mapProviderError(apiError(529)).code).toBe('AI_PROVIDER_ERROR');
    expect(mapProviderError(new TypeError('fetch failed')).code).toBe('AI_PROVIDER_ERROR');
  });

  it('CA-3 — délai et contexte trop long ont leurs codes dédiés', () => {
    expect(mapProviderError(apiError(408)).code).toBe('AI_TIMEOUT');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(mapProviderError(abort).code).toBe('AI_TIMEOUT');
    expect(
      mapProviderError(apiError(400, 'prompt is too long: 300000 tokens > 200000 maximum')).code,
    ).toBe('AI_CONTEXT_TOO_LONG');
  });

  it('CA-3 — sortie structurée non conforme → INVALID_OUTPUT avec les erreurs Zod', () => {
    const validation = TypeValidationError.wrap({
      value: { title: 42 },
      cause: {
        issues: [{ path: ['title'], message: 'Expected string, received number' }],
      },
    });
    const mapped = mapProviderError(validation);
    expect(mapped.code).toBe('INVALID_OUTPUT');
    expect(mapped.errors).toEqual([{ path: 'title', message: 'Expected string, received number' }]);
  });

  it('EF-2 — AI_UNAVAILABLE porte la raison et le lien des paramètres', () => {
    const missing = aiUnavailable('no_subscription_no_key');
    expect(missing.code).toBe('AI_UNAVAILABLE');
    expect(missing.status).toBe(422);
    expect(missing.reason).toBe('no_subscription_no_key');
    expect(missing.link).toBe('/parametres#modeles');
    expect(missing.detail).toContain('Abonnez-vous à l’IA fournie');
    const unqualified = aiUnavailable('credential_not_qualified', { credentialId: 'cred-2' });
    expect(unqualified.reason).toBe('credential_not_qualified');
    expect(unqualified.credentialId).toBe('cred-2');
  });
});
