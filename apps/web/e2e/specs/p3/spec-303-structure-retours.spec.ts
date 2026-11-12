import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const STRUCTURE = '/_dev/ui/structure';
const RETOURS = '/_dev/ui/retours';

test('menus et dialogues au clavier @SPEC-303', async ({ page, axeCheck, consoleErrors }) => {
  // Deterministic axe colors: no entrance animation may be in flight (CL-6, ADR-0138).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(RETOURS);

  // Menu de compte : ouverture au clavier, parcours, axe menu ouvert, Échap (CL-1). The first
  // Enter may land before hydration on a slow runner; retry the key until the menu responds.
  const menuTrigger = page.getByTestId('ui-menu-trigger');
  const menu = page.getByTestId('ui-menu-content');
  await expect(async () => {
    await menuTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await axeCheck();
  await expectTokens(page, {
    '[data-testid="ui-menu-content"]': { 'border-radius': '16.2px' },
  });
  await expect(menu).toHaveCSS('box-shadow', /rgba\(17, 17, 19, 0\.14\)/);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  // Panneau : ouverture, Échap, focus rendu (EF-6).
  const popoverTrigger = page.getByTestId('ui-popover-trigger');
  await popoverTrigger.click();
  const popover = page.getByTestId('ui-popover-content');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveCSS('border-radius', '18px');
  await expect(popover).toHaveCSS('box-shadow', /rgba\(17, 17, 19, 0\.16\)/);
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(popoverTrigger).toBeFocused();

  // Dialogue : focus piégé, axe ouvert, Échap, focus rendu (CL-2).
  const dialogTrigger = page.getByTestId('ui-dialog-trigger');
  await dialogTrigger.click();
  const dialog = page.getByTestId('ui-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reporter la séance' })).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="ui-dialog"]')),
    );
    expect(inside, `focus hors du dialogue après ${String(index + 1)} tabulations`).toBe(true);
  }
  await axeCheck();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(dialogTrigger).toBeFocused();

  // AlertDialog destructif : focus Annuler, confirmation, focus rendu (EF-9).
  const alertTrigger = page.getByTestId('ui-alert-dialog-trigger');
  await alertTrigger.click();
  const alert = page.getByTestId('ui-alert-dialog');
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('heading', { name: 'Archiver cette formation ?' })).toBeVisible();
  await expect(page.getByTestId('ui-alert-dialog-cancel')).toBeFocused();
  await expect(alert.locator('span.bg-orange')).toHaveCount(1);
  await axeCheck();
  await page.getByTestId('ui-alert-dialog-confirm').click();
  await expect(alert).toBeHidden();
  await expect(alertTrigger).toBeFocused();

  // Infobulle : visible au focus clavier (EF-11). Retry the focus: a closed alert dialog may
  // restore focus asynchronously on slower CI runners.
  await expect(async () => {
    await page.getByTestId('ui-tooltip-trigger').focus();
    await expect(page.getByTestId('ui-tooltip-content')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });

  // Toasts : erreur assertive puis pile de trois au plus (CA-4, CL-8).
  await page.getByTestId('ui-toast-trigger-error').click();
  await expect(page.getByTestId('ui-toast-error')).toBeVisible();
  await expect(page.locator('[role="status"][aria-live="assertive"]')).toContainText(
    'La synchronisation a échoué',
  );
  await page.getByTestId('ui-toast-trigger-four').click();
  await expect(
    page.locator(
      '[data-testid="ui-toast-neutral"], [data-testid="ui-toast-success"], [data-testid="ui-toast-error"]',
    ),
  ).toHaveCount(3);

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('styles de structure @SPEC-303', async ({ page, axeCheck, consoleErrors }) => {
  await page.goto(STRUCTURE);

  await expect(page.getByRole('heading', { level: 1, name: 'Structure' })).toBeVisible();
  for (const testId of [
    'ui-card-default',
    'ui-card-dark',
    'ui-card-lime',
    'ui-card-subtle',
    'ui-stat-dark',
    'ui-stat-light',
    'ui-progress-orange',
    'ui-progress-lime',
    'ui-progress-indigo',
    'ui-progress-teal',
    'ui-progress-ring',
    'ui-avatar',
    'ui-breadcrumb',
    'ui-page-header',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible();
  }

  // Jetons calculés de la section 10.
  await expectTokens(page, {
    '[data-testid="ui-stat-dark"]': { 'background-color': colors.ink },
    '[data-testid="ui-stat-dark"] span:first-child': {
      color: colors.lime,
      'font-size': '30.6px',
    },
    '[data-testid="ui-card-default"]': {
      'border-color': colors.border,
      'border-radius': '21.6px',
    },
    '[data-testid="ui-progress-ring"] circle:first-child': { stroke: colors['indigo-soft'] },
    '[data-testid="ui-progress-ring"] circle:nth-child(2)': { stroke: colors.indigo },
    '[data-testid="ui-avatar"]': { 'background-color': colors.indigo },
    '[data-testid="ui-breadcrumb"]': { color: colors['ink-muted'], 'font-size': '12.6px' },
  });
  await expect(page.getByTestId('ui-stat-dark').locator('span').first()).toHaveCSS(
    'font-family',
    /Space Grotesk/,
  );
  await expect(page.getByTestId('ui-progress-ring')).toHaveAttribute(
    'aria-label',
    'Notions retenues à 1 mois : 86 %',
  );
  await expect(page.getByTestId('ui-progress-ring')).toContainText('86 %');
  await expect(page.getByTestId('ui-avatar')).toHaveText('AP');

  // Fil d'Ariane, dans l'ordre, dernier élément aria-current (CA-1).
  const breadcrumb = page.getByTestId('ui-breadcrumb');
  await expect(breadcrumb).toHaveAttribute('aria-label', "Fil d'Ariane");
  await expect(breadcrumb.getByRole('link')).toHaveText([
    'Programme',
    'Module 3 · Comptabilité générale',
  ]);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Cours');

  // En-tête de page : sur-titre puis titre.
  const header = page.getByTestId('ui-page-header');
  await expect(header.getByText('SAP S/4HANA Finance')).toBeVisible();
  await expect(header.getByRole('heading', { level: 1, name: 'Mes lacunes' })).toBeVisible();
  const eyebrowBox = await header.getByText('SAP S/4HANA Finance').boundingBox();
  const titleBox = await header.getByRole('heading', { level: 1 }).boundingBox();
  expect(eyebrowBox?.y ?? 0).toBeLessThan(titleBox?.y ?? 0);

  // Registre : 23 icônes nommées par SPEC-303, étendues à 35 par SPEC-306 (ADR-0275). La galerie
  // affiche tous les noms du registre, sans exception.
  await expect(page.locator('[data-testid^="ui-icon-"]')).toHaveCount(35);

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('galeries structure et retours @SPEC-303 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(STRUCTURE);
  await expect(page.getByRole('heading', { level: 1, name: 'Structure' })).toHaveText('Structure');
  const structureOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(structureOverflow, 'défilement horizontal structure').toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-structure.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('dev-ui-structure');

  await page.goto(RETOURS);
  await expect(page.getByRole('heading', { level: 1, name: 'Retours' })).toHaveText('Retours');
  const retoursOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(retoursOverflow, 'défilement horizontal retours').toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-retours.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await captureEvidence('dev-ui-retours');

  if (test.info().project.name === 'mobile') {
    await page.getByTestId('ui-dialog-trigger').click();
    const dialog = page.getByTestId('ui-dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeCloseTo((viewport?.width ?? 390) - 32, 0);
    const cancelBox = await page
      .getByRole('button', { name: 'Annuler' })
      .last()
      .boundingBox();
    const dialogBox = box;
    expect(cancelBox?.width ?? 0).toBeGreaterThan((dialogBox?.width ?? 0) * 0.8);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

test('menu de compte ouvert ligne de base @SPEC-303 @visual', async ({ page }) => {
  await page.goto(RETOURS);
  await page.getByTestId('ui-menu-trigger').click();
  await expect(page.getByTestId('ui-menu-content')).toBeVisible();
  await expectScreenshotBaseline(page, 'dev-ui-retours-menu-ouvert.png', {
    maxDiffPixelRatio: 0.01,
  });
});
