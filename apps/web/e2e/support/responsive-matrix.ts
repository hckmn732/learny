// Inventory of the responsive matrix (SPEC-802 ET-3, EF-1). Every connected entry uses the
// demonstration learner Alex; the two anonymous screens are the public entry points.
import type { Page } from '@playwright/test';

import { demoChapterId, demoFormationId, demoId, demoModuleId } from '@learny/db/seed/fixtures';

export interface ResponsiveWidth {
  name: string;
  width: number;
  height: number;
}

/** Six widths of BR-PLA-02; heights follow the spec (ET-3, EF-1). */
export const RESPONSIVE_WIDTHS: readonly ResponsiveWidth[] = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

export type MatrixUser = 'demo' | 'anonymous';

export interface MatrixEntry {
  id: string;
  route: string;
  user: MatrixUser;
  setup?: (page: Page) => Promise<void>;
}

export interface MatrixExtras {
  invitationCode?: string | undefined;
  quizAttemptId?: string | undefined;
  examAttemptId?: string | undefined;
  examResultId?: string | undefined;
}

/** A setup step that does not open its panel fails fast instead of eating the width budget. */
const SETUP_TIMEOUT = 10_000;
const SAP = demoFormationId('sap');
const AGILE = demoFormationId('agile');

async function openMenu(page: Page): Promise<void> {
  // From 900 px the menu is a permanent column (SPEC-304): nothing to open.
  if ((page.viewportSize()?.width ?? 0) >= 900) return;
  await page.getByTestId('sidebar-show').click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function openNotifications(page: Page): Promise<void> {
  await page.getByTestId('header-notifications').click({ timeout: SETUP_TIMEOUT });
  await page
    .getByTestId('notification-panel')
    .waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function openAccount(page: Page): Promise<void> {
  await page.getByTestId('header-account-trigger').click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('account-menu').waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function openTutor(page: Page): Promise<void> {
  await page.getByTestId('tutor-open').click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('tutor-panel').waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function openGraphDetail(page: Page): Promise<void> {
  const gap = page.getByTestId('graph-gap-item').first();
  await gap.click({ timeout: SETUP_TIMEOUT });
  await page
    .getByTestId('graph-detail')
    .first()
    .waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

export function buildResponsiveMatrix(extras: MatrixExtras = {}): MatrixEntry[] {
  const entries: MatrixEntry[] = [
    // SCR-01 — public entry points.
    { id: 'SCR-01/inscription', route: '/inscription', user: 'anonymous' },
    { id: 'SCR-01/connexion', route: '/connexion', user: 'anonymous' },
    { id: 'SCR-01/verification', route: '/verifier-email', user: 'anonymous' },

    // SCR-02 — onboarding steps; Alex has finished onboarding, so every step is reachable.
    ...(['profil', 'rythme', 'ia', 'rappels', 'depart'] as const).map((step): MatrixEntry => ({
      id: `SCR-02/${step}`,
      route: `/premiers-pas/${step}`,
      user: 'demo',
    })),

    // SCR-03 — home and shell states.
    { id: 'SCR-03/accueil', route: '/accueil', user: 'demo' },
    { id: 'SCR-03/menu', route: '/accueil', user: 'demo', setup: openMenu },
    {
      id: 'SCR-03/notifications',
      route: '/accueil',
      user: 'demo',
      setup: openNotifications,
    },
    { id: 'SCR-03/compte', route: '/accueil', user: 'demo', setup: openAccount },

    // SCR-04 to SCR-09.
    { id: 'SCR-04/nouvelle', route: '/formations/nouvelle', user: 'demo' },
    { id: 'SCR-04/cadrage', route: `/formations/${SAP}/cadrage`, user: 'demo' },
    { id: 'SCR-05/programme', route: `/formations/${SAP}/programme`, user: 'demo' },
    {
      id: 'SCR-06/module',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 1)}`,
      user: 'demo',
    },
    {
      id: 'SCR-07/cours',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/cours?chapitre=${demoChapterId('sap', 1, 1)}`,
      user: 'demo',
    },
    {
      id: 'SCR-07/tuteur',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/cours?chapitre=${demoChapterId('sap', 1, 1)}`,
      user: 'demo',
      setup: openTutor,
    },
    {
      id: 'SCR-08/exercice',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/exercices/${demoId('activity', 'exercise')}`,
      user: 'demo',
    },
    {
      id: 'SCR-09/quiz',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz`,
      user: 'demo',
    },
    {
      id: 'SCR-09/remediation',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/remediation`,
      user: 'demo',
    },

    // SCR-10 to SCR-14.
    { id: 'SCR-10/quiz-global', route: `/formations/${SAP}/quiz-global`, user: 'demo' },
    { id: 'SCR-11/introduction', route: `/formations/${SAP}/examen-blanc`, user: 'demo' },
    { id: 'SCR-12/agenda', route: '/agenda', user: 'demo' },
    { id: 'SCR-12/semaine', route: '/agenda?vue=semaine&date=2026-11-11', user: 'demo' },
    { id: 'SCR-12/mois', route: '/agenda?vue=mois&date=2026-11-11', user: 'demo' },
    { id: 'SCR-13/lacunes', route: `/formations/${SAP}/lacunes`, user: 'demo' },
    { id: 'SCR-14/carte', route: `/formations/${SAP}/carte`, user: 'demo' },
    {
      id: 'SCR-14/detail',
      route: `/formations/${SAP}/carte`,
      user: 'demo',
      setup: openGraphDetail,
    },

    // SCR-15 to SCR-20.
    { id: 'SCR-15/profil', route: '/parametres#profil', user: 'demo' },
    { id: 'SCR-15/notifications', route: '/parametres#notifications', user: 'demo' },
    { id: 'SCR-15/automatismes', route: '/parametres#automatismes', user: 'demo' },
    { id: 'SCR-15/modeles', route: '/parametres#modeles', user: 'demo' },
    { id: 'SCR-16/bilan', route: `/formations/${SAP}/bilan`, user: 'demo' },
    { id: 'SCR-17/groupe', route: `/formations/${AGILE}/groupe`, user: 'demo' },
    { id: 'SCR-18/recherche', route: '/recherche?q=compte', user: 'demo' },
    { id: 'SCR-20/introuvable', route: '/cette-page-nexiste-pas', user: 'demo' },
    { id: 'SCR-20/hors-ligne', route: '/hors-ligne', user: 'anonymous' },
    { id: 'SCR-20/acces-refuse', route: '/acces-refuse', user: 'anonymous' },
  ];

  if (extras.quizAttemptId !== undefined) {
    entries.push({
      id: 'SCR-09/resultat',
      route: `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz/${extras.quizAttemptId}/resultat`,
      user: 'demo',
    });
  }
  if (extras.examAttemptId !== undefined) {
    entries.push({
      id: 'SCR-11/epreuve',
      route: `/formations/${SAP}/examen-blanc/${extras.examAttemptId}`,
      user: 'demo',
    });
  }
  if (extras.examResultId !== undefined) {
    entries.push({
      id: 'SCR-11/resultats',
      route: `/formations/${SAP}/examen-blanc/${extras.examResultId}`,
      user: 'demo',
    });
  }
  if (extras.invitationCode !== undefined) {
    entries.push({
      id: 'SCR-17/invitation',
      route: `/invitation/${extras.invitationCode}`,
      user: 'demo',
    });
  }

  return entries;
}
