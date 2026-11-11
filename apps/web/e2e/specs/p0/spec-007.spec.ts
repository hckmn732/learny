import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-11-11T12:20:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

async function launch(page: Page, runId: string, value: string) {
  await page.getByLabel('Identifiant d’exécution (runId)').fill(runId);
  await page.getByLabel('Valeur').fill(value);
  await page.getByRole('button', { name: 'Lancer le job de démonstration' }).click();
}

const step = (page: Page, name: string) => page.getByTestId(`spec-007-step-${name}`);

test('exécute un job SDD @SPEC-007', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-007');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jobs durables');
  await expect(page.getByTestId('spec-007-registry')).toHaveText(
    'Registre partagé : sdd-demo-job — 3 reprises au plus',
  );
  await expect(step(page, 'validate-input')).toHaveText('validate-input — En attente');
  await expect(step(page, 'persist-result')).toHaveText('persist-result — En attente');
  await expect(page.getByTestId('spec-007-result-body')).toHaveText(
    'Aucun résultat pour l’instant.',
  );

  // Hold the request to observe the processing state: button disabled, first step running.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/_dev/demo-job', async (route) => {
    await held;
    await route.continue();
  });

  await launch(page, 'sdd-demo-001', '4');
  const submit = page.getByTestId('spec-007-submit');
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText('Traitement en cours…');
  await expect(step(page, 'validate-input')).toHaveText('validate-input — En cours');
  await expect(step(page, 'persist-result')).toHaveText('persist-result — En attente');
  await page.screenshot({ path: test.info().outputPath('spec-007-en-cours.png'), fullPage: true });
  release();

  await expect(step(page, 'validate-input')).toHaveText('validate-input — Terminée');
  await expect(step(page, 'persist-result')).toHaveText('persist-result — Terminée');
  await expect(page.getByTestId('spec-007-run-label')).toHaveText('Exécution sdd-demo-001');
  await expect(page.getByTestId('spec-007-doubled')).toHaveText('8');
  await expect(page.getByTestId('spec-007-result')).toContainText('sdd-demo-001');
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('spec-007-resultat.png'), fullPage: true });

  // A second delivery of the same runId returns the stored result.
  await page.unrouteAll();
  await launch(page, 'sdd-demo-001', '4');
  await expect(page.getByTestId('spec-007-doubled')).toHaveText('8');

  // No signing key reaches the browser.
  expect(await page.content()).not.toMatch(/signkey|INNGEST_SIGNING_KEY/);
});

test('signale les échecs sans détail technique @SPEC-007', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-007');
  const result = page.getByTestId('spec-007-result-body');

  await launch(page, 'sdd-demo-conflit', '3');
  await expect(page.getByTestId('spec-007-doubled')).toHaveText('6');
  await launch(page, 'sdd-demo-conflit', '5');
  await expect(step(page, 'validate-input')).toHaveText('validate-input — Échec');
  await expect(step(page, 'persist-result')).toHaveText('persist-result — En attente');
  await expect(result).toHaveText(
    'Échec du job : Conflit : ce runId a déjà été utilisé avec une autre valeur.',
  );

  await launch(page, ' ', '4');
  await expect(result).toHaveText(
    'Échec du job : Entrée invalide : runId non vide et valeur entière bornée.',
  );
  await expect(step(page, 'validate-input')).toHaveText('validate-input — En attente');

  await page.route('**/api/v1/_dev/demo-job', (route) =>
    route.fulfill({ status: 502, body: 'upstream ECONNREFUSED 10.0.0.1:8288' }),
  );
  await launch(page, 'sdd-demo-002', '4');
  await expect(result).toHaveText('Lancement impossible. Réessayez.');
  await expect(result).not.toContainText('ECONNREFUSED');
});

test('démonstration des jobs conforme @SPEC-007 @visual', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-007');
  await launch(page, 'sdd-demo-001', '4');
  await expect(page.getByTestId('spec-007-doubled')).toHaveText('8');

  const ids = await page
    .locator('[data-testid^="spec-007-"]:is(section)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(['spec-007-hosts', 'spec-007-run', 'spec-007-steps', 'spec-007-result']);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Hôtes',
    'Lancer le job',
    'Étapes',
    'Résultat',
  ]);
  await expect(page.getByTestId('spec-007-hosts').getByRole('listitem')).toHaveText([
    'webAdaptateur : inngest/next (Next.js)Point d’entrée : POST /api/inngest',
    'workerAdaptateur : inngest/hono (Hono)Point d’entrée : POST /api/inngest, GET /health',
  ]);
  await expect(page.getByTestId('spec-007-steps').getByRole('listitem')).toHaveText([
    'validate-input — Terminée',
    'persist-result — Terminée',
  ]);
  await expect(page.getByTestId('spec-007-steps').locator('ol')).toHaveAttribute(
    'aria-live',
    'polite',
  );

  // Tokens (expectTokens arrives with SPEC-004): border, radius and text colour.
  const card = page.getByTestId('spec-007-result');
  await expect(card).toHaveCSS('border-top-color', 'rgb(231, 230, 225)');
  await expect(card).toHaveCSS('border-top-left-radius', '16px');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 17, 19)');
  await expect(page.getByTestId('spec-007-submit')).toHaveCSS(
    'background-color',
    'rgb(17, 17, 19)',
  );

  const axe = await new AxeBuilder({ page }).analyze();
  const blocking = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking.map((v) => v.id)).toEqual([]);

  await expect(page).toHaveScreenshot('spec-007-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('spec-007-demo-mobile.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
