// SPEC-807 EF-4, CA-2, CL-2, CL-4 — the group journey, end to end, with two browser contexts and
// two real sessions. Only the accounts and the owner's formation are seeded (support/group.ts);
// the group, the invitation by code, the apports and the departure go through the product.
import type { APIResponse, Page } from '@playwright/test';

import { closeDb } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { supabaseLocalEnv } from '@learny/testing/supabase';

import { buildPdf } from '../../../../packages/services/test/support/files';

import {
  accessTokenOf,
  cleanupGroupJourney,
  openSecondContext,
  seedGroupJourney,
  signIn,
  storagePathOf,
  type GroupJourney,
} from './support/group';

let journey: GroupJourney | null = null;

test.afterEach(async () => {
  const current = journey;
  journey = null;
  await cleanupGroupJourney(current);
});

test.afterAll(async () => {
  await closeDb();
});

async function openModule(page: Page, formationId: string, moduleId: string, chapterId: string) {
  await page.goto(`/formations/${formationId}/modules/${moduleId}?chapitre=${chapterId}`);
  await expect(page.getByTestId('module-page')).toBeVisible({ timeout: 30_000 });
}

/** Drops a real PDF on the chapter through the dropzone and returns the new apport's id. */
async function depositPdf(page: Page, name: string): Promise<string> {
  await page.getByLabel('PDF', { exact: true }).setInputFiles({
    name: `${name}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(buildPdf({ pages: 2 })),
  });
  const item = page.getByTestId('resource-item').filter({ hasText: name });
  await expect(item.getByTestId('resource-status')).toHaveText(/En file|Analysé/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('module-notice')).toHaveText('Fichier ajouté.', {
    timeout: 30_000,
  });
  const id = await item.getAttribute('data-resource-id');
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id ?? '';
}

/** Full-page capture of the second context, attached like `captureEvidence`. */
async function captureEvidenceOf(target: Page, name: string): Promise<void> {
  const file = test.info().outputPath(`${name}.png`);
  await target.screenshot({ path: file, fullPage: true });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

/** CL-4 — a refused direct link: 403 problem+json, never the content nor a signed URL. */
async function expectRefused(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(403);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body = await response.text();
  expect((JSON.parse(body) as { code: string }).code).toBe('FORBIDDEN');
  expect(body).not.toMatch(/token=|\/storage\/v1\/object|%PDF/);
}

test('formation à plusieurs : invitation par code, apports privés et sortie avec copie @SPEC-807 @SPEC-724 @SPEC-111 @SPEC-206 @SPEC-607 @SPEC-602 @SPEC-606', async ({
  page,
  context,
  browser,
  request,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  test.setTimeout(180_000);
  const base = baseURL ?? 'http://127.0.0.1:3100';
  const seeded = await seedGroupJourney();
  journey = seeded;
  const { owner, member, formationId, modules } = seeded;
  const [first, second] = modules;
  if (first === undefined || second === undefined) throw new Error('programme incomplet');

  // Owner — first browser context.
  await signIn(context, page, base, owner);

  // BR-GRP-01 — the owner turns the active formation into a group and gets a LRN-XXXX code.
  await page.goto(`/formations/${formationId}/groupe`);
  await expect(page.getByTestId('group-empty')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Créer un groupe' }).click();
  await expect(
    page.getByTestId('group-code').or(page.getByTestId('group-create-error')),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('group-create-error')).toHaveCount(0);
  await expect(page.getByTestId('group-code')).toHaveText(/^LRN-[A-Z2-9]{4}$/);
  const code = (await page.getByTestId('group-code').textContent())?.trim() ?? '';
  await expect(page.getByTestId('group-member-row')).toHaveCount(1);
  await captureEvidence('journey-group-owner-created');

  // Invitee — second browser context, second session (ET-2: nothing shared with the owner's).
  const memberContext = await openSecondContext(browser, base, test.info().outputPath('member'));
  try {
    const memberPage = await memberContext.newPage();
    await signIn(memberContext, memberPage, base, member);

    // BR-GRP-02 — joins by code from the « Départ » step of the onboarding.
    await memberPage.goto('/premiers-pas/depart');
    await memberPage.getByLabel('Code ou lien d’invitation').fill(code);
    await memberPage.getByRole('button', { name: 'Rejoindre' }).click();
    await expect(memberPage.getByTestId('invite-status')).toHaveText(
      new RegExp(`Invitation acceptée : « ${seeded.title} », avec ${seeded.ownerName}\\.`),
    );

    // Shared programme (same modules) and the invitee's own progression.
    await memberPage.goto(`/formations/${formationId}/programme`);
    await expect(memberPage.getByTestId('programme-active-screen')).toBeVisible({
      timeout: 30_000,
    });
    await expect(memberPage.getByTestId('programme-module-1')).toContainText(first.title);
    await expect(memberPage.getByTestId('programme-module-2')).toContainText(second.title);
    await expect(memberPage.getByTestId('programme-module-1-status')).toHaveText('En cours');
    await expect(memberPage.getByTestId('programme-module-2-status')).toHaveText('Verrouillé');
    await captureEvidenceOf(memberPage, 'journey-group-member-programme');

    await page.goto(`/formations/${formationId}/programme`);
    await expect(page.getByTestId('programme-active-screen')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('programme-module-1')).toContainText(first.title);
    await expect(page.getByTestId('programme-module-1-status')).toContainText('Validé');
    await expect(page.getByTestId('programme-module-2-status')).toHaveText('En cours');

    // BR-GRP-03 — the group page shows only the four public fields of each member.
    await memberPage.goto(`/formations/${formationId}/groupe`);
    await expect(memberPage.getByTestId('group-member-row')).toHaveCount(2);
    const ownerRow = memberPage
      .getByTestId('group-member-row')
      .filter({ hasText: seeded.ownerName });
    const memberRow = memberPage
      .getByTestId('group-member-row')
      .filter({ hasText: seeded.memberName });
    await expect(ownerRow.getByTestId('group-member-module')).toHaveText('Module 2');
    await expect(ownerRow.getByTestId('group-member-validated')).toHaveText('1');
    await expect(memberRow.getByTestId('group-member-module')).toHaveText('Module 1');
    await expect(memberRow.getByTestId('group-member-validated')).toHaveText('0');
    await expect(memberPage.getByTestId('group-rotate-code')).toHaveCount(0);

    // BR-APP-03, BR-GRP-04 — each one drops a private PDF in the same shared chapter.
    const ownerFile = `apport-proprietaire-${seeded.tag}`;
    const memberFile = `apport-membre-${seeded.tag}`;
    const ownerNote = `Note privée du propriétaire ${seeded.tag}`;
    await openModule(page, formationId, first.id, first.chapterId);
    const ownerResource = await depositPdf(page, ownerFile);
    await page.getByLabel('Idées et brouillons').fill(ownerNote);
    await page.getByRole('button', { name: 'Ajouter la note' }).click();
    await expect(page.getByTestId('resource-list').getByText(ownerNote)).toBeVisible({
      timeout: 15_000,
    });

    await openModule(memberPage, formationId, first.id, first.chapterId);
    const memberResource = await depositPdf(memberPage, memberFile);
    // The invitee's list holds only their own apport, after a reload too.
    await memberPage.reload();
    await expect(memberPage.getByTestId('resource-item')).toHaveCount(1);
    await expect(memberPage.getByTestId('resource-item')).toContainText(memberFile);
    await expect(memberPage.getByTestId('module-page')).not.toContainText(ownerFile);
    await expect(memberPage.getByTestId('module-page')).not.toContainText(ownerNote);
    await captureEvidenceOf(memberPage, 'journey-group-member-apports');

    await page.reload();
    await expect(page.getByTestId('resource-item')).toHaveCount(2);
    await expect(page.getByTestId('module-page')).not.toContainText(memberFile);

    // CL-4 — direct links: each owner reads their file, the other one is refused (403 FORBIDDEN).
    const ownerRead = await page.request.get(`/api/v1/resources/${ownerResource}/url`);
    expect(ownerRead.status()).toBe(200);
    const signed = (await ownerRead.json()) as { url: string };
    const ownerDownload = await request.get(signed.url);
    expect(ownerDownload.status()).toBe(200);
    expect(
      Buffer.from(await ownerDownload.body())
        .subarray(0, 4)
        .toString('latin1'),
    ).toBe('%PDF');

    await expectRefused(await memberPage.request.get(`/api/v1/resources/${ownerResource}/url`));
    await expectRefused(await page.request.get(`/api/v1/resources/${memberResource}/url`));

    // The Storage object itself, with the invitee's own token: no content (RLS on the bucket).
    const { url: supabaseUrl, anonKey } = supabaseLocalEnv();
    const object = `${supabaseUrl}/storage/v1/object/authenticated/resources/${await storagePathOf(ownerResource)}`;
    const asOwner = await request.get(object, {
      headers: { apikey: anonKey, authorization: `Bearer ${accessTokenOf(owner)}` },
    });
    expect(asOwner.status()).toBe(200);
    const asMember = await request.get(object, {
      headers: { apikey: anonKey, authorization: `Bearer ${accessTokenOf(member)}` },
    });
    expect([400, 403, 404]).toContain(asMember.status());
    expect(Buffer.from(await asMember.body()).toString('latin1')).not.toContain('%PDF');

    // SPEC-724 EF-4 — the invitee leaves: an individual copy keeps the programme and the apport.
    await memberPage.goto(`/formations/${formationId}/groupe`);
    await memberPage.getByRole('button', { name: 'Quitter le groupe' }).click();
    await memberPage.getByRole('button', { name: 'Quitter', exact: true }).click();
    await expect(memberPage).toHaveURL(/\/formations\/[0-9a-f-]{36}\/programme$/, {
      timeout: 30_000,
    });
    const copyId = /\/formations\/([0-9a-f-]{36})\/programme$/.exec(memberPage.url())?.[1] ?? '';
    expect(copyId).not.toBe(formationId);
    await expect(memberPage.getByTestId('programme-active-screen')).toBeVisible({
      timeout: 30_000,
    });
    await expect(memberPage.getByTestId('programme-module-1')).toContainText(first.title);
    await expect(memberPage.getByTestId('programme-module-2')).toContainText(second.title);
    await expect(memberPage.getByTestId('programme-module-1-status')).toHaveText('En cours');
    await expect(memberPage.getByTestId('programme-module-2-status')).toHaveText('Verrouillé');

    await memberPage
      .getByTestId('programme-module-1')
      .getByRole('link', { name: 'Ouvrir le module' })
      .click();
    await expect(memberPage.getByTestId('module-page')).toBeVisible({ timeout: 30_000 });
    await expect(memberPage).toHaveURL(new RegExp(`/formations/${copyId}/modules/`));
    await expect(memberPage.getByTestId('resource-item')).toHaveCount(1);
    await expect(memberPage.getByTestId('resource-item')).toContainText(memberFile);
    expect((await memberPage.request.get(`/api/v1/resources/${memberResource}/url`)).status()).toBe(
      200,
    );
    // Leaving never opens the owner's apports.
    await expectRefused(await memberPage.request.get(`/api/v1/resources/${ownerResource}/url`));
    await captureEvidenceOf(memberPage, 'journey-group-member-copy');

    // The owner keeps the shared formation, with one member left and their own apports.
    await page.goto(`/formations/${formationId}/groupe`);
    await expect(page.getByTestId('group-member-row')).toHaveCount(1);
    await expect(page.getByTestId('group-member-name')).toHaveText(seeded.ownerName);
    await axeCheck();
    await openModule(page, formationId, first.id, first.chapterId);
    await expect(page.getByTestId('resource-item')).toHaveCount(2);
    await captureEvidence('journey-group-owner-after-leave');
    await axeCheck(memberPage);
  } finally {
    await memberContext.close();
  }
});
