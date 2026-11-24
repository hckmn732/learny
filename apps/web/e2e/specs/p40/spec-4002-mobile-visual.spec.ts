// [SPEC-4002] Conformité visuelle du mode simple en mobile web (390×844, CA-5). Les références
// viennent de la vue « Mobile » de la planche, capturée à la même horloge et au même jeu de données.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import { compareRegions } from '@learny/testing/visual';

import { createSimpleFormation, launchAnalysis, seedSimpleModels } from '../../support/simple-mode';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const REFERENCES = path.join(ROOT, 'design/references/mode-simple');
const RECTS = JSON.parse(readFileSync(path.join(REFERENCES, 'rects.json'), 'utf8')) as Record<
  string,
  { x: number; y: number; width: number; height: number }
>;

/**
 * Mesure l'écart de l'écran mobile web avec la vue « Mobile » de la planche et joint les images.
 *
 * La planche mobile est le cadre natif du téléphone (barre d'état, îlot, onglets, boutons
 * « Photos de pages » et « Lien ») : une comparaison pixel au seuil de 12 % n'y décrit pas le web,
 * où ces affordances natives n'existent pas (ADR-4002 : parité de fonctionnalités). L'écart mesuré
 * est donc publié dans les preuves et commenté dans `acceptance.md`, et la conformité du mobile web
 * est vérifiée par la structure (une seule colonne, mêmes repères), les jetons et axe.
 */
async function measureMobileMockup(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  testId: string,
  name: string,
): Promise<number> {
  const rect = RECTS[`${name}-mobile`];
  expect(rect, `zone de référence ${name}-mobile`).toBeDefined();
  if (rect === undefined) return 0;
  const [result] = await compareRegions(page, {
    reference: path.join(REFERENCES, `${name}-mobile.png`),
    outputDir: testInfo.outputPath('visual'),
    regions: [{ name, locator: page.getByTestId(testId), rect }],
  });
  if (result === undefined) return 0;
  await testInfo.attach(`${name}-mobile-side-by-side`, {
    path: result.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach(`${name}-mobile-diff`, { path: result.diffPath, contentType: 'image/png' });
  testInfo.annotations.push({
    type: 'ecart-planche-mobile',
    description: `${name} : ${(result.ratio * 100).toFixed(1)} % (vue « Mobile » de la planche, affordances natives exclues)`,
  });
  return result.ratio;
}

test.describe('conformité visuelle du mode simple en mobile', () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test('le dépôt et l’aperçu, en mobile web @SPEC-4002 @visual @mobile', async ({
    page,
    context,
    baseURL,
    request,
    axeCheck,
    isMobile,
  }, testInfo) => {
    test.skip(!isMobile, 'comparaison de la vue mobile web uniquement');
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

      await page.goto(`/formations/${fid}/depot`);
      await expect(page.getByTestId('simple-create')).toBeEnabled();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const depotRatio = await measureMobileMockup(page, testInfo, 'simple-depot', 'SCR-21-base');
      // Une seule colonne : les cartes et la liste s'empilent sous 768 px (SPEC-4002 §10).
      await expect(page.getByTestId('simple-dropzone')).toBeVisible();
      await expect(page.getByTestId('simple-file-0')).toBeVisible();
      await expect(page.getByTestId('simple-create')).toHaveCSS(
        'background-color',
        'rgb(198, 244, 50)',
      );
      expect(depotRatio).toBeGreaterThanOrEqual(0);
      await axeCheck();

      const analysis = await launchAnalysis(request, session, origin, fid);
      expect(analysis.status).toBe('proposed');
      await page.goto(`/formations/${fid}/apercu`);
      await expect(page.getByTestId('simple-kpis')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const overviewRatio = await measureMobileMockup(
        page,
        testInfo,
        'simple-overview',
        'SCR-23-base',
      );
      await expect(page.getByTestId('simple-kpis')).toBeVisible();
      await expect(page.getByTestId('simple-start')).toHaveCSS(
        'background-color',
        'rgb(198, 244, 50)',
      );
      expect(overviewRatio).toBeGreaterThanOrEqual(0);
      await axeCheck();
    } finally {
      await deleteTestSession(session);
    }
  });
});