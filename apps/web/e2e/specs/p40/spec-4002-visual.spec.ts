// [SPEC-4002] Conformité visuelle des six étapes du mode simple aux maquettes (ADR-0034 §6, CA-5).
//
// Chaque état est comparé à sa référence capturée depuis `design/mode-simple/index.html`
// (`design/references/mode-simple/`, outil `tools/design/capture-references.mjs --set mode-simple`) :
// même horloge figée, même jeu de données, comparaison de la zone utile avec 12 % d'écart au plus.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

import {
  createSimpleFormation,
  headers,
  launchAnalysis,
  seedSimpleModels,
  validateProgramme,
} from '../../support/simple-mode';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const REFERENCES = path.join(ROOT, 'design/references/mode-simple');
const RECTS = JSON.parse(readFileSync(path.join(REFERENCES, 'rects.json'), 'utf8')) as Record<
  string,
  { x: number; y: number; width: number; height: number }
>;

type Viewport = 'desktop' | 'mobile';

interface Region {
  testId: string;
  name: string;
  /** Clé de `rects.json` quand la région comparée est plus étroite que l'écran entier. */
  reference?: string;
}

/** Compare la région utile de l'écran à la référence du même état (12 % au plus). */
async function expectMockup(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  region: Region,
  viewport: Viewport,
): Promise<void> {
  const key = region.reference ?? `${region.name}-${viewport}`;
  const rect = RECTS[key];
  expect(rect, `zone de référence ${key}`).toBeDefined();
  if (rect === undefined) return;
  const results = await compareRegions(page, {
    reference: path.join(REFERENCES, `${region.name}-${viewport}.png`),
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: region.name,
        locator: page.getByTestId(region.testId),
        rect,
      },
    ],
  });
  for (const result of results) {
    await testInfo.attach(`${result.name}-side-by-side`, {
      path: result.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`${result.name}-diff`, { path: result.diffPath, contentType: 'image/png' });
    expect(result.ratio, `écart ${result.name} (${viewport})`).toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }
  await testInfo.attach(`${region.name}-${viewport}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

test.describe('conformité visuelle du mode simple', () => {
  test.beforeAll(async () => {
    // Le jeu de démonstration est partagé par la campagne : il est restauré avant les captures.
    await restoreDemoData();
  });

  test.afterAll(async () => {
    await closeDb();
  });

  test('les six étapes et l’état sans clé, en bureau @SPEC-4002 @visual', async ({
    page,
    context,
    baseURL,
    request,
    axeCheck,
  }, testInfo) => {
    // Étape 1 — accueil : les deux cartes, sur un apprenant qui a moins de trois formations
    // actives (BR-FOR-10) ; le jeu de démonstration en porte davantage et masquerait la section.
    const accueil = await createTestSession();
    await context.addCookies(
      accueil.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? supabaseLocalEnv().url })),
    );
    await serviceDb().execute(sql`
      update public.profiles set onboarding_step = 'done' where id = ${accueil.userId}::uuid
    `);
    await page.goto('/accueil');
    await expect(page.getByTestId('home-simple-choice')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectMockup(
      page,
      testInfo,
      {
        testId: 'simple-choice-cards',
        name: 'SCR-03-base',
        reference: 'SCR-03-base-desktop-cartes',
      },
      'desktop',
    );
    await expectTokens(page, {
      '[data-testid="simple-card-drop"]': { 'background-color': colors.lime },
      '[data-testid="simple-card-tutor"]': {
        'background-color': colors.surface,
        'border-top-color': colors.border,
      },
    });
    await axeCheck();
    await deleteTestSession(accueil);

    // Les états suivants vivent sur un apprenant neuf et sa formation en mode simple.
    const session = await createTestSession();
    try {
      const origin = baseURL ?? 'http://127.0.0.1:3142';
      await serviceDb().execute(sql`
        update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
      `);
      await context.clearCookies();
      await context.addCookies(
        session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? supabaseLocalEnv().url })),
      );
      await seedSimpleModels(session.userId);

      // Étape 2 — dépôt : un manuel, des TD et des annales déjà téléversés.
      const fid = await createSimpleFormation(request, session, origin, {
        motivation: 'Examen le 15 juin',
        sources: [
          { resourceId: '', role: 'course', title: 'Manuel de comptabilité générale' },
          { resourceId: '', role: 'exercises', title: 'TD corrigés, chapitres 1 à 12' },
          { resourceId: '', role: 'exam_papers', title: 'Annales DCG 2023-2025' },
        ],
      });
      await page.goto(`/formations/${fid}/depot`);
      await expect(page.getByTestId('simple-create')).toBeEnabled();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectMockup(page, testInfo, { testId: 'simple-depot', name: 'SCR-21-base' }, 'desktop');
      await expectTokens(page, {
        '[data-testid="simple-create"]': { 'background-color': colors.lime },
        '[data-testid="simple-dropzone"]': { 'background-color': colors['surface-subtle'] },
      });
      await expectScreenshotBaseline(page, 'SPEC-4002-depot-desktop.png', { fullPage: true });
      await axeCheck();

      // Étape 3 — analyse : les quatre étapes et les chapitres trouvés.
      await serviceDb().execute(sql`
        update public.simple_analyses
           set status = 'analysing',
               steps = ${JSON.stringify([
                 { key: 'read', state: 'done', detail: 'Lecture du document de cours.' },
                 { key: 'structure', state: 'done', detail: 'Chapitres détectés dans le document.' },
                 { key: 'practice', state: 'running', detail: null },
                 { key: 'programme', state: 'todo', detail: null },
               ])}::jsonb,
               chapters_found = ${JSON.stringify([
                 { position: 1, title: 'Introduction' },
                 { position: 2, title: 'Plan comptable' },
                 { position: 3, title: 'Saisie des pièces' },
               ])}::jsonb
         where formation_id = ${fid}::uuid
      `);
      await page.goto(`/formations/${fid}/depot`);
      await expect(page.getByTestId('simple-steps')).toBeVisible();
      await expectMockup(page, testInfo, { testId: 'simple-analysis', name: 'SCR-22-base' }, 'desktop');
      await axeCheck();
    } finally {
      await deleteTestSession(session);
    }
  });

  test('l’aperçu, le diagnostic et le premier chapitre, en bureau @SPEC-4002 @visual', async ({
    page,
    context,
    baseURL,
    request,
    axeCheck,
  }, testInfo) => {
    const session = await createTestSession();
    try {
      const origin = baseURL ?? 'http://127.0.0.1:3142';
      await serviceDb().execute(sql`
        update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
      `);
      await context.addCookies(
        session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? supabaseLocalEnv().url })),
      );
      await seedSimpleModels(session.userId);
      const fid = await createSimpleFormation(request, session, origin, {
        motivation: 'Examen le 15 juin',
        sources: [
          { resourceId: '', role: 'course', title: 'Manuel de comptabilité générale' },
          { resourceId: '', role: 'exercises', title: 'TD corrigés, chapitres 1 à 12' },
        ],
      });
      const analysis = await launchAnalysis(request, session, origin, fid);
      expect(analysis.status).toBe('proposed');

      // Étape 4 — aperçu du programme.
      await page.goto(`/formations/${fid}/apercu`);
      await expect(page.getByTestId('simple-kpis')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectMockup(page, testInfo, { testId: 'simple-overview', name: 'SCR-23-base' }, 'desktop');
      await expectTokens(page, {
        '[data-testid="simple-overview"]': { color: colors.ink },
        '[data-testid="simple-start"]': { 'background-color': colors.lime },
      });
      await expectScreenshotBaseline(page, 'SPEC-4002-apercu-desktop.png', { fullPage: true });
      await axeCheck();

      // Étape 5 — diagnostic.
      await validateProgramme(request, session, origin, fid);
      await page.goto(`/formations/${fid}/diagnostic`);
      await expect(page.getByTestId('diagnostic-progress')).toBeVisible();
      await expectMockup(page, testInfo, { testId: 'simple-diagnostic', name: 'SCR-24-base' }, 'desktop');
      await axeCheck();

      // Étape 6 — résultat et premier chapitre, avec la ligne de score.
      const created = await request.post(`/api/v1/formations/${fid}/diagnostic`, {
        headers: headers(session, origin, `spec-4002-visual-diagnostic-${session.userId}`),
      });
      const body = await created.text();
      expect(created.status(), body).toBeLessThan(300);
      const { attemptId } = JSON.parse(body) as { attemptId: string };
      // Le diagnostic est remis tel quel : le score est nul, aucun module n'est acquis et le
      // premier chapitre reste celui que la maquette met en avant.
      await request.post(`/api/v1/attempts/${attemptId}/submit`, {
        headers: headers(session, origin),
      });

      await page.goto(`/formations/${fid}/diagnostic/resultat?attempt=${attemptId}`);
      await expect(page.getByTestId('simple-ready-card')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectMockup(
        page,
        testInfo,
        {
          testId: 'simple-ready-card',
          name: 'SCR-24-resultat',
          reference: 'SCR-24-resultat-desktop-carte-pret',
        },
        'desktop',
      );
      await expectScreenshotBaseline(page, 'SPEC-4002-resultat-desktop.png', { fullPage: true });
      await axeCheck();
    } finally {
      await deleteTestSession(session);
    }
  });

  test('l’état sans clé d’IA, en bureau @SPEC-4002 @visual', async ({
    page,
    context,
    baseURL,
    request,
    axeCheck,
  }, testInfo) => {
    const session = await createTestSession();
    try {
      const origin = baseURL ?? 'http://127.0.0.1:3142';
      await serviceDb().execute(sql`
        update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
      `);
      await context.addCookies(
        session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? supabaseLocalEnv().url })),
      );
      const fid = await createSimpleFormation(request, session, origin, {
        sources: [{ resourceId: '', role: 'course', title: 'Manuel de comptabilité générale' }],
      });
      await page.goto(`/formations/${fid}/depot`);
      await expect(page.getByTestId('simple-key-warning')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectMockup(
        page,
        testInfo,
        { testId: 'simple-depot', name: 'SCR-21-sans-cle' },
        'desktop',
      );
      await expectTokens(page, {
        '[data-testid="simple-key-warning"]': { 'background-color': colors['orange-soft'] },
      });
      await expectScreenshotBaseline(page, 'SPEC-4002-depot-sans-cle-desktop.png', {
        fullPage: true,
      });
      await axeCheck();
    } finally {
      await deleteTestSession(session);
    }
  });
});
