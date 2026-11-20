import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    const result = await runNativeClientScenario({ apiUrl: origin });
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
