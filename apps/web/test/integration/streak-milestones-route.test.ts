import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { GET as getMilestones } from '../../app/api/v1/milestones/route';
import { GET as getStreak } from '../../app/api/v1/streak/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const NOW = '2026-11-11T12:20:00Z';

const sessions: TestSession[] = [];

beforeAll(() => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  vi.stubEnv('TRUST_PROXY', 'true');
});

beforeEach(() => {
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (sessions.length > 0) {
    const session = sessions.pop();
    if (session !== undefined) await deleteTestSession(session);
  }
});

afterAll(async () => {
  await closeDb();
  vi.unstubAllEnvs();
});

async function session(): Promise<TestSession> {
  const created = await createTestSession();
  sessions.push(created);
  return created;
}

function request(path: string, cookie: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: 'GET',
    headers: { cookie, origin: BASE },
  });
}

interface Seed {
  formationId: string;
  moduleId: string;
}

async function seed(sessionValue: TestSession): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, sessionValue.userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module absent');
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', timezone = 'Europe/Paris',
          current_formation_id = ${programme.formationId}::uuid
      where id = ${sessionValue.userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
      values (
        ${sessionValue.userId}::uuid, ${programme.formationId}::uuid,
        'module_validated'::public.milestone_key, ${moduleId}::uuid,
        ${NOW}::timestamptz
      )
    `);
    return { formationId: programme.formationId, moduleId };
  });
}

describe('[SPEC-723] service et API', () => {
  it('CA-3 — 400 pour un identifiant invalide, 404 pour la formation d’un autre', async () => {
    const owner = await session();
    const other = await session();
    const seeded = await seed(owner);

    const invalid = await getMilestones(
      request('/api/v1/milestones?formationId=pas-un-uuid', other.cookieHeader),
      NO_SEGMENT,
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'VALIDATION_FAILED' });

    const foreign = await getMilestones(
      request(`/api/v1/milestones?formationId=${seeded.formationId}`, other.cookieHeader),
      NO_SEGMENT,
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CA-1, CA-3 — chaque apprenant ne lit que sa propre série et ses propres jalons', async () => {
    const owner = await session();
    const other = await session();
    await seed(owner);

    const streak = await getStreak(request('/api/v1/streak', owner.cookieHeader), NO_SEGMENT);
    expect(streak.status).toBe(200);
    expect(await streak.json()).toMatchObject({ days: 0, timezone: 'Europe/Paris' });

    const milestones = await getMilestones(
      request('/api/v1/milestones', owner.cookieHeader),
      NO_SEGMENT,
    );
    expect(milestones.status).toBe(200);
    const body = (await milestones.json()) as { items: { formationId: string }[] };
    expect(body.items).toHaveLength(1);

    const own = await getMilestones(request('/api/v1/milestones', other.cookieHeader), NO_SEGMENT);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ items: [] });
  });
});
