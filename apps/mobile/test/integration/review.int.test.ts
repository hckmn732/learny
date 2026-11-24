// Vitest [SPEC-3305] — session de révision, paquet hors ligne et échauffement contre la pile locale
// (CA-1, CA-2, CA-3, CA-4, ET-3, ET-6).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock` and the demonstration account prepared by `node apps/mobile/e2e/prepare-demo-user.mjs`.
// The test only READS the demonstration session and sends guard cases that the server refuses
// without writing (unknown session, expired pack entry): it never degrades the shared demo data.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { isAppError } from '@learny/core';

import { createMobileApiClient } from '../../src/api/client';
import { uuidV4 } from '../../src/api/uuid';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

let client: ReturnType<typeof createMobileApiClient>;
let formationId: string;

beforeAll(async () => {
  if (ANON_KEY === '') {
    throw new Error(
      'Clé anonyme Supabase absente : sourcer .env.local (set -a; . ./.env.local; set +a) et lancer pnpm dev:up.',
    );
  }
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await auth.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signedIn.error !== null) {
    throw new Error(
      `Connexion du compte de démonstration impossible (${signedIn.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
    );
  }
  const accessToken = signedIn.data.session.access_token;
  client = createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
  const me = await client.api.meGet({});
  formationId = me.currentFormationId ?? '';
  expect(formationId).not.toBe('');
});

describe('[SPEC-3305] session du jour contre la pile locale', () => {
  it('lit la session du jour : jeux, en-tête, échéances et report du tuteur (CA-1, CA-4)', async () => {
    const session = await client.api.globalQuizToday({ params: { fid: formationId } });

    expect(session.formationId).toBe(formationId);
    expect(session.forDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(session.items.length).toBeGreaterThanOrEqual(2);
    expect(session.header.notionCount).toBeGreaterThanOrEqual(session.items.length);
    expect(session.header.estimatedMinutes).toBeGreaterThan(0);
    const recall = session.items.find((item) => item.type === 'recall_card');
    expect(recall).toBeDefined();
    if (recall !== undefined) {
      expect(recall.intervals).not.toBeNull();
      expect(recall.intervals?.good).toMatch(/T/);
    }
    // BR-AUT-07 — le report du tuteur est renvoyé par l'API, avec le jour civil et le plafond.
    if (session.smoothing !== null) {
      expect(session.smoothing.deferredCount).toBeGreaterThanOrEqual(1);
      expect(session.smoothing.capMinutes).toBeGreaterThan(0);
      expect(session.smoothing.deferredTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(session.smoothing.actionId).not.toBeNull();
    }
    expect(['in_progress', 'completed']).toContain(session.status);
  });

  it('lit le paquet hors ligne de chaque formation active (CA-3, EF-7)', async () => {
    const pack = await client.api.offlinePack({});

    expect(pack.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(pack.expiresAt)).toBeGreaterThan(Date.parse(pack.generatedAt));
    expect(pack.formations.length).toBeGreaterThanOrEqual(1);
    const current = pack.formations.find((entry) => entry.formationId === formationId);
    expect(current).toBeDefined();
    expect(current?.session.forDate).toBe(pack.localDate);
    expect(current?.extraCards.length).toBeLessThanOrEqual(20);
  });

  it('lit l’échauffement du jour avec ses questions et son ancre de session (CA-2)', async () => {
    const warmups = await client.api.warmupTodayGet({});

    expect(warmups.items.length).toBeGreaterThanOrEqual(1);
    const warmup = warmups.items[0];
    expect(warmup?.items.length).toBeGreaterThanOrEqual(1);
    expect(warmup?.items[0]?.question.length).toBeGreaterThan(0);
    expect(warmup?.items[0]?.answer.length).toBeGreaterThan(0);
    expect(warmup?.nextSession.startsAt).toMatch(/T/);
  });

  it('refuse une réponse sur une session inconnue sans rien écrire (ET-3)', async () => {
    const unknown = uuidV4();
    let code: string | null = null;
    try {
      await client.api.reviewAnswer({
        params: { sid: unknown },
        body: { position: 0, clientAnswerId: uuidV4(), timeMs: 1000, skipped: true },
      });
    } catch (error) {
      code = isAppError(error) ? error.code : null;
    }
    expect(code).toBe('NOT_FOUND');
  });

  it('rejette une réponse hors ligne d’une session inconnue, sans doublon (ET-6, CL-1)', async () => {
    const clientId = uuidV4();
    const entry = {
      clientId,
      formationId,
      sessionId: uuidV4(),
      answeredAt: '2026-11-11T12:20:00.000Z',
      kind: 'answer' as const,
      position: 0,
      response: { selfGrade: 'good' },
      timeMs: 12000,
      selfGrade: 'good' as const,
    };

    const first = await client.api.offlineSync({ body: { entries: [entry] } });
    expect(first.results).toHaveLength(1);
    expect(first.results[0]?.clientId).toBe(clientId);
    expect(first.results[0]?.status).toBe('rejected');
    expect(first.results[0]?.code).toBe('SESSION_NOT_FOUND');

    // Idempotence : la même entrée rejouée donne le même verdict, jamais deux écritures.
    const second = await client.api.offlineSync({ body: { entries: [entry] } });
    expect(second.results[0]?.clientId).toBe(clientId);
    expect(['rejected', 'duplicate']).toContain(second.results[0]?.status);
  });
});
