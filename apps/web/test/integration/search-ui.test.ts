// @vitest-environment jsdom
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';
import { cleanup, renderComponent, screen } from '@learny/testing/render';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { GET as searchRoute } from '../../app/api/v1/search/route';
import { SearchPageView } from '../../components/search/search-results';
import { searchPageForContext, type SearchPageState } from '../../lib/search-data';
import { fr } from '../../messages/fr';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ';

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
  cleanup();
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

function context(userId: string) {
  return createServiceContext({ userId, requestId: `spec-307-${userId}` });
}

interface Seed {
  formationId: string;
  moduleId: string;
  notionIds: string[];
  sectionIds: string[];
}

async function seed(userId: string, kind: 'alice' | 'bob'): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: kind === 'alice' ? 'Réseaux d’entreprise' : 'Réseau confidentiel de Bob',
    });
    const moduleId = programme.moduleIds[0];
    const first = programme.notionIds[0];
    const second = programme.notionIds[1];
    if (moduleId === undefined || first === undefined || second === undefined) {
      throw new Error('programme de test incomplet');
    }
    await tx.execute(sql`
      update public.formations
      set description = ${
        kind === 'alice'
          ? 'Formation aux réseaux locaux et à leur sécurité.'
          : 'Notes privées de Bob sur le réseau.'
      }
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = ${kind === 'alice' ? 'Réseau local' : 'Réseau de Bob'},
          short_definition = ${
            kind === 'alice'
              ? 'Un réseau local relie des machines proches.'
              : 'Le réseau confidentiel de Bob.'
          }
      where id = ${first}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = ${kind === 'alice' ? 'Routage' : 'Secret de Bob'},
          short_definition = ${
            kind === 'alice'
              ? 'Le routage choisit le chemin dans le réseau.'
              : 'Le routage privé de Bob.'
          }
      where id = ${second}::uuid
    `);

    const course = await createTestCourse(tx, {
      ownerId: userId,
      moduleId,
      sectionsPerChapter: 2,
    });
    const [intro, long] = course.sectionIds;
    if (intro === undefined || long === undefined) throw new Error('sections de test absentes');
    await tx.execute(sql`
      update public.course_sections
      set title = ${kind === 'alice' ? 'Introduction au réseau' : 'Le secret de Bob'},
          content_md = ${
            kind === 'alice'
              ? 'Un **réseau** relie des machines. <b>Texte sûr</b>'
              : 'Le réseau secret de Bob.'
          }
      where id = ${intro}::uuid
    `);
    await tx.execute(sql`
      update public.course_sections
      set title = 'Topologies',
          content_md = ${`${FILLER.repeat(8)}Le réseau en étoile est courant. ${FILLER.repeat(8)}`}
      where id = ${long}::uuid
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return {
      formationId: programme.formationId,
      moduleId,
      notionIds: programme.notionIds,
      sectionIds: course.sectionIds,
    };
  });
}

function request(cookie?: string, query = 'reseau'): NextRequest {
  return new NextRequest(`${BASE}/api/v1/search?${new URLSearchParams({ q: query }).toString()}`, {
    method: 'GET',
    headers: {
      origin: BASE,
      ...(cookie === undefined ? {} : { cookie }),
    },
  });
}

async function routeSearch(sessionValue: TestSession, query = 'reseau'): Promise<Response> {
  return searchRoute(request(sessionValue.cookieHeader, query), NO_SEGMENT);
}

function titles(state: SearchPageState): string[] {
  if (state.status !== 'done') return [];
  return state.response.groups.flatMap((group) => group.items.map((item) => item.title));
}

describe('[SPEC-307] Recherche globale : interface service', () => {
  it('rend la page complète, les groupes et les liens profonds (CA-2, CA-3)', async () => {
    const alice = await session();
    const bob = await session();
    const aliceSeed = await seed(alice.userId, 'alice');
    await seed(bob.userId, 'bob');

    const state = await searchPageForContext(context(alice.userId), 'RÉSEAU');
    expect(state.status).toBe('done');
    if (state.status !== 'done') return;
    expect(state.query).toBe('RÉSEAU');
    expect(state.total).toBe(5);
    expect(state.response.groups.map((group) => group.kind)).toEqual([
      'notion',
      'chapter',
      'formation',
    ]);
    expect(state.response.groups.map((group) => group.label)).toEqual([
      'Notions',
      'Chapitres',
      'Formations',
    ]);
    expect(titles(state)).toContain('Réseau local');
    expect(titles(state)).not.toContain('Réseau de Bob');
    const links = state.response.groups.flatMap((group) => group.items.map((item) => item.href));
    expect(links).toHaveLength(5);
    for (const href of links) expect(href).toMatch(/^\/formations\/[0-9a-f-]{36}/);
    expect(
      links.some(
        (href) =>
          href ===
          `/formations/${aliceSeed.formationId}/programme#notion-${aliceSeed.notionIds[0] ?? ''}`,
      ),
    ).toBe(true);
    expect(
      links.some((href) => href.includes(`/formations/${aliceSeed.formationId}/modules/`)),
    ).toBe(true);
    expect(links.some((href) => href.includes('/cours?chapitre='))).toBe(true);
    expect(links).toContain(`/formations/${aliceSeed.formationId}`);

    // Accents and case produce the same authorized result set (CA-3).
    const lower = await searchPageForContext(context(alice.userId), 'reseau');
    expect(titles(lower)).toEqual(titles(state));

    // Full page render: query, total, group order and deep links.
    renderComponent(createElement(SearchPageView, { state }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(fr.search.page.title);
    expect(screen.getByTestId('search-page-query').textContent).toBe(
      fr.search.page.query('RÉSEAU'),
    );
    expect(screen.getByTestId('search-page-total').textContent).toBe(fr.search.page.total(5));
    const groupHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(groupHeadings.map((heading) => heading.textContent)).toEqual([
      'Notions',
      'Chapitres',
      'Formations',
    ]);
    const renderedLinks = screen.getAllByTestId('search-page-item-link');
    expect(renderedLinks).toHaveLength(5);
    for (const link of renderedLinks) expect(link.getAttribute('href')).toMatch(/^\/formations\//);
    expect(screen.getAllByText('Notion').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chapitre').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Formation').length).toBeGreaterThanOrEqual(1);
  });

  it('isole deux utilisateurs par RLS et garde la route d’API sûre (CA-3)', async () => {
    const alice = await session();
    const bob = await session();
    await seed(alice.userId, 'alice');
    await seed(bob.userId, 'bob');

    const aliceResponse = await routeSearch(alice, 'RÉSEAU');
    expect(aliceResponse.status).toBe(200);
    const aliceBody = (await aliceResponse.json()) as {
      query: string;
      groups: { kind: string; items: { title: string; href: string }[] }[];
    };
    expect(aliceBody.query).toBe('RÉSEAU');
    expect(JSON.stringify(aliceBody)).not.toContain('Bob');
    expect(aliceBody.groups.map((group) => group.kind)).toEqual(['notion', 'chapter', 'formation']);
    for (const group of aliceBody.groups) {
      for (const item of group.items) expect(item.href).toMatch(/^\/formations\//);
    }

    const bobState = await searchPageForContext(context(bob.userId), 'reseau');
    expect(titles(bobState).length).toBeGreaterThan(0);
    expect(JSON.stringify(bobState)).not.toContain('Réseau local');
    expect(titles(bobState)).toContain('Réseau de Bob');

    const anonymous = await searchRoute(request(), NO_SEGMENT);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await anonymous.json()) as { code: string; detail: string };
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(problem)).not.toMatch(/select|stack|@test\.learny\.test/i);
  });

  it('distingue requête courte, aucun résultat et erreur sûre (CA-4)', async () => {
    const alice = await session();
    await seed(alice.userId, 'alice');

    const short = await searchPageForContext(context(alice.userId), ' a ');
    expect(short).toEqual({ status: 'short', query: 'a' });
    renderComponent(createElement(SearchPageView, { state: short }));
    expect(screen.getByTestId('search-page-short').textContent).toContain(
      fr.search.page.shortTitle,
    );
    expect(screen.getByTestId('search-page-short').textContent).toContain(
      fr.search.page.shortDescription,
    );

    cleanup();
    const empty = await searchPageForContext(context(alice.userId), 'zzzzqqq');
    expect(empty.status).toBe('done');
    if (empty.status === 'done') expect(empty.total).toBe(0);
    renderComponent(createElement(SearchPageView, { state: empty }));
    expect(screen.getByTestId('search-page-empty').textContent).toContain(
      fr.search.page.emptyDescription('zzzzqqq'),
    );
    expect(screen.getByTestId('search-page-query').textContent).toBe(
      fr.search.page.query('zzzzqqq'),
    );

    cleanup();
    const failure = await searchPageForContext(
      createServiceContext({ userId: null, requestId: 'spec-307-anonymous' }),
      'reseau',
    );
    expect(failure.status).toBe('error');
    renderComponent(createElement(SearchPageView, { state: failure }));
    const error = screen.getByTestId('search-page-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(fr.search.page.errorDescription);
    expect(error.textContent).not.toMatch(/select|stack|@test\.learny\.test/i);
    expect(screen.getByTestId('search-page-retry').getAttribute('href')).toBe(
      '/recherche?q=reseau',
    );

    cleanup();
    const tooLong = await searchPageForContext(context(alice.userId), 'x'.repeat(101));
    expect(tooLong.status).toBe('error');
    if (tooLong.status === 'error')
      expect(tooLong.message).toBe('Recherche limitée à 100 caractères.');
    renderComponent(createElement(SearchPageView, { state: tooLong }));
    expect(screen.getByTestId('search-page-error').textContent).toContain(
      'Recherche limitée à 100 caractères.',
    );
  });
});
