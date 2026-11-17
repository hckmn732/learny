import { randomUUID } from 'node:crypto';

import { LEGAL_VERSIONS } from '@learny/config';
import { closeDb, serviceDb, sql } from '@learny/db';
import { extractAuthLink, linkOnOrigin, waitForMail } from '@learny/testing/auth';
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const FIXED_ISO = '2026-11-11T12:20:00.000Z';
const FOOTER_LINKS = [
  'CGU',
  'Confidentialité',
  'Mentions légales',
  'Accessibilité : partiellement conforme',
];
const PAGES = [
  {
    path: '/legal/cgu',
    key: 'cgu',
    title: 'Conditions générales d’utilisation',
    anchor: 'Objet et acceptation',
    sections: 9,
  },
  {
    path: '/legal/confidentialite',
    key: 'confidentialite',
    title: 'Politique de confidentialité',
    anchor: 'Responsable du traitement',
    sections: 9,
  },
  {
    path: '/legal/mentions',
    key: 'mentions',
    title: 'Mentions légales',
    anchor: 'Éditeur du service',
    sections: 7,
  },
] as const;

test.afterAll(async () => {
  await closeDb();
});

test('consulte et accepte les textes légaux @SPEC-806', async ({
  page,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const email = `sdd-806-${randomUUID().slice(0, 8)}@test.learny.test`;

  await page.goto('/inscription');
  await expect(page.getByTestId('auth-terms')).not.toBeChecked();

  // CA-1 — the auth page already carries the four footer links in the ADR-0204 order.
  const footer = page.getByTestId('site-footer');
  await expect(footer.getByRole('navigation', { name: 'Informations légales' })).toBeVisible();
  await expect(footer.getByRole('link')).toHaveText(FOOTER_LINKS);

  // CA-1 — follow the CGU link as an anonymous visitor: no redirect, version and anchored TOC.
  await footer.getByRole('link', { name: 'CGU' }).click();
  await expect(page).toHaveURL(`${origin}/legal/cgu`);
  await expect(page.getByTestId('legal-title')).toHaveText(PAGES[0].title);
  await expect(page.getByTestId('legal-version')).toContainText('Version');
  await expect(page.getByTestId('legal-version')).toContainText('En vigueur le');
  await expect(page.getByTestId('legal-content').locator('section')).toHaveCount(PAGES[0].sections);
  await expect(page.getByTestId('legal-toc').getByRole('link')).toHaveCount(PAGES[0].sections);

  // A deep link moves to the right section and the target is visible in the viewport.
  await page.getByTestId('legal-toc').getByRole('link', { name: PAGES[0].anchor }).click();
  await expect(page).toHaveURL(`${origin}/legal/cgu#objet`);
  await expect(page.locator('#objet')).toBeInViewport();
  await captureEvidence('legal-cgu-consultation');

  // CA-1 — the two other documents are reachable from the public footer without a session.
  await page.getByTestId('site-footer').getByRole('link', { name: 'Confidentialité' }).click();
  await expect(page).toHaveURL(`${origin}/legal/confidentialite`);
  await expect(page.getByTestId('legal-title')).toHaveText(PAGES[1].title);
  await page.getByTestId('site-footer').getByRole('link', { name: 'Mentions légales' }).click();
  await expect(page).toHaveURL(`${origin}/legal/mentions`);
  await expect(page.getByTestId('legal-title')).toHaveText(PAGES[2].title);
  await page.getByTestId('site-footer').getByRole('link', { name: /Accessibilité/ }).click();
  await expect(page).toHaveURL(`${origin}/accessibilite`);
  await expect(page.getByTestId('accessibility-status')).toContainText('Partiellement conforme');
  await axeCheck();

  // CA-2 — the sign-up case stays unchecked; an absent acceptance is refused before any account.
  await page.goto('/inscription');
  await expect(page.getByTestId('auth-terms')).not.toBeChecked();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toHaveText(
    'Acceptez les conditions pour créer votre compte.',
  );
  const before = await serviceDb().execute<{ count: number }>(
    sql`select count(*)::int as count from auth.users where email = ${email}`,
  );
  expect(before[0]?.count).toBe(0);

  // CA-2 — a valid acceptance creates the account, then two exact rows once the mail is verified.
  await page.getByTestId('auth-terms').check();
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(`${origin}/verifier-email`);
  await captureEvidence('legal-acceptation-case');
  const mail = await waitForMail(email);
  await page.goto(linkOnOrigin(extractAuthLink(mail), origin));
  await expect(page).toHaveURL(`${origin}/premiers-pas/profil`);

  const rows = await serviceDb().execute<{
    document: string;
    version: string;
    accepted_at: Date | string;
  }>(sql`
    select la.document::text as document, la.version, la.accepted_at
    from public.legal_acceptances la
    join public.profiles p on p.id = la.user_id
    where p.email = ${email}
    order by la.document
  `);
  expect(rows.map((row) => row.document)).toEqual(['cgu', 'privacy']);
  expect(rows.map((row) => row.version)).toEqual([LEGAL_VERSIONS.cgu, LEGAL_VERSIONS.privacy]);
  expect(new Set(rows.map((row) => new Date(row.accepted_at).toISOString()))).toEqual(new Set([FIXED_ISO]));

  await axeCheck();
});

test('pages légales conformes @SPEC-806 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  for (const legal of PAGES) {
    await page.goto(legal.path);
    await expect(page.getByTestId('legal-title')).toHaveText(legal.title);
    await expect(page.getByTestId('legal-version')).toContainText('Version');
    await expect(page.getByTestId('legal-content').locator('section')).toHaveCount(legal.sections);
    await expect(page.getByTestId('legal-toc').getByRole('link')).toHaveCount(legal.sections);
    await expect(page.getByTestId('site-footer')).toBeVisible();
    await expect(page.getByTestId('site-footer').getByRole('link')).toHaveText(FOOTER_LINKS);

    await expectTokens(page, {
      body: { 'background-color': '#F4F4F1', color: '#111113' },
      '[data-testid="legal-title"]': { color: '#111113' },
      '[data-testid="legal-content"] section': {
        'background-color': '#FFFFFF',
        'border-top-color': '#E7E6E1',
        'border-top-left-radius': '21.6px',
      },
      '[data-testid="site-footer"]': { 'border-top-color': '#E7E6E1' },
    });
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
    await expect(page.getByTestId('legal-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);
    await expect(page.getByTestId('legal-title')).toHaveCSS('font-size', '30.6px');

    // The table of contents precedes the content in reading order (mobile stacks it first).
    const follows = await page.evaluate(() => {
      const toc = document.querySelector('[data-testid="legal-toc"]');
      const content = document.querySelector('[data-testid="legal-content"]');
      return (
        toc !== null &&
        content !== null &&
        (toc.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
    });
    expect(follows).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await axeCheck();
    await captureEvidence(`legal-${legal.key}`);
    await expectScreenshotBaseline(page, `legal-${legal.key}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  }
});
