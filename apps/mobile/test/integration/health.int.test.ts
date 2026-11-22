// Integration test of the mobile API client against the local stack (SPEC-3001 CA-1).
// Requires `pnpm dev:up`, the API on http://127.0.0.1:3001 with LLM_MODE=mock (ADR-3004 § 6).
import { describe, expect, it } from 'vitest';

import { checkApiHealth } from '../../src/api/health';

const ENV = process.env as Record<string, string | undefined>;
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';

describe('[SPEC-3001] client mobile contre l’API locale', () => {
  it('GET /api/v1/health répond 200 et se décode avec le contrat partagé', async () => {
    const response = await fetch(`${API_URL}/api/v1/health`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string; database?: string };
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
  });

  it('l’instance api-client du mobile remonte la santé du serveur', async () => {
    const result = await checkApiHealth(API_URL);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok' || result.version === null) return;
    expect(result.version.length).toBeGreaterThan(0);
  });
});
