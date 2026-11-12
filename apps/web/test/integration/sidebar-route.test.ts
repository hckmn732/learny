import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarDto } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { GET, PATCH } from '../../app/api/v1/me/sidebar/route';

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
  // Pino writes to stdout; keep the output quiet.
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

function request(method: 'GET' | 'PATCH', cookie: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = { cookie, origin: BASE };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${BASE}/api/v1/me/sidebar`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function get(sessionValue: TestSession): Promise<Response> {
  return GET(request('GET', sessionValue.cookieHeader), NO_SEGMENT);
}

async function patch(sessionValue: TestSession, body: unknown): Promise<Response> {
  return PATCH(request('PATCH', sessionValue.cookieHeader, body), NO_SEGMENT);
}

interface Seed {
  activeId: string;
  secondId: string;
  pausedId: string;
  notionIds: string[];
}

async function seed(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const active = await createTestProgramme(tx, userId, {
      modules: 4,
      chaptersPerModule: 1,
      notionsPerChapter: 3,
      title: 'SAP S/4HANA Finance',
    });
    const second = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: "Python pour l'analyse de données",
    });
    const paused = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Gestion de projet agile',
    });
    await tx.execute(sql`
      update public.formations
      set last_opened_at = ${NOW}::timestamptz,
          status = 'active'
      where id = ${active.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.formations set status = 'paused' where id = ${paused.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set last_opened_at = '2026-11-10T10:00:00Z'::timestamptz
      where id = ${second.formationId}::uuid
    `);
    const validatedModuleId = active.moduleIds[0];
    const openModuleId = active.moduleIds[1];
    if (validatedModuleId === undefined || openModuleId === undefined) {
      throw new Error('modules de test absents');
    }
    await tx.execute(sql`
      update public.modules
      set status = 'validated', validated_at = ${NOW}::timestamptz
      where id = ${validatedModuleId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set status = 'open', opened_at = ${NOW}::timestamptz
      where id = ${openModuleId}::uuid
    `);
    for (let index = 0; index < 3; index += 1) {
      const notionId = active.notionIds[index];
      if (notionId === undefined) throw new Error('notion de test absente');
      await createNotionState(tx, {
        userId,
        notionId,
        gapNature: index === 0 ? 'forgetting' : null,
        evidence: index === 0 ? 'Confondue en quiz.' : null,
        inReview: true,
      });
    }
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${active.formationId}::uuid,
          onboarding_step = 'done',
          streak_days = 2
      where id = ${userId}::uuid
    `);
    return {
      activeId: active.formationId,
      secondId: second.formationId,
      pausedId: paused.formationId,
      notionIds: active.notionIds,
    };
  });
}

async function body(response: Response): Promise<SidebarDto> {
  expect(response.status).toBe(200);
  return SidebarDto.parse(await response.json());
}

describe('[SPEC-304] Coquille : menu latéral service', () => {
  it('lit la formation courante, la carte et les compteurs, et isole deux utilisateurs (CA-1, CA-3)', async () => {
    const first = await session();
    const other = await session();
    const seeded = await seed(first.userId);

    const menu = await body(await get(first));
    expect(menu.currentFormation).toMatchObject({
      id: seeded.activeId,
      title: 'SAP S/4HANA Finance',
      status: 'active',
      progressPercent: 25,
      currentModulePosition: 2,
      moduleCount: 4,
    });
    expect(menu.formations.map((formation) => formation.id)).toEqual([
      seeded.activeId,
      seeded.secondId,
      seeded.pausedId,
    ]);
    expect(menu.quizDueCount).toBe(3);
    expect(menu.gapCount).toBe(1);
    expect(menu.streak.days).toBe(2);
    expect(menu.streak.regularity).toHaveLength(14);
    expect(menu.streak.regularity.at(-1)?.date).toBe('2026-11-11');

    const isolated = await body(await get(other));
    expect(isolated.currentFormation).toBeNull();
    expect(isolated.formations).toEqual([]);
    expect(isolated.quizDueCount).toBe(0);
    expect(isolated.gapCount).toBe(0);
    expect(isolated.streak.days).toBe(0);
  });

  it('persiste le masquage dans le profil et refuse la formation d’un autre (CA-2, CA-3)', async () => {
    const first = await session();
    const other = await session();
    const seeded = await seed(first.userId);

    const hidden = await body(await patch(first, { collapsed: true }));
    expect(hidden.collapsed).toBe(true);
    const [profile] = await serviceDb().execute<{ sidebar_collapsed: boolean }>(sql`
      select sidebar_collapsed from public.profiles where id = ${first.userId}::uuid
    `);
    expect(profile?.sidebar_collapsed).toBe(true);
    expect((await body(await get(first))).collapsed).toBe(true);

    const foreign = await patch(other, { currentFormationId: seeded.activeId });
    expect(foreign.status).toBe(404);
    const problem = (await foreign.json()) as { code: string; detail: string };
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.detail).not.toContain('SAP');
    const [untouched] = await serviceDb().execute<{ current_formation_id: string | null }>(sql`
      select current_formation_id::text as current_formation_id
      from public.profiles where id = ${other.userId}::uuid
    `);
    expect(untouched?.current_formation_id).toBeNull();
  });

  it('change la formation courante active et renvoie une erreur sûre sans écriture (CA-3)', async () => {
    const first = await session();
    const seeded = await seed(first.userId);

    const switched = await body(await patch(first, { currentFormationId: seeded.secondId }));
    expect(switched.currentFormation?.id).toBe(seeded.secondId);
    const [profile] = await serviceDb().execute<{ current_formation_id: string }>(sql`
      select current_formation_id::text as current_formation_id
      from public.profiles where id = ${first.userId}::uuid
    `);
    expect(profile?.current_formation_id).toBe(seeded.secondId);

    const invalid = await patch(first, {});
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await invalid.json()) as { code: string; errors?: unknown[] };
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(problem)).not.toContain('stack');
    const [stillSecond] = await serviceDb().execute<{ current_formation_id: string }>(sql`
      select current_formation_id::text as current_formation_id
      from public.profiles where id = ${first.userId}::uuid
    `);
    expect(stillSecond?.current_formation_id).toBe(seeded.secondId);
  });
});
