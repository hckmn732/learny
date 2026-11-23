// SPEC-807 EF-6, CA-3 — journey « données personnelles » (owners: SPEC-211 service, SPEC-707
// screen, SPEC-806 RGPD). A learner exports their data from Paramètres › Profil, receives the
// `export_ready` e-mail of the memory transport, downloads the archive and finds their course,
// apports, results and settings in it, never a byte of the witness account; they schedule the
// deletion, cancel it before J+30, schedule it again, and the nightly run erases the account once
// the injected clock reaches J+30.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import type { APIRequestContext } from '@playwright/test';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

import {
  readZip,
  seedLearner,
  storedObjectExists,
  type SeededLearner,
} from './support/data-rights';

const J30_DATABASE = '2026-12-11 12:20:00+00';

let learner: TestSession | null = null;
let witness: TestSession | null = null;

test.afterEach(async () => {
  // The learner is normally erased by the journey itself; both deletions are idempotent.
  for (const session of [learner, witness]) {
    if (session !== null) await deleteTestSession(session);
  }
  learner = null;
  witness = null;
});

test.afterAll(async () => {
  await closeDb();
});

interface OutboxItem {
  to: string;
  subject: string;
  template: string;
}

/** Messages of the server's memory transport (SPEC-204 demonstration route) for one address. */
async function outboxFor(request: APIRequestContext, to: string): Promise<OutboxItem[]> {
  const response = await request.get('/api/v1/dev/sdd/email/outbox');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: OutboxItem[] };
  return body.items.filter((item) => item.to === to);
}

function templates(items: readonly OutboxItem[], template: string): OutboxItem[] {
  return items.filter((item) => item.template === template);
}

async function deletionScheduledFor(userId: string): Promise<string | null> {
  const rows = await serviceDb().execute<{ scheduled: string | null }>(sql`
    select deletion_scheduled_for::text as scheduled from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.scheduled ?? null;
}

function expectNoWitnessData(files: Map<string, Buffer>, other: TestSession, seed: SeededLearner) {
  const forbidden = [
    other.userId,
    other.email,
    seed.formationTitle,
    seed.formationSlug,
    seed.courseMarker,
    seed.noteTitle,
    seed.noteText,
    seed.fileName,
  ];
  for (const [name, content] of files) {
    const text = content.toString('utf8');
    for (const marker of forbidden) {
      expect(name.includes(marker), `${name} ne nomme pas une donnée du témoin`).toBe(false);
      expect(text.includes(marker), `${name} ne contient aucune donnée du témoin`).toBe(false);
    }
  }
}

test('données personnelles : export complet, annulation puis effacement à J+30 @SPEC-807 @SPEC-211 @SPEC-707 @SPEC-806', async ({
  page,
  context,
  browser,
  baseURL,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  const tag = randomUUID().slice(0, 8);

  // Declared fixtures (ET-2, ET-3): two isolated learners with their own programme, course,
  // apports (a note and a PDF really stored in the private bucket), graded attempt and mastery.
  learner = await createTestSession({ email: `sdd-807-rgpd-${tag}@test.learny.test` });
  witness = await createTestSession({ email: `sdd-807-temoin-${tag}@test.learny.test` });
  const own = await seedLearner(learner.userId, { label: 'Comptabilité', tag });
  const other = await seedLearner(witness.userId, { label: 'Témoin', tag });
  await context.addCookies(learner.cookies.map((cookie) => ({ ...cookie, url: origin })));

  // Réglages — the learner changes their rhythm through the screen before exporting.
  await page.goto('/parametres#profil');
  await expect(page.getByRole('tab', { name: 'Profil' })).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('group', { name: 'Temps d’étude par jour' })
    .getByRole('button', { name: '5 h', exact: true })
    .click();
  // BR-SET-02 — the first name is required with the rhythm; a fresh account has none yet.
  await page.getByLabel('Prénom').fill('Camille');
  const profileSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/profile') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect((await profileSaved).status()).toBe(200);
  await expect(
    page.getByRole('status').filter({ hasText: 'Modifications enregistrées' }),
  ).toBeVisible();

  // Export — confirmation dialog, 202 from the real service, inline job until « Export prêt. ».
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const exportDialog = page.getByRole('alertdialog', { name: 'Exporter vos données ?' });
  await expect(exportDialog).toBeVisible();
  const exportRequested = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/me/export') && response.request().method() === 'POST',
  );
  await exportDialog.getByRole('button', { name: 'Exporter', exact: true }).click();
  expect((await exportRequested).status()).toBe(202);
  const exportStatus = page.getByRole('status').filter({ hasText: /^Export/ });
  await expect(exportStatus).toContainText('Export prêt.', { timeout: 60_000 });
  const downloadLink = exportStatus.getByRole('link', { name: 'Télécharger' });
  await expect(downloadLink).toHaveAttribute(
    'href',
    /^\/api\/v1\/me\/exports\/[0-9a-f-]+\?download=1$/,
  );
  const href = (await downloadLink.getAttribute('href')) ?? '';

  // CL-5 — the `export_ready` e-mail reached the memory transport exactly once, for this learner.
  await expect
    .poll(
      async () =>
        templates(await outboxFor(page.request, learner?.email ?? ''), 'export_ready').length,
    )
    .toBe(1);
  const [readyMail] = templates(await outboxFor(page.request, learner.email), 'export_ready');
  expect(readyMail?.subject).toBe('Votre export Learny est prêt');
  expect(templates(await outboxFor(page.request, witness.email), 'export_ready')).toEqual([]);
  await captureEvidence('spec-807-donnees-export-pret');

  // The learner downloads the archive from the link of the screen (the link of the e-mail).
  const downloaded = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloaded;
  const archivePath = testInfo.outputPath('export.zip');
  await download.saveAs(archivePath);
  const files = readZip(fs.readFileSync(archivePath));
  const names = [...files.keys()];
  const text = (name: string): string => {
    const content = files.get(name);
    expect(content, `${name} présent dans l’archive`).toBeDefined();
    return content?.toString('utf8') ?? '';
  };

  // CA-3 — every prescribed category is there, with the learner's own values.
  const formationDir = `formations/${own.formationSlug}`;
  const apportDir = `apports/${own.formationSlug}/${own.moduleFolder}`;
  expect(names).toEqual(
    expect.arrayContaining([
      'README.txt',
      'settings.json',
      'results.json',
      'conversations.json',
      `${formationDir}/programme.json`,
      `${formationDir}/${own.moduleFolder}/cours.md`,
      `${apportDir}/${own.noteTitle}.txt`,
      `${apportDir}/${own.fileName}`,
    ]),
  );
  expect(text('README.txt')).toContain(learner.email);
  // Cours.
  expect(text(`${formationDir}/${own.moduleFolder}/cours.md`)).toContain(own.courseMarker);
  const programme = JSON.parse(text(`${formationDir}/programme.json`)) as {
    formation: { title: string };
  };
  expect(programme.formation.title).toBe(own.formationTitle);
  // Apports: the note text and the original PDF, byte for byte.
  expect(text(`${apportDir}/${own.noteTitle}.txt`)).toBe(own.noteText);
  expect(files.get(`${apportDir}/${own.fileName}`)?.equals(own.fileBytes)).toBe(true);
  // Résultats: the graded attempt and the mastery of the notion.
  const results = JSON.parse(text('results.json')) as {
    attempts: { score: string | number; passed: boolean }[];
    notionStates: { mastery: string | number }[];
  };
  expect(results.attempts.map((attempt) => Number(attempt.score))).toEqual([own.attemptScore]);
  expect(results.notionStates.map((state) => Number(state.mastery))).toEqual([own.mastery]);
  // Réglages: the rhythm saved through the screen, no secret.
  const settingsJson = text('settings.json');
  const settings = JSON.parse(settingsJson) as {
    profile: { email: string; first_name: string };
    studyPreferences: { hours_per_day: number } | null;
  };
  expect(settings.profile.email).toBe(learner.email);
  expect(settings.profile.first_name).toBe('Camille');
  expect(settings.studyPreferences?.hours_per_day).toBe(5);
  expect(settingsJson).not.toMatch(/api_key|apiKey|secret|password/i);
  // Isolation — nothing of the witness account, in any file name or content.
  expect(names.filter((name) => name.startsWith('formations/'))).toEqual([
    `${formationDir}/programme.json`,
    `${formationDir}/${own.moduleFolder}/cours.md`,
  ]);
  expectNoWitnessData(files, witness, other);
  await testInfo.attach('export-tree', {
    body: names.join('\n'),
    contentType: 'text/plain',
  });

  // SPEC-211 CL-5 — the witness, signed in, cannot open the learner's export link.
  const witnessContext = await browser.newContext({ baseURL: origin });
  try {
    await witnessContext.addCookies(witness.cookies.map((cookie) => ({ ...cookie, url: origin })));
    const foreign = await witnessContext.request.get(href, { maxRedirects: 0 });
    expect(foreign.status()).toBe(404);
  } finally {
    await witnessContext.close();
  }
  const [exportRow] = await serviceDb().execute<{ storage_path: string }>(sql`
    select storage_path from public.data_exports where user_id = ${learner.userId}::uuid
  `);
  const exportPath = exportRow?.storage_path ?? '';
  expect(await storedObjectExists('exports', exportPath)).toBe(true);

  // Deletion request — J+30 shown in the dialog and the status, `deletion_scheduled` e-mail.
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deleteDialog = page.getByRole('alertdialog', { name: 'Supprimer votre compte ?' });
  await expect(deleteDialog).toContainText('11 décembre 2026');
  await deleteDialog.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const deletionStatus = page.getByRole('status').filter({ hasText: /suppression/i });
  await expect(deletionStatus).toContainText(/Suppression programmée le .*11 décembre 2026/);
  expect(await deletionScheduledFor(learner.userId)).toBe(J30_DATABASE);
  await expect
    .poll(
      async () =>
        templates(await outboxFor(page.request, learner?.email ?? ''), 'deletion_scheduled').length,
    )
    .toBe(1);

  // Cancellation before J+30: the request disappears, also after a reload.
  await deletionStatus.getByRole('button', { name: 'Annuler la suppression' }).click();
  await expect(deletionStatus).toHaveText('Aucune suppression programmée.');
  expect(await deletionScheduledFor(learner.userId)).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toBeVisible();
  await axeCheck();

  // SPEC-211 CL-7 â€” the nightly erasure is a Python worker job now (ADR-2006): the whole
  // itinerary (cancelled, one minute early, due) runs in
  // packages-py/learny/tests/integration/privacy/test_personal_data.py with an injected clock.
  // This journey keeps what the web owns: the request, the persisted deadline and the cancel.
});
