import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { createTestCourse, createTestProgramme } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ';

let session: TestSession;

/** The demonstration learner: a formation, two notions, and a current course with two sections. */
async function seedDemo(userId: string, kind: 'alice' | 'bob'): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: kind === 'alice' ? 'Réseaux d’entreprise' : 'Confidences de Bob sur le réseau',
    });
    const moduleId = programme.moduleIds[0];
    const first = programme.notionIds[0];
    const second = programme.notionIds[1];
    if (moduleId === undefined || first === undefined || second === undefined) {
      throw new Error('programme de démonstration incomplet');
    }
    await tx.execute(sql`
      update public.formations
      set description = ${
        kind === 'alice'
          ? 'Formation aux réseaux locaux et à leur sécurité.'
          : 'Notes privées de Bob : le réseau secret.'
      }
      where id = ${programme.formationId}::uuid
    `);
    const notions =
      kind === 'alice'
        ? [
            ['Réseau local', 'Un réseau local relie des machines proches.'],
            ['Routage', 'Le routage choisit le chemin dans le réseau.'],
          ]
        : [
            ['Réseau de Bob', 'Le réseau confidentiel de Bob.'],
            ['Secret de Bob', 'Le routage privé de Bob.'],
          ];
    for (const [id, [label, definition]] of [first, second].map(
      (id, index) => [id, notions[index] ?? ['', '']] as const,
    )) {
      await tx.execute(sql`
        update public.notions set label = ${label}, short_definition = ${definition}
        where id = ${id}::uuid
      `);
    }
    const course = await createTestCourse(tx, { ownerId: userId, moduleId, sectionsPerChapter: 2 });
    const [intro, long] = course.sectionIds;
    if (intro === undefined || long === undefined) throw new Error('sections absentes');
    await tx.execute(sql`
      update public.course_sections
      set title = 'Introduction au réseau',
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
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await seedDemo(session.userId, 'alice');
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('parcourt la route réelle : contrat, erreurs et isolation @SPEC-212', async ({ request }) => {
  const other = await createTestSession();
  try {
    await seedDemo(other.userId, 'bob');
    const url = (query: string) => `/api/v1/search?${query}`;

    // Without a session: 401 problem+json.
    const anonymous = await request.get(url('q=reseau'), { headers: { cookie: '' } });
    expect(anonymous.status()).toBe(401);
    expect(anonymous.headers()['content-type']).toContain('application/problem+json');

    // Bounds: 400 VALIDATION_FAILED with the message of the interface.
    for (const [query, message] of [
      ['q=a', 'Saisissez au moins 2 caractères.'],
      [`q=${encodeURIComponent('  a  ')}`, 'Saisissez au moins 2 caractères.'],
      [`q=${'x'.repeat(101)}`, 'Recherche limitée à 100 caractères.'],
    ] as const) {
      const refused = await request.get(url(query), { headers: { cookie: session.cookieHeader } });
      expect(refused.status(), query).toBe(400);
      expect(refused.headers()['content-type']).toContain('application/problem+json');
      const problem = (await refused.json()) as {
        code: string;
        errors: { path: string; message: string }[];
      };
      expect(problem.code).toBe('VALIDATION_FAILED');
      expect(problem.errors[0]).toEqual({ path: 'query.q', message });
    }
    for (const limit of ['0', '21', 'abc']) {
      const refused = await request.get(url(`q=reseau&limit=${limit}`), {
        headers: { cookie: session.cookieHeader },
      });
      expect(refused.status(), limit).toBe(400);
    }

    // 200: grouped answer, no-store, request reference; the other learner is invisible.
    const response = await request.get(url('q=R%C3%89SEAU&limit=20'), {
      headers: { cookie: session.cookieHeader },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-request-id']).toBeTruthy();
    const body = (await response.json()) as {
      query: string;
      groups: { kind: string; label: string; total: number; items: { title: string }[] }[];
    };
    expect(body.query).toBe('RÉSEAU');
    expect(body.groups.map((group) => group.label)).toEqual(['Notions', 'Chapitres', 'Formations']);
    expect(JSON.stringify(body)).not.toContain('Bob');
    const bobView = await request.get(url('q=reseau'), { headers: { cookie: other.cookieHeader } });
    expect(JSON.stringify(await bobView.json())).not.toContain('Réseau local');

    // An injection string is text: 200 and no group.
    const injection = await request.get(url(`q=${encodeURIComponent("' OR 1=1 --")}`), {
      headers: { cookie: session.cookieHeader },
    });
    expect(injection.status()).toBe(200);
    expect(((await injection.json()) as { groups: unknown[] }).groups).toEqual([]);
  } finally {
    await deleteTestSession(other);
  }
});

