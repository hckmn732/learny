import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

// Same-origin mutations from the API request context (SPEC-208 origin guard).
const ORIGIN = 'http://127.0.0.1:3100';

import { buildPdf } from '../../../../../packages/services/test/support/files';

const SECTIONS = ['spec-206-limits', 'spec-206-cases', 'spec-206-deletion'];
const TITLE = 'SPEC-206 — Envois privés';

const EXPECTED: Record<string, string> = {
  'pdf-limit': 'Accepté',
  'pdf-too-many-pages': 'Refusé · UPLOAD_TOO_LARGE',
  'image-limit': 'Accepté',
  'image-too-large': 'Refusé · UPLOAD_TOO_LARGE',
  'executable-as-png': 'Refusé · UNSUPPORTED_TYPE',
  'note-too-long': 'Refusé · UPLOAD_TOO_LARGE',
  'chapter-full': 'Refusé · QUOTA_EXCEEDED',
  'quota-reached': 'Refusé · QUOTA_EXCEEDED',
};

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('inspecte les limites d’envoi @SPEC-206', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-206');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Limites d’envoi',
    'Essais simulés',
    'Source supprimée',
  ]);

  // The four limit cards of BR-APP-02.
  await expect(page.getByTestId('spec-206-limit-pdf')).toContainText('50 Mo · 500 pages');
  await expect(page.getByTestId('spec-206-limit-image')).toContainText('10 Mo');
  await expect(page.getByTestId('spec-206-limit-image')).toContainText('JPEG, PNG, WebP ou HEIC');
  await expect(page.getByTestId('spec-206-limit-note')).toContainText('100 000 caractères');
  await expect(page.getByTestId('spec-206-limit-quota')).toContainText(
    '100 apports par chapitre · 2 Go par apprenant',
  );

  // CA-1 — the table shows the code the service answers for every simulated trial.
  for (const name of Object.keys(EXPECTED)) {
    await expect(page.getByTestId(`spec-206-result-${name}`)).toHaveText('Pas encore essayé');
  }
  await page.getByRole('button', { name: 'Lancer tous les essais' }).click();
  for (const [name, expected] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`spec-206-result-${name}`)).toContainText(expected);
  }
  await expect(page.getByTestId('spec-206-result-pdf-limit')).toHaveAttribute(
    'data-state',
    'accepted',
  );
  await expect(page.getByTestId('spec-206-result-pdf-too-many-pages')).toContainText('500 pages');
  await expect(page.getByTestId('spec-206-result-image-too-large')).toContainText('10 Mo');
  await expect(page.getByTestId('spec-206-result-quota-reached')).toHaveAttribute(
    'data-state',
    'refused',
  );
  await expect(page.getByTestId('spec-206-result-note-too-long')).toContainText('100 000 caractères');

  // Each row can be tried alone, from the keyboard.
  const rowButton = page.getByRole('button', { name: 'Essayer : PDF de 50 Mo et 500 pages' });
  await rowButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spec-206-announce')).toHaveText(
    'PDF de 50 Mo et 500 pages : Accepté',
  );

  // CA-4 — a deleted source keeps its citation, labelled « source supprimée ».
  await expect(page.getByTestId('spec-206-citation-label')).toHaveText('Guide FI, p. 4');
  await page.getByRole('button', { name: 'Supprimer l’apport' }).click();
  await expect(page.getByTestId('spec-206-citation-label')).toHaveText('source supprimée');
  await expect(page.getByTestId('spec-206-citation')).toContainText(
    'Clés de comptabilisation : 40 = débit, 50 = crédit',
  );
  await expect(page.getByTestId('spec-206-deletion-status')).toHaveText(
    'Apport supprimé, citation conservée.',
  );
  await page.getByRole('button', { name: 'Rétablir l’exemple' }).click();
  await expect(page.getByTestId('spec-206-citation-label')).toHaveText('Guide FI, p. 4');

  await axeCheck();
  await captureEvidence('spec-206-envois-prives');
  expect(consoleErrors.filter((message) => !message.includes('status of 4'))).toEqual([]);
});

test('envois conformes @SPEC-206 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-206');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);

  await page.getByRole('button', { name: 'Lancer tous les essais' }).click();
  for (const [name, expected] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`spec-206-result-${name}`)).toContainText(expected);
  }
  await page.getByRole('button', { name: 'Supprimer l’apport' }).click();
  await expect(page.getByTestId('spec-206-citation-label')).toHaveText('source supprimée');

  // Tokens of the base layout (SPEC-201 §10): page #F4F4F1, white cards, #E7E6E1 border, 24 px.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-206-limits"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-206-cases"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-206-deletion"]': { 'border-top-left-radius': '24px' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  // No horizontal scroll at any width: the table wraps instead of overflowing.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-206-demo.png', { fullPage: true });
});

test('parcourt les routes réelles : envoi, finalisation, lecture, suppression @SPEC-206', async ({
  request,
}) => {
  const other = await createTestSession();
  const supabase = supabaseLocalEnv();
  const headers = (user: TestSession, extra: Record<string, string> = {}) => ({
    origin: ORIGIN,
    cookie: user.cookieHeader,
    ...extra,
  });
  let chapterId = '';
  try {
    chapterId = await serviceDb().transaction(async (tx) => {
      const programme = await createTestProgramme(tx, session.userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: 'Programme des routes d’envoi',
      });
      return programme.chapterIds[0] ?? '';
    });
    const uploads = `/api/v1/chapters/${chapterId}/uploads`;
    const pdf = buildPdf({ pages: 3 });

    // Without a session: 401 problem+json. Without a key: 400. A video and a huge PDF: 422 codes.
    const anonymous = await request.post(uploads, { headers: { origin: ORIGIN, cookie: '' }, data: {} });
    expect(anonymous.status()).toBe(401);
    const noKey = await request.post(uploads, {
      headers: headers(session),
      data: { fileName: 'guide.pdf', mime: 'application/pdf', sizeBytes: pdf.length },
    });
    expect(noKey.status()).toBe(400);
    expect(((await noKey.json()) as { code: string }).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const video = await request.post(uploads, {
      headers: headers(session, { 'idempotency-key': randomUUID() }),
      data: { fileName: 'cours.mp4', mime: 'video/mp4', sizeBytes: 1024 },
    });
    expect(video.status()).toBe(422);
    expect(video.headers()['content-type']).toContain('application/problem+json');
    expect(((await video.json()) as { code: string }).code).toBe('UNSUPPORTED_TYPE');
    const huge = await request.post(uploads, {
      headers: headers(session, { 'idempotency-key': randomUUID() }),
      data: { fileName: 'archive.pdf', mime: 'application/pdf', sizeBytes: 60 * 1024 * 1024 },
    });
    expect(((await huge.json()) as { code: string }).code).toBe('UPLOAD_TOO_LARGE');

    // EF-1 — a reservation and a signed URL; the same key gives the same resource back.
    const key = randomUUID();
    const body = { fileName: 'guide.pdf', mime: 'application/pdf', sizeBytes: pdf.length };
    const created = await request.post(uploads, {
      headers: headers(session, { 'idempotency-key': key }),
      data: body,
    });
    expect(created.status()).toBe(201);
    const reservation = (await created.json()) as {
      resourceId: string;
      uploadUrl: string;
      expiresAt: string;
    };
    expect(new URL(reservation.uploadUrl).pathname).toBe(
      `/storage/v1/object/upload/sign/resources/${session.userId}/${reservation.resourceId}/guide.pdf`,
    );
    const replay = await request.post(uploads, {
      headers: headers(session, { 'idempotency-key': key }),
      data: body,
    });
    expect(((await replay.json()) as { resourceId: string }).resourceId).toBe(
      reservation.resourceId,
    );
    // ET-4 — no signed URL is stored by the idempotency table, nor by the resource itself.
    const stored = await serviceDb().execute<{ total: number }>(sql`
      select (
        (select count(*) from public.idempotency_keys
          where user_id = ${session.userId}::uuid and response::text like '%token=%')
        + (select count(*) from public.resources
          where owner_id = ${session.userId}::uuid and metadata::text like '%token=%')
      )::int as total
    `);
    expect(stored[0]?.total).toBe(0);

    // The browser sends the bytes straight to Storage, then asks for the finalization.
    const put = await request.put(reservation.uploadUrl, {
      headers: { apikey: supabase.anonKey, 'content-type': 'application/pdf' },
      data: Buffer.from(pdf),
    });
    expect(put.ok()).toBe(true);
    const finalizeUrl = `/api/v1/resources/${reservation.resourceId}/finalize`;
    const finalized = await request.post(finalizeUrl, { headers: headers(session) });
    expect(finalized.status()).toBe(200);
    expect(await finalized.json()).toEqual({
      id: reservation.resourceId,
      kind: 'pdf',
      status: 'queued',
      mime: 'application/pdf',
      sizeBytes: pdf.length,
      pages: 3,
    });
    const again = await request.post(finalizeUrl, { headers: headers(session) });
    expect(again.status()).toBe(200);

    // EF-4, CA-3 — the owner reads through a signed URL; another learner is refused.
    const readUrl = `/api/v1/resources/${reservation.resourceId}/url`;
    const read = await request.get(readUrl, { headers: headers(session) });
    expect(read.status()).toBe(200);
    const signed = (await read.json()) as { url: string; expiresAt: string };
    const download = await request.get(signed.url);
    expect(download.status()).toBe(200);
    expect(Buffer.from(await download.body()).equals(Buffer.from(pdf))).toBe(true);
    for (const forbidden of [
      await request.get(readUrl, { headers: headers(other) }),
      await request.post(finalizeUrl, { headers: headers(other) }),
      await request.delete(`/api/v1/resources/${reservation.resourceId}`, {
        headers: headers(other),
      }),
    ]) {
      expect(forbidden.status()).toBe(403);
      expect(forbidden.headers()['content-type']).toContain('application/problem+json');
      expect(((await forbidden.json()) as { code: string }).code).toBe('FORBIDDEN');
    }
    const missing = await request.get(`/api/v1/resources/${randomUUID()}/url`, {
      headers: headers(session),
    });
    expect(missing.status()).toBe(404);

    // EF-5, CA-4 — deletion is idempotent and the resource disappears at once.
    const removed = await request.delete(`/api/v1/resources/${reservation.resourceId}`, {
      headers: headers(session),
    });
    expect(removed.status()).toBe(204);
    const removedAgain = await request.delete(`/api/v1/resources/${reservation.resourceId}`, {
      headers: headers(session),
    });
    expect(removedAgain.status()).toBe(204);
    const afterDelete = await request.get(readUrl, { headers: headers(session) });
    expect(afterDelete.status()).toBe(404);

    // EF-3 — a note goes through the resources route, queued and never ready.
    const note = await request.post(`/api/v1/chapters/${chapterId}/resources`, {
      headers: headers(session, { 'idempotency-key': randomUUID() }),
      data: { kind: 'note', title: 'Ma note', text: 'Un texte privé.' },
    });
    expect(note.status()).toBe(201);
    expect(await note.json()).toMatchObject({ kind: 'note', status: 'queued', title: 'Ma note' });
  } finally {
    await deleteTestSession(other);
  }
});
