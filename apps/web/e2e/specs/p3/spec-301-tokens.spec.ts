import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const GALLERY = '/_dev/ui/jetons';
const SECTIONS = [
  'tokens-colors',
  'tokens-typography',
  'tokens-radii',
  'tokens-shadows',
  'tokens-spacing',
  'tokens-controls',
];
const HEADINGS = [
  'Couleurs',
  'Typographie',
  'Rayons',
  'Ombres',
  'Espacements',
  'Hauteurs de contrôles',
];
const SWATCHES = [
  'canvas',
  'surface',
  'surface-subtle',
  'ink',
  'lime',
  'indigo',
  'orange',
  'green',
  'danger',
  'dark-850',
] as const;

function swatchSelector(name: string): string {
  return `[data-testid="swatch-${name}"] span[aria-hidden="true"]`;
}

test('galerie des jetons conforme @SPEC-301', async ({
  page,
  request,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const remoteFonts: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
  });

  await page.goto(GALLERY);

  // BR-NAV-06 / CA-1: 90 % root and a 34 mockup-pixel title rendered at 30.6 px.
  await expect(page.locator('html')).toHaveCSS('font-size', '14.4px');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText('Jetons');
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.getByText('Galerie du design system', { exact: true }).first()).toBeVisible();

  // CA-5: the six sections, in order.
  const sectionIds = await page
    .locator('main section[data-testid^="tokens-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(sectionIds).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-2: all 60 swatches, with visible names and exact values.
  await expect(page.locator('[data-testid^="swatch-"]')).toHaveCount(
    Object.keys(colors).length,
  );
  for (const name of SWATCHES) {
    const swatch = page.getByTestId(`swatch-${name}`);
    await expect(swatch).toContainText(name);
    await expect(swatch).toContainText(colors[name]);
  }

  // CA-5: computed colours equal the tokens for ten representative swatches.
  await expectTokens(
    page,
    Object.fromEntries(
      SWATCHES.map((name) => [swatchSelector(name), { 'background-color': colors[name] }]),
    ),
  );
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    [swatchSelector('canvas')]: { 'background-color': colors.canvas },
  });

  // Typography, radii, shadows, spacing and control heights are all rendered.
  await expect(page.locator('[data-testid^="type-"]')).toHaveCount(22);
  await expect(page.locator('[data-testid^="radius-"]')).toHaveCount(20);
  await expect(page.locator('[data-testid^="shadow-"]')).toHaveCount(8);
  await expect(page.locator('[data-testid^="spacing-"]')).toHaveCount(22);
  await expect(page.locator('[data-testid^="control-"]')).toHaveCount(12);
  await expect(page.getByTestId('type-34')).toContainText(
    'text-34 · 2.125rem',
  );

  // CL-6: no horizontal scroll at the mobile viewport (and none on desktop either).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);

  // CA-6: self-hosted fonts, no runtime request to Google.
  expect(remoteFonts).toEqual([]);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  // EF-11: the validated SDD URL redirects with 307 to the gallery.
  const redirect = await request.get('/_dev/sdd/SPEC-301', { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers()['location']).toContain(GALLERY);

  await axeCheck();
  await captureEvidence('spec-301-gallery');
  expect(consoleErrors).toEqual([]);
});

test('galerie fermée sans drapeau @SPEC-301', async () => {
  const port = 3111;
  const server = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(port)],
    {
      cwd: ROOT,
      env: { ...process.env, ENABLE_SDD_PAGES: 'false', APP_ENV: 'test' },
      stdio: 'ignore',
      detached: true,
    },
  );

  try {
    await expect
      .poll(
        async () =>
          (await fetch(`http://127.0.0.1:${String(port)}/api/v1/health`).catch(() => null))
            ?.status,
        { timeout: 30000 },
      )
      .toBe(200);

    for (const route of ['/_dev/ui', GALLERY, '/_dev/sdd/SPEC-301']) {
      const response = await fetch(`http://127.0.0.1:${String(port)}${route}`);
      expect(response.status, route).toBe(404);
      const html = await response.text();
      expect(html, route).not.toContain('Galerie du design system');
      expect(html, route).not.toContain('tokens-colors');
    }
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
});

test('galerie des jetons ligne de base @SPEC-301 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto(GALLERY);

  const sectionIds = await page
    .locator('main section[data-testid^="tokens-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(sectionIds).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jetons');
  await expect(page.locator('[data-testid^="swatch-"]')).toHaveCount(
    Object.keys(colors).length,
  );
  await expect(page.locator('html')).toHaveCSS('font-size', '14.4px');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'dev-ui-jetons.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
