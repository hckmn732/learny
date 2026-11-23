// Vitest [SPEC-3202] — programme et changement de formation contre la pile locale (CA-1, CA-3).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock` and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs`. Source `.env.local` before the run.
//
// The PATCH writes the current formation the learner already has: the test proves the round-trip
// of CA-3 without disturbing the shared demonstration database used by the other specifications.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { isActiveProgramme } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

async function signedInClient() {
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
  return createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
}

let client: Awaited<ReturnType<typeof signedInClient>>;

beforeAll(async () => {
  client = await signedInClient();
});

describe('[SPEC-3202] programme et formation courante contre la pile locale', () => {
  it('lit le programme actif, ses modules et ses chapitres (CA-1)', async () => {
    const me = await client.api.meGet({});
    const sidebar = await client.api.sidebarGet({});
    const formationId = me.currentFormationId ?? sidebar.currentFormation?.id ?? null;
    expect(formationId).not.toBeNull();
    const programme = await client.api.programmeGet({ params: { fid: formationId ?? '' } });
    expect(isActiveProgramme(programme)).toBe(true);
    if (!isActiveProgramme(programme)) return;
    expect(programme.formation.title).toBe('SAP S/4HANA Finance');
    expect(programme.indicators.progress.percent).toBe(38);
    expect(programme.modules).toHaveLength(7);
    expect(programme.modules[2]?.title).toBe('Comptabilité générale');
    expect(programme.modules[2]?.status).toBe('open');
    expect(programme.modules[3]?.status).toBe('locked');
    expect(programme.modules[3]?.unlockAfterPosition).toBe(3);
    expect(
      programme.chapters.filter((chapter) => chapter.moduleId === programme.modules[2]?.id),
    ).toHaveLength(4);
    expect(programme.calendar.length).toBe(7);
    expect(programme.today).toBe('2026-11-11');
  });

  it('lit la progression de lecture du module ouvert (BR-COU-08)', async () => {
    const me = await client.api.meGet({});
    const sidebar = await client.api.sidebarGet({});
    const formationId = me.currentFormationId ?? sidebar.currentFormation?.id ?? null;
    const programme = await client.api.programmeGet({ params: { fid: formationId ?? '' } });
    if (!isActiveProgramme(programme)) throw new Error('programme actif attendu');
    const open = programme.modules.find((module) => module.status === 'open');
    expect(open).toBeDefined();
    const course = await client.api.moduleCourse({ params: { mid: open?.id ?? '' } });
    expect(course.chapters.length).toBe(4);
    expect(course.chapters[0]?.percent).toBe(100);
    expect(course.chapters[1]?.percent).toBe(45);
  });

  it('mémorise la formation courante côté serveur (CA-3)', async () => {
    const me = await client.api.meGet({});
    const before = me.currentFormationId;
    expect(before).not.toBeNull();
    const state = await client.api.currentFormationUpdate({
      body: { formationId: before ?? '' },
    });
    expect(state.currentFormationId).toBe(before);
    expect(state.formations.some((formation) => formation.id === before)).toBe(true);
    const after = await client.api.meGet({});
    expect(after.currentFormationId).toBe(before);
  });
});
