// Vitest [SPEC-4003] — client API du mode simple contre la pile locale (ET-1, EF-2, CA-5).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock`, the frozen clock and `node apps/mobile/e2e/prepare-demo-user.mjs`.
// The test creates one simple-mode formation and a link, reads them back, corrects the role and
// deletes the formation with the service role: the demonstration dataset is left unchanged.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

let accessToken = '';
let client: ReturnType<typeof createMobileApiClient>;
let formationId = '';
let resourceId = '';

beforeAll(async () => {
  if (ANON_KEY === '') {
    throw new Error('Clé anonyme Supabase absente : sourcer .env.local.');
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
      `Connexion impossible (${signedIn.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
    );
  }
  accessToken = signedIn.data.session.access_token;
  client = createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
  const created = await client.api.simpleCreate({ body: { motivation: 'Intégration SPEC-4003' } });
  formationId = created.formationId;
  expect(created.status).toBe('collecting');
  expect(created.title).toBe('Nouvelle formation');
});

afterAll(async () => {
  if (formationId === '' || SERVICE_KEY === '') return;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.from('formations').delete().eq('id', formationId);
});

describe('[SPEC-4003] client API du mode simple (intégration)', () => {
  it('crée une formation simple et la relit (EF-2)', async () => {
    const state = await client.api.simpleGet({ params: { fid: formationId } });
    expect(state.formationId).toBe(formationId);
    expect(state.status).toBe('collecting');
    expect(state.steps.map((step) => step.key)).toEqual([
      'read',
      'structure',
      'practice',
      'programme',
    ]);
    expect(state.motivation).toBe('Intégration SPEC-4003');
  });

  it('dépose un lien, devine son rôle et le corrige (EF-2)', async () => {
    const link = await client.api.simpleLink({
      params: { fid: formationId },
      body: { url: 'https://example.com/cours-comptabilite', role: 'other' },
    });
    resourceId = link.resourceId;
    expect(link.kind).toBe('web');
    expect(link.role).toBe('other');
    const corrected = await client.api.resourceRole({
      params: { rid: resourceId },
      body: { role: 'course' },
    });
    expect(corrected.role).toBe('course');
    const state = await client.api.simpleGet({ params: { fid: formationId } });
    expect(state.sources.some((source) => source.resourceId === resourceId)).toBe(true);
  });
});
