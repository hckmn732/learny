// Vitest [SPEC-3304] — lecture de la tentative et du résultat contre la pile locale (CA-3, ET-2;
// BR-QUI-04, BR-QUI-06, CL-5).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock`, the frozen clock (`CLOCK_FIXED_AT=2026-11-11T12:20:00Z`) and
// `node apps/mobile/e2e/prepare-demo-user.mjs` (password grant of the demonstration account).
//
// The test is deliberately read-only on the demonstration dataset: it reads the graded attempt of
// module 3 seeded by SPEC-115 (score 58, failed) and proves that the attempt, its result and its
// retry gate come from the server. The creation, check and submission paths are exercised by the
// Maestro flow `SPEC-3304-quiz.yaml`; the demonstration question bank is never regenerated on this
// stack (jobs run through the retired Inngest mode), so a fresh attempt can only be played from a
// seeded one. No `db:reset`, no mutation, nothing to clean up.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { isAppError } from '@learny/core';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

interface Session {
  readonly userId: string;
  readonly accessToken: string;
}

let session: Session;
let client: ReturnType<typeof createMobileApiClient>;
let attemptId = '';
let moduleId = '';

/** Rows of a PostgREST answer, without an `any` crossing the boundary of the test. */
function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

async function signIn(): Promise<Session> {
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
  return { userId: signedIn.data.user.id, accessToken: signedIn.data.session.access_token };
}

beforeAll(async () => {
  session = await signIn();
  const reader = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });
  // The failed attempt of module 3 is read with the RLS client of the learner, then with the API.
  const attempts = await reader
    .from('attempts')
    .select('id, activity_id')
    .eq('user_id', session.userId)
    .eq('status', 'graded')
    .eq('passed', false)
    .order('attempt_no', { ascending: true });
  if (attempts.error !== null) throw new Error(attempts.error.message);
  const first = rowsOf(attempts.data)[0];
  if (first === undefined) throw new Error('tentative échouée du jeu de démonstration absente');
  attemptId = text(first, 'id');
  const activityId = text(first, 'activity_id');

  const activities = await reader
    .from('activities')
    .select('id, module_id, kind')
    .eq('id', activityId);
  if (activities.error !== null) throw new Error(activities.error.message);
  const activity = rowsOf(activities.data).find((row) => text(row, 'kind') === 'validation_quiz');
  if (activity === undefined) {
    throw new Error('activité de validation du jeu de démonstration absente');
  }
  moduleId = text(activity, 'module_id');

  client = createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => session.accessToken, refresh: () => Promise.resolve(false) },
  });
});

describe('[SPEC-3304] lecture de la tentative (intégration)', () => {
  it('renvoie les questions sans aucune bonne réponse (ET-2)', async () => {
    const attempt = await client.api.getQuizAttempt({ params: { aid: attemptId } });
    expect(attempt.kind).toBe('validation_quiz');
    expect(attempt.status).toBe('graded');
    expect(attempt.threshold).toBe(80);
    expect(attempt.questions.length).toBeGreaterThanOrEqual(5);
    expect(attempt.questions[0]?.typeLabel.length).toBeGreaterThan(0);
    expect(attempt.questions[0]?.notionLabel.length).toBeGreaterThan(0);
    expect(JSON.stringify(attempt.questions.map((question) => question.payload))).not.toContain(
      '"correct"',
    );
  });

  it('renvoie le résultat complet et la décision de nouvelle tentative (CA-3, BR-QUI-06)', async () => {
    const result = await client.api.getQuizResult({ params: { aid: attemptId } });
    expect(result.score).toBe(58);
    expect(result.passed).toBe(false);
    expect(result.threshold).toBe(80);
    expect(result.pointsMissing).toBe(22);
    expect(result.module.id).toBe(moduleId);
    expect(result.perNotion.length).toBeGreaterThan(0);
    expect(result.history.length).toBeGreaterThan(0);
    // Le délai de nouvelle tentative est une décision du serveur (SPEC-612/715) : le compte de
    // démonstration autorise la reprise, la décision reste donc celle du serveur, jamais un calcul.
    expect(typeof result.retry.allowed).toBe('boolean');
    expect(result.retry.remediationRequired).toBe(false);
    expect(result.retry.reason).toBe(result.retry.allowed ? null : 'delay');
    expect(result.remediation.status).toMatch(/^(none|preparing|ready|in_progress|completed)$/);
    expect(result.pendingOpenCount).toBe(0);
  });

  it('refuse de vérifier une réponse d’une tentative corrigée (BR-QUI-04)', async () => {
    const failure = await client.api
      .checkQuizAnswer({
        params: { aid: attemptId, pos: 1 },
        body: { response: { optionIds: ['a'] }, timeMs: 1000 },
      })
      .catch((error: unknown) => error);
    expect(isAppError(failure)).toBe(true);
    expect(isAppError(failure) ? failure.code : '').toMatch(/CONFLICT|VALIDATION_FAILED/);
  });
});
