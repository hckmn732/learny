import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const SECTIONS = [
  'spec-011-jobs',
  'spec-011-security',
  'spec-011-modes',
  'spec-011-artifacts',
];

const JOB_LABELS = ['Audit', 'Qualité', 'Intégration', 'E2E'];

const ARTIFACTS = [
  'audit-reports',
  'security-reports',
  'unit-reports',
  'integration-reports',
  'e2e-reports',
];

test('inspecte la matrice CI @SPEC-011', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-011');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Intégration continue');
  await expect(page.getByTestId('sdd-demo-title')).toHaveText('Intégration continue');

  const jobs = page.getByTestId('spec-011-jobs').getByRole('listitem');
  await expect(jobs).toHaveCount(4);
  for (const [index, label] of JOB_LABELS.entries()) {
    await expect(jobs.nth(index)).toContainText(label);
    await expect(jobs.nth(index)).toContainText('configurée');
  }
  const conditions = await jobs.evaluateAll((items) =>
    items.map((item) => item.textContent),
  );
  expect(conditions[0]).toContain('toujours exécuté');
  for (const condition of conditions.slice(1)) {
    expect(condition).toContain("needs.audit.outputs.has_app == 'true'");
  }
  await expect(page.getByTestId('spec-011-jobs')).toContainText('.github/workflows/ci.yml');

  const security = page.getByTestId('spec-011-security').getByRole('listitem');
  await expect(security).toHaveCount(4);
  await expect(security.nth(0)).toContainText('gitleaks');
  await expect(security.nth(0)).toContainText('configuré');
  await expect(security.nth(1)).toContainText('Analyseur intégré');
  await expect(security.nth(2)).toContainText('Titre de PR');
  await expect(security.nth(3)).toContainText('high');

  await expect(page.getByTestId('spec-011-mode-CLOCK_FIXED_AT')).toHaveText('2026-11-11T12:20:00Z');
  await expect(page.getByTestId('spec-011-mode-LLM_MODE')).toHaveText('mock');
  await expect(page.getByTestId('spec-011-mode-STRIPE_MODE')).toHaveText('mock');
  await expect(page.getByTestId('spec-011-mode-EMAIL_MODE')).toHaveText('memory');
  await expect(page.getByTestId('spec-011-mode-PUSH_MODE')).toHaveText('mock');
  await expect(page.getByTestId('spec-011-mode-ENABLE_SDD_PAGES')).toHaveText('true');

  const artifacts = page.getByTestId('spec-011-artifacts').getByRole('row');
  await expect(artifacts).toHaveCount(ARTIFACTS.length + 1);
  for (const name of ARTIFACTS) {
    await expect(page.getByTestId(`spec-011-artifact-${name}`)).toContainText(name);
    await expect(page.getByTestId(`spec-011-artifact-${name}`)).toContainText('oui');
  }

  // No remote run is claimed: only repository paths, never a fictitious Actions URL.
  const html = await page.content();
  expect(html).not.toContain('/actions/runs/');
  expect(html).not.toContain('github.com/hckmn732/learny/actions');

  await axeCheck();
  await captureEvidence('spec-011-final');
  expect(consoleErrors).toEqual([]);
});

test('matrice CI conforme @SPEC-011 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto('/_dev/sdd/SPEC-011');

  const ids = await page
    .locator('section[data-testid^="spec-011-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Matrice des jobs',
    'Contrôles de sécurité',
    'Modes de test et horloge',
    'Artefacts',
  ]);

  const labels = await page
    .getByTestId('spec-011-jobs')
    .getByRole('listitem')
    .evaluateAll((items) => items.map((item) => item.querySelector('.font-semibold')?.textContent));
  expect(labels).toEqual(JOB_LABELS);

  await expectTokens(page, {
    '[data-testid="spec-011-jobs"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-011-artifacts"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await axeCheck();
  await captureEvidence('spec-011-demo-desktop');
  await expectScreenshotBaseline(page, 'spec-011-demo.png', { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  await axeCheck();
  await captureEvidence('spec-011-demo-mobile');
  await expectScreenshotBaseline(page, 'spec-011-demo-mobile.png', { fullPage: true });
});
