// [SPEC-4002] Parcours web du mode simple « Dépose ton cours » : dépôt, analyse, aperçu, diagnostic
// et premier chapitre (SCR-21 à SCR-24, étapes 1 à 6 de design/mode-simple/index.html).
//
// Le parcours complet est rejoué dans le navigateur : deux fichiers déposés depuis la page de
// dépôt, l'analyse qui propose le programme, « C'est parti », le diagnostic passé puis le premier
// chapitre. Les documents sont ingérés par les mêmes lignes que le worker (mock LLM, ADR-0048).
import { serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';

import {
  answerDiagnostic,
  createSimpleFormation,
  headers,
  proposedFormation,
  seedIngestedDocument,
  seedSimpleModels,
  validateProgramme,
} from '../../support/simple-mode';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3142';

/** Le parcours commence après les premiers pas : le profil du nouvel apprenant est terminé. */
async function finishOnboarding(userId: string): Promise<void> {
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${userId}::uuid
  `);
}

async function login(
  context: import('@playwright/test').BrowserContext,
  session: { cookies: { name: string; value: string }[] },
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? supabaseLocalEnv().url })),
  );
}

function textFile(name: string, body: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(body, 'utf8') };
}

test('CA-1 — déposer un cours et un TD mène au premier chapitre @SPEC-4002', async ({
  page,
  context,
  baseURL,
}) => {
  const session = await createTestSession();
  try {
    await finishOnboarding(session.userId);
    await seedSimpleModels(session.userId);
    await login(context, session, baseURL);

    // Étape 1 — l'accueil propose les deux portes d'entrée.
    await page.goto('/accueil');
    await expect(page.getByTestId('simple-card-drop')).toBeVisible();
    await expect(page.getByTestId('simple-card-tutor')).toBeVisible();
    await page.getByTestId('simple-card-drop-action').click();
    await expect(page).toHaveURL(/\/formations\/depot$/);

    // Étape 2 — deux fichiers, dont un TD, sans autre saisie.
    await page.getByTestId('simple-dropzone-input').setInputFiles([
      textFile(
        'Manuel de comptabilité générale.txt',
        'Chapitre 1. Le cadre comptable.\nChapitre 2. Les opérations courantes.\nChapitre 3. La TVA.\n',
      ),
      textFile('TD corrigés.txt', 'Exercice 1. Journal, grand livre, balance.\n'),
    ]);
    await expect(page.getByTestId('simple-file-0')).toBeVisible();
    await expect(page.getByTestId('simple-file-1')).toBeVisible();
    await expect(page.getByTestId('simple-role-1')).toHaveValue('exercises');
    // La formation est créée au premier fichier : l'URL de l'étape en cours suit.
    await expect(page).toHaveURL(/\/formations\/[0-9a-f-]+\/depot/);
    await expect(page.getByTestId('simple-file-0')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('simple-file-1')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });

    // L'ingestion du worker est simulée : les sections du manuel sont lisibles pour l'analyse.
    const fid = page.url().split('/formations/')[1]?.split('/')[0] ?? '';
    const rows = await serviceDb().execute<{ id: string; role: string }>(sql`
      select id::text as id, metadata->>'role' as role from public.resources
       where formation_id = ${fid}::uuid order by created_at
    `);
    const course = rows.find((row) => row.role === 'course');
    const exercises = rows.find((row) => row.role === 'exercises');
    expect(course, 'document de cours déposé').toBeDefined();
    expect(exercises, 'document d’exercices déposé').toBeDefined();
    if (course === undefined || exercises === undefined) return;
    await seedIngestedDocument(session.userId, course.id, fid);
    await serviceDb().execute(sql`
      update public.resources set status = 'ready' where id = ${exercises.id}::uuid
    `);

    // Étape 3 — l'analyse se lance et le programme s'affiche.
    await page.getByTestId('simple-create').click();
    await expect(page).toHaveURL(new RegExp(`/formations/${fid}/apercu$`), { timeout: 60_000 });

    // Étape 4 — l'aperçu : quatre indicateurs et les modules du document.
    await expect(page.getByTestId('simple-kpis')).toContainText('modules');
    await expect(page.getByTestId('simple-kpis')).toContainText('d’étude');
    await expect(page.getByTestId('simple-modules')).toContainText('chapitres');
    await expect(page.getByTestId('simple-modules')).toContainText('p. 1–');
    await page.getByTestId('simple-start').click();

    // Étape 5 — le diagnostic : « Je ne sais pas » sur chaque question.
    await expect(page).toHaveURL(new RegExp(`/formations/${fid}/diagnostic$`), {
      timeout: 60_000,
    });
    await expect(page.getByTestId('diagnostic-progress')).toContainText('Question 1 sur');
    const progress = () => page.getByTestId('diagnostic-progress').innerText();
    for (let index = 0; index < 40; index += 1) {
      if (page.url().includes('/diagnostic/resultat')) break;
      const before = await progress();
      await page.getByTestId('diagnostic-dont-know').click();
      // La question suivante s'affiche, ou la page de résultat prend le relais.
      await expect
        .poll(async () =>
          page.url().includes('/diagnostic/resultat') ? 'resultat' : await progress(),
        )
        .not.toBe(before);
    }

    // Étape 6 — le premier chapitre est prêt et mène au cours existant.
    await expect(page).toHaveURL(/\/diagnostic\/resultat/, { timeout: 60_000 });
    await expect(page.getByTestId('simple-result-title')).toHaveText(
      'Aucun module acquis : on commence au début',
    );
    await expect(page.getByTestId('simple-ready-card')).toContainText('Ton premier chapitre est prêt');
    await expect(page.getByTestId('simple-generation')).toBeVisible();
    await page.getByTestId('simple-result-start').click();
    await expect(page).toHaveURL(/\/modules\/[0-9a-f-]+\/cours$/, { timeout: 30_000 });
  } finally {
    await deleteTestSession(session);
  }
});

test('CA-2 — sans clé d’IA, la création est bloquée et la clé ramène au dépôt @SPEC-4002', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const session = await createTestSession();
  try {
    const origin = baseURL ?? DEFAULT_ORIGIN;
    await finishOnboarding(session.userId);
    await login(context, session, baseURL);
    const fid = await createSimpleFormation(request, session, origin);

    await page.goto(`/formations/${fid}/depot`);
    // EF-3, BR-IA-06 — l'encart s'affiche, « Créer ma formation » reste désactivé.
    await expect(page.getByTestId('simple-key-warning')).toBeVisible();
    await expect(page.getByTestId('simple-create')).toBeDisabled();
    await expect(page.getByTestId('simple-file-0')).toContainText('Manuel de comptabilité générale');

    // « Ajouter ma clé » ouvre les Paramètres, section Modèles, avec le retour au dépôt.
    const action = page.getByTestId('simple-key-action');
    await expect(action).toHaveAttribute('href', /retour=%2Fformations%2F.+%2Fdepot/);
    await action.click();
    await expect(page).toHaveURL(/\/parametres\?retour=/);
    await expect(page.getByTestId('settings-retour')).toBeVisible();

    // Le retour ramène au dépôt, fichiers intacts.
    await page.getByTestId('settings-retour').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/formations/${fid}/depot$`));
    await expect(page.getByTestId('simple-file-0')).toContainText('Manuel de comptabilité générale');
    await expect(page.getByTestId('simple-key-warning')).toBeVisible();
  } finally {
    await deleteTestSession(session);
  }
});

test('CA-3 — une échéance recalcule la fin prévue et le rythme quotidien @SPEC-4002', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const session = await createTestSession();
  try {
    const origin = baseURL ?? DEFAULT_ORIGIN;
    await finishOnboarding(session.userId);
    await login(context, session, baseURL);
    const fid = await proposedFormation(request, session, origin);

    await page.goto(`/formations/${fid}/apercu`);
    const perDayBefore = await page.getByTestId('simple-kpi-per-day').innerText();
    const endBefore = await page.getByTestId('simple-kpi-end').innerText();

    // « Oui, le… » choisit d'abord l'échéance la plus proche acceptée (aujourd'hui + 15 jours).
    await page.getByTestId('simple-deadline-yes').click();
    await expect(page.getByTestId('simple-deadline-date')).toBeVisible();
    await expect
      .poll(() => page.getByTestId('simple-kpi-per-day').innerText())
      .not.toBe(perDayBefore);
    const perDayNear = await page.getByTestId('simple-kpi-per-day').innerText();
    const endNear = await page.getByTestId('simple-kpi-end').innerText();
    expect(endNear).not.toBe(endBefore);

    // Une échéance plus lointaine baisse le rythme et repousse la fin prévue.
    await page.getByTestId('simple-deadline-date').fill('2027-06-15');
    await expect.poll(() => page.getByTestId('simple-kpi-end').innerText()).toContain('juin');
    const perDayFar = await page.getByTestId('simple-kpi-per-day').innerText();
    expect(perDayFar).not.toBe(perDayNear);
    await expect(page.getByTestId('simple-deadline')).toContainText(
      'Objectif « examen »',
    );
  } finally {
    await deleteTestSession(session);
  }
});

test('CA-4 — « Passer le diagnostic » mène au premier chapitre sans module acquis @SPEC-4002', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const session = await createTestSession();
  try {
    const origin = baseURL ?? DEFAULT_ORIGIN;
    await finishOnboarding(session.userId);
    await login(context, session, baseURL);
    const fid = await proposedFormation(request, session, origin);
    await validateProgramme(request, session, origin, fid);

    await page.goto(`/formations/${fid}/diagnostic`);
    await expect(page.getByTestId('diagnostic-skip')).toBeVisible();
    await page.getByTestId('diagnostic-skip').click();
    await expect(page).toHaveURL(/\/diagnostic\/resultat/, { timeout: 30_000 });

    // EF-7 — passé, le diagnostic n'affiche pas de ligne de score.
    await expect(page.getByTestId('simple-result-score')).toHaveCount(0);
    await expect(page.getByTestId('simple-result-title')).toHaveText(
      'Aucun module acquis : on commence au début',
    );
    await expect(page.getByTestId('simple-ready-card')).toContainText('Ton premier chapitre est prêt');
  } finally {
    await deleteTestSession(session);
  }
});

test('CA-4 — un diagnostic réussi sur le module 1 l’affiche comme acquis @SPEC-4002', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const session = await createTestSession();
  try {
    const origin = baseURL ?? DEFAULT_ORIGIN;
    await finishOnboarding(session.userId);
    await login(context, session, baseURL);
    const fid = await proposedFormation(request, session, origin);
    await validateProgramme(request, session, origin, fid);

    const created = await request.post(`/api/v1/formations/${fid}/diagnostic`, {
      headers: headers(session, origin, `spec-4002-diagnostic-${session.userId}`),
    });
    const body = await created.text();
    expect(created.status(), body).toBe(201);
    const { attemptId } = JSON.parse(body) as { attemptId: string };
    const attempt = (await (
      await request.get(`/api/v1/attempts/${attemptId}`, { headers: headers(session, origin) })
    ).json()) as { questions: { position: number; notionLabel: string }[] };
    const firstModule = attempt.questions[0]?.notionLabel ?? '';
    // Dans la banque simulée, l'option « a » est la bonne réponse de chaque question.
    const answers = attempt.questions.map((question) => ({
      position: question.position,
      optionId: question.notionLabel === firstModule ? 'a' : null,
    }));
    await answerDiagnostic(request, session, origin, attemptId, answers);

    await page.goto(`/formations/${fid}/diagnostic/resultat?attempt=${attemptId}`);
    await expect(page.getByTestId('simple-result-score')).toContainText('bonnes réponses sur');
    await expect(page.getByTestId('simple-result-title')).toContainText('déjà acquis');
    await expect(page.getByTestId('simple-generation')).toBeVisible();
  } finally {
    await deleteTestSession(session);
  }
});

test('CA-6 — une formation en analyse apparaît à l’accueil avec « Continuer » @SPEC-4002', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const session = await createTestSession();
  try {
    const origin = baseURL ?? DEFAULT_ORIGIN;
    await finishOnboarding(session.userId);
    await login(context, session, baseURL);
    await seedSimpleModels(session.userId);
    const fid = await createSimpleFormation(request, session, origin);
    // Une analyse en cours, exactement comme après « Créer ma formation » (CL-3).
    await serviceDb().execute(sql`
      update public.simple_analyses
         set status = 'analysing',
             steps = ${JSON.stringify([
               { key: 'read', state: 'done', detail: 'Lecture du document de cours.' },
               { key: 'structure', state: 'running', detail: null },
               { key: 'practice', state: 'todo', detail: null },
               { key: 'programme', state: 'todo', detail: null },
             ])}::jsonb,
             chapters_found = ${JSON.stringify([{ position: 1, title: 'Introduction' }])}::jsonb
       where formation_id = ${fid}::uuid
    `);

    await page.goto('/accueil');
    const row = page.getByTestId(`home-formation-row-${fid}`);
    await expect(row).toContainText('Continuer');
    await row.getByRole('link', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(new RegExp(`/formations/${fid}/depot$`));
    await expect(page.getByTestId('simple-analysis-page')).toBeVisible();
    await expect(page.getByTestId('simple-chapters-found')).toContainText('Introduction');
  } finally {
    await deleteTestSession(session);
  }
});