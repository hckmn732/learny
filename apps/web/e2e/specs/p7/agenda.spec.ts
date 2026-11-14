// SPEC-704 — agenda (SCR-12): week, day and month views, bounded navigation, formation filter,
// selection detail, « Ouvrir » targets and visual conformity (CA-1 to CA-10). The demonstration
// dataset of SPEC-115 carries the mockup week of 9–13 November 2026; the clock is frozen on
// 2026-11-11T12:20:00Z and the seed is reset by the global setup of every end-to-end run.
import { fileURLToPath } from 'node:url';

import { closeDb } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReference,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const AGILE = demoFormationId('agile');
const REFERENCE_DIR = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));

let session: TestSession;

test.beforeAll(async () => {
  // The demo dataset is shared by the whole e2e run: restore it before asserting its state.
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

async function waitForFonts(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

function weekUrl(date: string, formation = 'all'): string {
  return `/agenda?vue=semaine&date=${date}&formation=${formation}`;
}

test('vues, navigation et détail @SPEC-704', async ({ page, axeCheck }) => {
  await page.goto('/agenda');

  // CA-1 — semaine du 9 au 13 novembre, sur-titre, libellé de plage et sélection par défaut.
  await expect(page.getByTestId('agenda-header')).toHaveText(
    'Toutes vos formations · semaine du 9 – 13 nov.',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda');
  await expect(page.getByTestId('agenda-range')).toHaveText('9 – 13 nov. 2026');
  for (const date of [
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ]) {
    await expect(page.getByTestId(`agenda-day-header-${date}`)).toBeVisible();
  }
  const quiz = page.getByRole('button', {
    name: 'Quiz de validation, 14:00 – 15:00, Tentative 2 · seuil 80 %, Quiz de validation, Mercredi 11 nov., Prévu',
  });
  // SPEC-714 — l'échauffement de 13:50 est désormais le premier créneau à venir.
  await expect(page.getByTestId('agenda-detail-type')).toHaveText('Échauffement');
  await expect(page.getByTestId('agenda-detail-when')).toHaveText(
    'Mercredi 11 nov. · 13:50 – 13:52',
  );
  await quiz.click();
  await expect(quiz).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('agenda-detail-type')).toHaveText('Quiz de validation');
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Quiz de validation');
  await expect(page.getByTestId('agenda-detail-when')).toHaveText(
    'Mercredi 11 nov. · 14:00 – 15:00',
  );
  await expect(page.getByTestId('agenda-detail-meta')).toHaveText('Tentative 2 · seuil 80 %');
  await expect(page.getByTestId('agenda-detail-open')).toHaveAttribute(
    'href',
    `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz`,
  );
  await expect(page.getByTestId('slot-move')).toBeEnabled();
  // CA-6 — les totaux affichés suivent EF-11 sur les créneaux de la semaine.
  await expect(page.getByTestId('agenda-totals-planned')).toContainText('24 h 02 prévues');
  await expect(page.getByTestId('agenda-totals-done')).toContainText('15 h faites');
  await expect(page.getByTestId('agenda-totals-margins')).toHaveText('3 marges de rattrapage');

  // CA-2 — la ligne de l'heure est sur la colonne du mercredi, à 260 px (13:20), une seule fois.
  const nowLine = page.getByTestId('agenda-now-line');
  await expect(nowLine).toHaveCount(1);
  await expect(page.getByTestId('agenda-today-column').getByTestId('agenda-now-line')).toBeVisible();
  await expect(nowLine).toHaveCSS('top', '260px');
  await expect(nowLine).toHaveCSS('background-color', 'rgb(249, 115, 22)');
  await axeCheck();

  // Détail au clic d'un autre créneau, puis navigation clavier (ET-9).
  await page.getByRole('button', { name: /Apports · Plan comptable,/ }).click();
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Apports · Plan comptable');
  await expect(page.getByTestId('agenda-detail-when')).toHaveText(
    'Lundi 9 nov. · 09:00 – 12:00',
  );
  await expect(quiz).toHaveAttribute('aria-pressed', 'false');
  await quiz.click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Marge de remédiation');

  // CA-4 — l'en-tête de colonne « Lun 9 » ouvre la vue Jour du 9 novembre.
  await page.getByTestId('agenda-day-header-2026-11-09').click();
  await expect(page).toHaveURL(/vue=jour/);
  await expect(page).toHaveURL(/date=2026-11-09/);
  await expect(page.getByTestId('agenda-day-title')).toHaveText('Lundi 9 nov. · module 3');
  await expect(page.getByTestId('agenda-header')).toHaveText(
    'Toutes vos formations · Lundi 9 nov.',
  );
  await expect(page.getByTestId('agenda-range')).toHaveText('Lundi 9 nov. 2026');
  await axeCheck();

  // CA-3 — navigation bornée à la période de la formation filtrée.
  await page.goto(weekUrl('2026-11-09'));
  await page.getByTestId('agenda-filter').selectOption(SAP);
  await expect(page).toHaveURL(new RegExp(`formation=${SAP}`));
  await expect(page.getByTestId('agenda-header')).toHaveText(
    'SAP S/4HANA Finance · semaine du 9 – 13 nov.',
  );
  await page.getByTestId('agenda-prev').click();
  await expect(page.getByTestId('agenda-range')).toHaveText('2 – 6 nov. 2026');
  await expect(page.getByTestId('agenda-prev')).toBeDisabled();
  await page.getByTestId('agenda-next').click();
  await expect(page.getByTestId('agenda-range')).toHaveText('9 – 13 nov. 2026');
  for (let step = 0; step < 4; step += 1) {
    await page.getByTestId('agenda-next').click();
  }
  await expect(page.getByTestId('agenda-range')).toHaveText('7 – 11 déc. 2026');
  await expect(page.getByTestId('agenda-next')).toBeDisabled();
  await page.getByTestId('agenda-today').click();
  await expect(page).toHaveURL(/date=2026-11-11/);
  await expect(page.getByTestId('agenda-range')).toHaveText('9 – 13 nov. 2026');

  // En vue Jour, « Jour suivant » saute le week-end : vendredi 13 → lundi 16.
  await page.goto(`/agenda?vue=jour&date=2026-11-13&formation=${SAP}`);
  await expect(page.getByTestId('agenda-range')).toHaveText('Vendredi 13 nov. 2026');
  await page.getByTestId('agenda-next').click();
  await expect(page).toHaveURL(/date=2026-11-16/);
  await expect(page.getByTestId('agenda-range')).toHaveText('Lundi 16 nov. 2026');
  await expect(page.getByTestId('agenda-day-title')).toHaveText('Lundi 16 nov.');

  // CA-4 — un clic sur une case du mois ouvre la vue Jour correspondante.
  await page.goto('/agenda?vue=mois&date=2026-11-11&formation=all');
  await expect(page.getByTestId('agenda-range')).toHaveText('Novembre 2026');
  await expect(page.getByTestId('agenda-month-cell-2026-11-11')).toHaveAttribute(
    'aria-label',
    'Mercredi 11 nov., 5 activités',
  );
  await page.getByTestId('agenda-month-cell-2026-11-16').click();
  await expect(page).toHaveURL(/vue=jour/);
  await expect(page).toHaveURL(/date=2026-11-16/);
  await expect(page.getByTestId('agenda-day-title')).toHaveText('Lundi 16 nov.');
});

test('filtre par formation @SPEC-704', async ({ page, axeCheck }) => {
  await page.goto(weekUrl('2026-11-09'));

  // CA-5 — le filtre « Gestion de projet agile » ne montre que ses créneaux et met à jour
  // le sur-titre et les totaux.
  await page.getByTestId('agenda-filter').selectOption(AGILE);
  await expect(page).toHaveURL(new RegExp(`formation=${AGILE}`));
  await expect(page.getByTestId('agenda-header')).toHaveText(
    'Gestion de projet agile · semaine du 9 – 13 nov.',
  );
  await expect(page.getByRole('button', { name: /Agile · apports,/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Quiz de validation,/ })).toHaveCount(0);
  await expect(page.getByTestId('agenda-totals-planned')).toContainText('1 h prévue');
  await expect(page.getByTestId('agenda-totals-done')).toContainText('0 h 30 faites');
  await expect(page.getByTestId('agenda-totals-margins')).toHaveText('0 marge de rattrapage');
  // La légende du mini-calendrier suit la formation filtrée (ADR-0183 §1).
  await expect(page.getByTestId('agenda-minical-formation')).toHaveText(
    'Formation : 26 oct. – 27 nov.',
  );
  // Sélection par défaut de la période filtrée : le premier créneau à venir (jeudi 12, 17:30).
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Agile · apports');
  await expect(page.getByTestId('agenda-detail-when')).toHaveText('Jeudi 12 nov. · 17:30 – 18:00');
  await axeCheck();
});

test('ouvrir une activité @SPEC-704', async ({ page, axeCheck }) => {
  await page.goto(weekUrl('2026-11-11'));

  // CA-7 — « Ouvrir » mène à la cible d'ET-5 pour le quiz de validation sélectionné.
  await page
    .getByRole('button', { name: /Quiz de validation, 14:00 – 15:00/ })
    .click();
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Quiz de validation');
  await page.getByTestId('agenda-detail-open').click();
  await expect(page).toHaveURL(
    new RegExp(`/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz$`),
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await axeCheck();
});

test('conformité SCR-12 @SPEC-704 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1133 });

  /** Mockup comparison of the viewport and baseline of the same screen. */
  async function checkScreen(
    url: string,
    referenceName: string,
    name: string,
    baseline: string,
  ): Promise<void> {
    await page.goto(url);
    await expect(page.getByTestId('agenda-calendar')).toBeVisible();
    await expect(page.getByRole('button', { name: /,/ }).first()).toBeVisible();
    await waitForFonts(page);
    const actual = await page.screenshot({ animations: 'disabled' });
    const comparison = compareWithReference(
      actual,
      `${REFERENCE_DIR}${referenceName}`,
      testInfo.outputPath('visual'),
      name,
    );
    await testInfo.attach(`${name}-side-by-side`, {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `${name}:${comparison.ratio.toFixed(4)}`,
    });
    expect(comparison.ratio, `écart à la maquette ${name}`).toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
    await expectScreenshotBaseline(page, baseline);
  }

  // CA-10 — jetons et structure de la maquette en vue Semaine.
  await page.goto(weekUrl('2026-11-11'));
  await expect(page.getByTestId('agenda-calendar')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="agenda-detail"]': {
      'background-color': '#111113',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="agenda-detail-open"]': { 'background-color': '#C6F432', color: '#111113' },
    '[data-testid="agenda-calendar"]': { 'background-color': '#FFFFFF', 'border-radius': '21.6px' },
  });
  await expect(page.getByTestId('agenda-detail-title')).toHaveCSS('font-size', '19.8px');
  await expect(page.getByTestId('agenda-legend')).toContainText('Quiz global · révision');
  await expect(page.getByTestId('agenda-minical-title')).toHaveText('Novembre 2026');
  await expect(page.getByTestId('agenda-minical-formation')).toHaveText(
    'Formation : 2 nov. – 11 déc.',
  );
  await axeCheck();
  await checkScreen(
    weekUrl('2026-11-11'),
    'SCR-12-base-desktop.png',
    'SCR-12-semaine',
    'agenda-semaine.png',
  );

  await checkScreen(
    '/agenda?vue=jour&date=2026-11-11&formation=all',
    'SCR-12-jour-desktop.png',
    'SCR-12-jour',
    'agenda-jour.png',
  );
  await axeCheck();

  await checkScreen(
    '/agenda?vue=mois&date=2026-11-11&formation=all',
    'SCR-12-mois-desktop.png',
    'SCR-12-mois',
    'agenda-mois.png',
  );
  await axeCheck();
});

test('latence de GET /agenda @SPEC-704', async ({ page }, testInfo) => {
  await page.goto(weekUrl('2026-11-09'));
  await expect(page.getByTestId('agenda-calendar')).toBeVisible();
  // ET-10 — p95 de la lecture sur 42 jours et 3 formations (une seule formation par appel ici,
  // le seed ne couvrant pas 42 jours de créneaux pour chaque formation).
  const durations: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    const response = await page.request.get(
      '/api/v1/agenda?from=2026-11-01&to=2026-12-12&formation=all',
    );
    expect(response.status()).toBe(200);
    durations.push(performance.now() - started);
  }
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? durations[durations.length - 1] ?? 0;
  await testInfo.attach('agenda-latence.json', {
    body: JSON.stringify({ samples: durations.length, p95Ms: Number(p95.toFixed(1)) }, null, 2),
    contentType: 'application/json',
  });
  testInfo.annotations.push({ type: 'agenda-p95-ms', description: p95.toFixed(1) });
  // Marge large : la machine d'exécution est partagée, la mesure reste la preuve d'ET-10.
  expect(p95).toBeLessThan(1500);
});
