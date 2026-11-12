import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const GALLERY = '/_dev/ui/accessibilite';

test('Socle d’accessibilité @SPEC-309', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  // Deterministic focus rings and no decorative motion in flight during axe.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(GALLERY);
  await expect(page.getByRole('heading', { level: 1, name: 'Accessibilité' })).toBeVisible();

  // CA-1: the first Tab reveals « Aller au contenu »; Enter focuses main#contenu-principal.
  const skipLink = page.getByTestId('skip-link');
  const hiddenBox = await skipLink.boundingBox();
  expect(hiddenBox?.y ?? 0, 'lien hors écran avant le focus').toBeLessThan(0);
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect
    .poll(async () => (await skipLink.boundingBox())?.y ?? -1, {
      message: 'lien visible au focus',
    })
    .toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  const main = page.getByTestId('main-content');
  await expect(main).toBeFocused();
  await expect(main).toHaveAttribute('id', 'contenu-principal');

  // CA-2: dialogue and menu keep a valid keyboard order and return focus to their trigger.
  const focusTrigger = page.getByTestId('a11y-focus-trigger');
  await focusTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('a11y-focus-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('a11y-focus-dialog')).toBeHidden();
  await expect(focusTrigger).toBeFocused();

  const menuTrigger = page.getByTestId('a11y-menu-trigger');
  await menuTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('a11y-menu-content')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('a11y-menu-content')).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  // CL-1: the trigger is removed while the dialog is open; focus falls back to the page title.
  await page.getByTestId('a11y-archive-trigger').click();
  await expect(page.getByTestId('a11y-archive-dialog')).toBeVisible();
  await page.getByTestId('a11y-archive-confirm').click();
  await expect(page.getByTestId('a11y-archive-dialog')).toBeHidden();
  await expect(page.getByTestId('a11y-archive-trigger')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

  // CL-2: the same message is not announced again on a re-render; errors are assertive.
  const polite = page.getByTestId('a11y-live-polite');
  await page.getByTestId('a11y-live-run').click();
  await expect(polite).toHaveText('Résultat chargé : 3 éléments à revoir.');
  await expect(polite).toHaveAttribute('data-announcement-count', '1');
  await page.getByTestId('a11y-live-repeat').click();
  await expect(polite).toHaveAttribute('data-announcement-count', '1');
  const assertive = page.getByTestId('a11y-live-assertive');
  await page.getByTestId('a11y-live-error').click();
  await expect(assertive).toHaveText('La synchronisation a échoué. Réessayez.');
  await expect(assertive).toHaveAttribute('role', 'alert');
  await expect(assertive).toHaveAttribute('aria-live', 'assertive');

  // The error state exposes a named retry that announces its result.
  await page
    .getByTestId('a11y-state-error')
    .getByRole('button', { name: 'Réessayer' })
    .click();
  await expect(polite).toHaveText('Nouvelle tentative effectuée : les données sont à jour.');

  // CA-4: reduced motion freezes the decorative pulse.
  const animationDuration = await page
    .getByTestId('a11y-motion-demo')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(parseFloat(animationDuration), 'durée de l’animation réduite').toBeLessThanOrEqual(0.01);

  // CA-4: 200 % and 400 % browser zoom are approximated by halving/quartering the CSS viewport.
  for (const viewport of [
    { width: 720, height: 450 },
    { width: 360, height: 225 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `défilement horizontal à ${String(viewport.width)} px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // CA-5: keyboard focus remains visible on a named control.
  const control = page.getByTestId('a11y-control-input');
  await control.focus();
  await expect(control).toBeFocused();

  await axeCheck();
  await captureEvidence('spec-309-accessibilite');
  expect(consoleErrors).toEqual([]);
});

test('Socle d’accessibilité @SPEC-309 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto(GALLERY);

  await expect(page.getByRole('heading', { level: 1, name: 'Accessibilité' })).toBeVisible();
  await expect(page.locator('[data-testid^="a11y-contrast-"]')).toHaveCount(15);
  await expect(page.getByTestId('a11y-control-button')).toHaveText('Action visible');
  await expect(page.getByTestId('a11y-control-icon')).toHaveAttribute(
    'aria-label',
    'Fermer l’aperçu',
  );

  // CA-3: the visible token pairs render the exact catalogue colours.
  await expectTokens(page, {
    '[data-testid="a11y-contrast-ink-on-surface"]': {
      color: colors.ink,
      'background-color': colors.surface,
    },
    '[data-testid="a11y-contrast-lime-on-ink"]': {
      color: colors.lime,
      'background-color': colors.ink,
    },
    '[data-testid="a11y-control-button"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
  });

  // CA-4: no horizontal overflow at the project viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(1);

  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-accessibilite.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
