import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const SECTIONS = ['spec-212-query', 'spec-212-results', 'spec-212-json'];
const TITLE = 'SPEC-212 — Recherche globale (service et API)';
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

test('recherche groupée @SPEC-212', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  await page.goto('/_dev/sdd/SPEC-212');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Requête',
    'Résultats',
    'Réponse brute',
  ]);
  await expect(page.getByTestId('spec-212-live')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('searchbox', { name: 'Rechercher' })).toBeVisible();
  await expect(page.getByTestId('spec-212-example')).toHaveText([
    '« reseau » (sans accent)',
    '« RÉSEAU » (casse)',
    '« reseua » (faute)',
    '« a » (refusée)',
    "« ' OR 1=1 -- » (traitée comme texte)",
  ]);

  // « reseau » without accent: three groups in the fixed order, matches wrapped in <mark>.
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('reseau');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    /^Notions/,
    /^Chapitres/,
    /^Formations/,
  ]);
  await expect(page.getByTestId('spec-212-total-notion')).toHaveText('(2)');
  await expect(page.getByTestId('spec-212-total-chapter')).toHaveText('(2)');
  await expect(page.getByTestId('spec-212-total-formation')).toHaveText('(1)');
  const marks = await page.locator('[data-testid="spec-212-item"] mark').allTextContents();
  expect(marks.length).toBeGreaterThanOrEqual(5);
  for (const text of marks) expect(text.normalize('NFD').replace(/\p{Mn}/gu, '')).toMatch(/reseau/i);
  await expect(
    page.getByTestId('spec-212-item-title').filter({ hasText: 'Réseau local' }).locator('mark'),
  ).toHaveText('Réseau');
  await expect(page.getByTestId('spec-212-summary')).toHaveText('5 résultats.');
  // The long section is recentred on its match and shows the ellipsis (CL-7).
  await expect(
    page.getByTestId('spec-212-item-snippet').filter({ hasText: 'Le réseau en étoile' }),
  ).toContainText(/^….*Le réseau en étoile.*…$/);
  // Internal links in French, never HTML.
  const hrefs = await page.getByTestId('spec-212-item-href').allTextContents();
  expect(hrefs).toHaveLength(5);
  for (const href of hrefs) expect(href).toMatch(/^\/formations\/[0-9a-f-]{36}/);
  expect(hrefs.some((href) => href.includes('/programme#notion-'))).toBe(true);
  expect(hrefs.some((href) => href.includes('/cours?chapitre='))).toBe(true);
  const rendered = await page.getByTestId('spec-212-results').innerHTML();
  expect(rendered).not.toContain('&lt;');
  expect(rendered).not.toContain('<script');

  // The raw response is collapsible and holds the contract.
  await page.getByText('Afficher la réponse JSON').click();
  const json = JSON.parse(await page.getByTestId('spec-212-json-body').innerText()) as {
    query: string;
    groups: { kind: string }[];
  };
  expect(json.query).toBe('reseau');
  expect(json.groups.map((group) => group.kind)).toEqual(['notion', 'chapter', 'formation']);
  const titles = await page.getByTestId('spec-212-item-title').allTextContents();

  // « RÉSEAU »: same results, whatever the case or the accents.
  await page.getByRole('button', { name: /RÉSEAU/ }).click();
  await expect(page.getByTestId('spec-212-summary')).toHaveText('5 résultats.');
  expect(await page.getByTestId('spec-212-item-title').allTextContents()).toEqual(titles);

  // « reseua »: a common typo still finds the notion.
  await page.getByRole('button', { name: /reseua/ }).click();
  await expect(
    page.getByTestId('spec-212-item-title').filter({ hasText: 'Réseau local' }),
  ).toBeVisible();

  // « a »: refused with the message of the interface, in an alert.
  await page.getByRole('button', { name: /« a »/ }).click();
  const alert = page.getByTestId('spec-212-error');
  await expect(alert).toHaveText('Recherche impossible : Saisissez au moins 2 caractères.');
  await expect(alert).toHaveAttribute('role', 'alert');

  // An injection string is plain text: an empty result, no error.
  await page.getByRole('button', { name: /OR 1=1/ }).click();
  await expect(page.getByTestId('spec-212-empty')).toHaveText(
    "Aucun résultat pour « ' OR 1=1 -- »."
  );
  await expect(alert).toHaveCount(0);

  // The keyboard drives the whole page: type, press Enter.
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('routage');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spec-212-total-notion')).toHaveText('(1)');

  await axeCheck();
  await captureEvidence('spec-212-recherche');
  expect(consoleErrors.filter((message) => !message.includes('status of 4'))).toEqual([]);
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

test('recherche conforme @SPEC-212 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-212');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);

  await page.getByRole('button', { name: /« reseau »/ }).click();
  await expect(page.getByTestId('spec-212-summary')).toHaveText('5 résultats.');

  // Tokens of the base layout (SPEC-201 §10): page #F4F4F1, white cards, #E7E6E1 border, 24 px.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-212-query"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-212-results"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-212-json"]': { 'border-top-left-radius': '24px' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  // No horizontal scroll at any width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  // The identifiers inside the links change at every run: they are masked.
  await expectScreenshotBaseline(page, 'spec-212-demo.png', {
    fullPage: true,
    mask: [page.getByTestId('spec-212-item-href')],
  });
});
