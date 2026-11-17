// Accessibility inventory of SPEC-803 ET-1: the complete responsive matrix of SPEC-802 plus the
// dynamic states that only exist after an interaction (form errors, confirmation dialogs) and the
// public accessibility declaration. Each state is audited in desktop and mobile by a11y-audit.
import type { Page } from '@playwright/test';

import { buildResponsiveMatrix, type MatrixEntry, type MatrixExtras } from './responsive-matrix';

const SETUP_TIMEOUT = 10_000;

async function openDialog(page: Page, trigger: string, dialog: string): Promise<void> {
  await page.getByTestId(trigger).click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId(dialog).waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function connexionError(page: Page): Promise<void> {
  await page.getByTestId('auth-method-password').click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('auth-email').fill('alex@test.learny.test');
  await page.getByTestId('auth-submit').click({ timeout: SETUP_TIMEOUT });
  await page.getByTestId('auth-error').waitFor({ state: 'visible', timeout: SETUP_TIMEOUT });
}

async function accountDeletionDialog(page: Page): Promise<void> {
  await openDialog(page, 'account-delete', 'account-delete-dialog');
}

async function exportDialog(page: Page): Promise<void> {
  await openDialog(page, 'data-export', 'data-export-dialog');
}

/** Full audit list: `id` is stable and names the screen family or the opened state. */
export function buildA11yInventory(extras: MatrixExtras = {}): MatrixEntry[] {
  return [
    ...buildResponsiveMatrix(extras),
    {
      id: 'SCR-20/accessibilite',
      route: '/accessibilite',
      user: 'anonymous',
    },
    {
      id: 'SCR-01/connexion-erreur',
      route: '/connexion',
      user: 'anonymous',
      setup: connexionError,
    },
    {
      id: 'SCR-15/export-donnees',
      route: '/parametres#profil',
      user: 'demo',
      setup: exportDialog,
    },
    {
      id: 'SCR-15/suppression-compte',
      route: '/parametres#profil',
      user: 'demo',
      setup: accountDeletionDialog,
    },
  ];
}
