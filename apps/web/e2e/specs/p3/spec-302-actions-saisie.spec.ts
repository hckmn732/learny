import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ACTIONS = '/_dev/ui/actions';
const SAISIE = '/_dev/ui/saisie';

async function tabUntil(
  page: Page,
  selector: string,
  max = 240,
): Promise<void> {
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      (target) => Boolean(document.activeElement?.closest(target)),
      selector,
    );
    if (focused) return;
  }
  throw new Error(`Focus introuvable après ${String(max)} tabulations : ${selector}`);
}

test('parcours clavier des contrôles @SPEC-302', async ({ page, axeCheck, consoleErrors }) => {
  await page.goto(SAISIE);

  // Onglets solid : Tab entre dans le groupe, quatre flèches droites bouclent sur le premier.
  await tabUntil(page, '[data-testid="ui-tabs-solid"]');
  const solidTabs = page.getByTestId('ui-tabs-solid');
  const selectedSolidTab = solidTabs.locator('[role="tab"][aria-selected="true"]');
  await expect(selectedSolidTab).toHaveText('Profil');
  await page.keyboard.press('ArrowRight');
  await expect(selectedSolidTab).toHaveText('Notifications');
  await page.keyboard.press('ArrowRight');
  await expect(selectedSolidTab).toHaveText('Apprentissage');
  await page.keyboard.press('ArrowRight');
  await expect(selectedSolidTab).toHaveText('Profil');
  await expect(page.locator('[data-testid="ui-tabs-solid-panel"]:not([hidden])')).toHaveText(
    'Contenu de l’onglet « Profil ».',
  );

  // Interrupteur : Espace bascule l'état.
  await tabUntil(page, '[data-testid="ui-switch-on"]');
  const switchOn = page.getByTestId('ui-switch-on');
  await expect(switchOn).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press(' ');
  await expect(switchOn).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press(' ');
  await expect(switchOn).toHaveAttribute('aria-checked', 'true');

  // Contrôle segmenté soft : flèches et extrémités.
  await tabUntil(page, '[data-testid="ui-segmented-soft"] button[aria-pressed="true"]');
  const segmented = page.getByTestId('ui-segmented-soft');
  const selectedSegment = segmented.locator('button[aria-pressed="true"]');
  await expect(selectedSegment).toHaveText(/Toutes\s*8/);
  await page.keyboard.press('ArrowRight');
  await expect(selectedSegment).toHaveText(/Non lues\s*3/);
  await page.keyboard.press('End');
  await expect(selectedSegment).toHaveText('Archivées');
  await page.keyboard.press('Home');
  await expect(selectedSegment).toHaveText(/Toutes\s*8/);

  // Formulaire : soumission vide → deux erreurs role=alert et focus sur l'e-mail.
  const form = page.getByTestId('ui-example-form');
  await form.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(form.getByRole('alert')).toHaveCount(2);
  await expect(form.getByText('Saisissez une adresse e-mail valide.')).toBeVisible();
  await expect(form.getByText('Le mot de passe doit faire 12 caractères au moins.')).toBeVisible();
  const focusedType = await page.evaluate(() => document.activeElement?.getAttribute('type'));
  expect(focusedType).toBe('email');
  await expect(form.locator('input[type="email"]')).toHaveAttribute('aria-invalid', 'true');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('styles calculés des actions et de la saisie @SPEC-302', async ({ page, axeCheck }) => {
  await page.goto(ACTIONS);

  // CA-1: six variantes, quatre tailles et leurs états sont présents.
  const variantTestIds = [
    'lime',
    'dark',
    'outline',
    'ghost',
    'danger',
    'outline-on-dark',
  ];
  for (const variant of variantTestIds) {
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      await expect(page.getByTestId(`ui-button-${variant}-${size}`)).toBeVisible();
    }
    await expect(page.getByTestId(`ui-button-${variant}-md-hover`)).toBeVisible();
    await expect(page.getByTestId(`ui-button-${variant}-md-disabled`)).toBeVisible();
    await expect(page.getByTestId(`ui-button-${variant}-md-loading`)).toBeVisible();
  }

  // Structure : les cartes de la section Actions, dans l'ordre.
  const actionCards = await page
    .locator('main section[data-testid^="ui-actions-"]')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-testid')));
  expect(actionCards).toEqual([
    'ui-actions-buttons',
    'ui-actions-icons',
    'ui-actions-links',
    'ui-actions-chips',
    'ui-actions-badges',
    'ui-actions-counts',
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Actions');
  for (const tone of [
    'neutral',
    'lime',
    'lime-soft',
    'indigo',
    'green',
    'orange',
    'violet',
    'on-dark',
    'default-model',
  ]) {
    await expect(page.getByTestId(`ui-badge-${tone}`)).toBeVisible();
  }
  await expect(page.getByTestId('ui-icon-button-light')).toBeVisible();
  await expect(page.getByTestId('ui-icon-button-dark')).toBeVisible();
  await expect(page.getByTestId('ui-chip-rounded')).toBeVisible();
  await expect(page.getByTestId('ui-chip-pill')).toBeVisible();
  await expect(page.getByTestId('ui-count-badge-lime')).toBeVisible();
  await expect(page.getByTestId('ui-count-badge-orange-on-dark')).toBeVisible();

  await expectTokens(page, {
    '[data-testid="ui-button-lime-md"]': {
      'background-color': colors.lime,
      color: colors.ink,
      'font-weight': '700',
      'border-radius': '10.8px',
      'min-height': '39.6px',
    },
    '[data-testid="ui-button-outline-md"]': {
      'border-color': colors['border-strong'],
    },
  });

  await page.goto(SAISIE);

  const saisieCards = await page
    .locator('main section[data-testid^="ui-saisie-"]')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-testid')));
  expect(saisieCards).toEqual([
    'ui-saisie-textfields',
    'ui-saisie-textarea',
    'ui-saisie-select',
    'ui-saisie-checkbox',
    'ui-saisie-choice',
    'ui-saisie-tabs',
    'ui-saisie-switches',
    'ui-saisie-segmented',
    'ui-saisie-form',
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saisie');
  await expect(page.getByTestId('ui-textfield-form')).toBeVisible();
  await expect(page.getByTestId('ui-textfield-search')).toBeVisible();
  await expect(page.getByTestId('ui-textfield-error')).toBeVisible();
  await expect(page.getByTestId('ui-switch-off')).toBeVisible();
  await expect(page.getByTestId('ui-switch-locked')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('ui-segmented-solid')).toBeVisible();
  await expect(page.getByTestId('ui-tabs-soft')).toBeVisible();

  await expectTokens(page, {
    '[data-testid="ui-textfield-form"]': {
      'border-color': colors['border-strong'],
    },
    '[data-testid="ui-switch-on"]': { 'background-color': colors.ink },
    '[data-testid="ui-switch-on"] span': { 'background-color': colors.lime },
    '[data-testid="ui-segmented-soft"]': { 'background-color': colors.canvas },
    '[data-testid="ui-segmented-soft"] button[aria-pressed="true"]': {
      'background-color': colors.surface,
    },
    '[data-testid="ui-tabs-solid"] [role="tab"][aria-selected="true"]': {
      'background-color': colors.ink,
    },
  });

  const textFieldHeight = await page
    .getByTestId('ui-textfield-form')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).height));
  // 48 mockup pixels at the 90 % scale: 43.2 px, rounded by the engine to 43.1875 px.
  expect(textFieldHeight).toBeCloseTo(43.2, 1);

  await axeCheck();
});

test('galeries actions et saisie ligne de base @SPEC-302 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(ACTIONS);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Actions');
  const actionsOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(actionsOverflow, 'défilement horizontal actions').toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-actions.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('dev-ui-actions');

  await page.goto(SAISIE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saisie');
  const saisieOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(saisieOverflow, 'défilement horizontal saisie').toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-saisie.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('dev-ui-saisie');
});
