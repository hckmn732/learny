import type { APIRequestContext } from '@playwright/test';

import { serviceDb, sql } from '@learny/testing/db';

import { OWN_MODEL_ID, seedOwnModels } from './own-model';

// Jeu de données du mode simple pour les parcours end-to-end (SPEC-4002). Le modèle est simulé
// (`LLM_MODE=mock`) et l'ingestion est remplacée par les mêmes lignes que le worker écrirait :
// documents prêts, signets de sections et passages citables, comme le fait SPEC-4001.

export const SIMPLE_TASKS = ['simple_analysis'] as const;

export interface SessionLike {
  userId: string;
  cookieHeader: string;
}

export function headers(
  session: SessionLike,
  origin: string,
  key?: string,
): Record<string, string> {
  const base: Record<string, string> = {
    cookie: session.cookieHeader,
    origin,
    'content-type': 'application/json',
  };
  return key === undefined ? base : { ...base, 'idempotency-key': key };
}

/** Une clé personnelle qualifiée qui couvre aussi l'analyse du mode simple. */
export async function seedSimpleModels(userId: string): Promise<void> {
  await seedOwnModels(userId);
  await serviceDb().execute(sql`
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    select ${userId}::uuid, 'simple_analysis'::ai_task, c.id, ${OWN_MODEL_ID}
    from public.ai_credentials c
    where c.user_id = ${userId}::uuid
    on conflict (user_id, task) do update
      set credential_id = excluded.credential_id, model_id = excluded.model_id
  `);
}

/** Remplace l'ingestion : documents prêts, signets et passages du manuel. */
export async function seedIngestedDocument(
  userId: string,
  resourceId: string,
  formationId: string,
): Promise<void> {
  await seedIngestedFile(userId, resourceId, formationId, {
    role: 'course',
    pages: 240,
    bookmarks: [
      [1, 'Introduction'],
      [81, 'Plan comptable'],
      [161, 'Saisie des pièces'],
    ],
    chunks: [
      [1, 'Introduction a la comptabilite generale du document de cours.'],
      [81, 'Le plan comptable, les comptes generaux et le journal comptable.'],
      [161, 'La saisie des pieces comptables et le journal universel des operations.'],
    ],
  });
}

export interface IngestedFile {
  role: 'course' | 'exercises' | 'exam_papers' | 'other';
  pages: number;
  bookmarks: [number, string][];
  chunks: [number, string][];
}

export async function seedIngestedFile(
  userId: string,
  resourceId: string,
  formationId: string,
  file: IngestedFile,
): Promise<void> {
  const db = serviceDb();
  await db.execute(sql`
    update public.resources
       set status = 'ready',
           mime = 'text/plain',
           size_bytes = 2048,
           metadata = jsonb_set(
             coalesce(metadata, '{}'::jsonb),
             '{pages}',
             to_jsonb(${file.pages}::int)
           )
     where id = ${resourceId}::uuid
  `);
  await db.execute(sql`
    update public.resources
       set metadata = jsonb_set(metadata, '{bookmarks}', ${JSON.stringify(file.bookmarks)}::jsonb)
     where id = ${resourceId}::uuid
  `);
  for (const [index, entry] of file.chunks.entries()) {
    const [page, text] = entry;
    await db.execute(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, position, text, location
      ) values (
        ${resourceId}::uuid, ${userId}::uuid, ${formationId}::uuid, ${index}, ${text},
        ${JSON.stringify({ page, charStart: 0, charEnd: text.length })}::jsonb
      )
      on conflict (resource_id, position) do nothing
    `);
  }
}

export interface SimpleSource {
  resourceId: string;
  role: 'course' | 'exercises' | 'exam_papers' | 'other';
  title: string;
}

/** Crée une formation en mode simple et y dépose des documents déjà ingérés. */
export async function createSimpleFormation(
  request: APIRequestContext,
  session: SessionLike,
  origin: string,
  options: {
    motivation?: string;
    sources?: SimpleSource[];
    roles?: { course: 'course' | 'exercises' | 'exam_papers' | 'other' };
  } = {},
): Promise<string> {
  const created = await request.post('/api/v1/formations/simple', {
    headers: headers(session, origin, `spec-4002-create-${session.userId}`),
    data: options.motivation === undefined ? {} : { motivation: options.motivation },
  });
  const body = await created.text();
  if (created.status() !== 201) throw new Error(`création refusée : ${body}`);
  const { formationId } = JSON.parse(body) as { formationId: string };
  const sources = options.sources ?? [
    { resourceId: '', role: 'course' as const, title: 'Manuel de comptabilité générale' },
  ];
  for (const [index, source] of sources.entries()) {
    const upload = await request.post(`/api/v1/formations/${formationId}/sources/uploads`, {
      headers: headers(session, origin, `spec-4002-upload-${session.userId}-${index.toString()}`),
      data: {
        fileName: `${source.title}.txt`,
        mime: 'text/plain',
        sizeBytes: 2048,
        role: source.role,
      },
    });
    const uploadBody = await upload.text();
    if (upload.status() !== 201) throw new Error(`dépôt refusé : ${uploadBody}`);
    const { resourceId } = JSON.parse(uploadBody) as { resourceId: string };
    await seedIngestedFile(session.userId, resourceId, formationId, {
      role: source.role,
      pages: source.role === 'course' ? 240 : 96,
      bookmarks:
        source.role === 'course'
          ? [
              [1, 'Introduction'],
              [81, 'Plan comptable'],
              [161, 'Saisie des pièces'],
            ]
          : [[1, 'Énoncés']],
      chunks:
        source.role === 'course'
          ? [
              [1, 'Introduction a la comptabilite generale du document de cours.'],
              [81, 'Le plan comptable, les comptes generaux et le journal comptable.'],
              [161, 'La saisie des pieces comptables et le journal universel des operations.'],
            ]
          : [[1, 'Exercices corriges de comptabilite generale, chapitre par chapitre.']],
    });
  }
  return formationId;
}

/** Lance l'analyse d'une formation et attend le statut passé en argument. */
export async function launchAnalysis(
  request: APIRequestContext,
  session: SessionLike,
  origin: string,
  formationId: string,
): Promise<{ status: string; chaptersFound: number }> {
  const launched = await request.post(`/api/v1/formations/${formationId}/simple/analysis`, {
    headers: headers(session, origin, `spec-4002-analysis-${session.userId}`),
  });
  const body = await launched.text();
  if (launched.status() !== 202) throw new Error(`analyse refusée : ${body}`);
  const state = (await (
    await request.get(`/api/v1/formations/${formationId}/simple`, {
      headers: headers(session, origin),
    })
  ).json()) as { status: string; chaptersFound: unknown[] };
  return { status: state.status, chaptersFound: state.chaptersFound.length };
}

/** Valide le programme proposé et renvoie le nombre de modules générés. */
export async function validateProgramme(
  request: APIRequestContext,
  session: SessionLike,
  origin: string,
  formationId: string,
): Promise<number> {
  const validated = await request.post(`/api/v1/formations/${formationId}/programme/validate`, {
    headers: headers(session, origin, `spec-4002-validate-${session.userId}`),
    data: { expectedVersion: 1 },
  });
  const body = await validated.text();
  if (validated.status() !== 200) throw new Error(`validation refusée : ${body}`);
  return body.length;
}

export interface DiagnosticAnswer {
  position: number;
  optionId: string | null;
}

/** Répond au diagnostic : `optionId` nul laisse la question vide (« Je ne sais pas »). */
export async function answerDiagnostic(
  request: APIRequestContext,
  session: SessionLike,
  origin: string,
  attemptId: string,
  answers: DiagnosticAnswer[],
): Promise<void> {
  for (const answer of answers) {
    if (answer.optionId === null) continue;
    const saved = await request.put(
      `/api/v1/attempts/${attemptId}/answers/${answer.position.toString()}`,
      {
        headers: headers(session, origin),
        data: { response: { optionIds: [answer.optionId] }, timeMs: 1000 },
      },
    );
    if (saved.status() !== 200) throw new Error(`réponse refusée : ${await saved.text()}`);
  }
  const submitted = await request.post(`/api/v1/attempts/${attemptId}/submit`, {
    headers: headers(session, origin),
  });
  if (submitted.status() >= 300) throw new Error(`remise refusée : ${await submitted.text()}`);
}

/** Prépare une formation « programme proposé », prête pour l'aperçu. */
export async function proposedFormation(
  request: APIRequestContext,
  session: SessionLike,
  origin: string,
): Promise<string> {
  await seedSimpleModels(session.userId);
  const formationId = await createSimpleFormation(request, session, origin);
  const analysis = await launchAnalysis(request, session, origin, formationId);
  if (analysis.status !== 'proposed') {
    throw new Error(`analyse non proposée : ${analysis.status}`);
  }
  return formationId;
}
