import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aiTaskModels, serviceDb } from '@learny/db';
import { createServiceContext } from '@learny/services';
import { createCredential } from '@learny/services/ai/credentials';
import { qualifyCredential } from '@learny/services/ai/qualify';
import { runNativeClientScenario } from '@learny/testing/native-client';

import { createApp } from '../../src/app';
import { startServer } from '../../src/server';

let origin: string;
let close: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const server = await startServer(createApp(), 0, '127.0.0.1');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('adresse API absente');
  origin = `http://127.0.0.1:${String(address.port)}`;
  close = async () => {
    server.closeIdleConnections();
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  };
});

afterAll(async () => {
  await close?.();
});

describe('[SPEC-1301] native client', () => {
  it('réussit les sept étapes sans cookie ni Origin (CA-2)', async () => {
    const result = await runNativeClientScenario({
      apiUrl: origin,
      prepareTutorModel: async ({ userId, email }) => {
        const ctx = createServiceContext({
          userId,
          email,
          requestId: `native-${crypto.randomUUID()}`,
        });
        const credential = await createCredential(ctx, {
          provider: 'deepseek',
          modelIds: ['deepseek-chat'],
          apiKey: 'deepseek-learny-test-only',
        });
        if (!credential.ok) throw credential.error;
        const qualified = await qualifyCredential(
          ctx,
          credential.value.id,
          'deepseek-chat',
          { mockScenario: 'qualification-success' },
        );
        if (!qualified.ok) throw qualified.error;
        await serviceDb().insert(aiTaskModels).values({
          userId,
          task: 'tutor',
          credentialId: credential.value.id,
          modelId: 'deepseek-chat',
        });
      },
    });
    expect(result.ok, JSON.stringify(result.steps)).toBe(true);
    expect(result.steps.map((entry) => entry.name)).toEqual([
      'Inscription',
      'Profil',
      'Accueil',
      'Création idempotente',
      'Rejeu idempotent',
      'Discussion en flux',
      'Rafraîchissement du jeton',
    ]);
    expect(result.steps.every((entry) => entry.ok)).toBe(true);
    expect(result.requestCount).toBeGreaterThan(7);
  });
});
