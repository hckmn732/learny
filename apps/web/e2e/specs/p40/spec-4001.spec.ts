// [SPEC-4001] Simple mode API journey: deposit, analysis, programme, generation and diagnostic.
//
// The whole journey is replayed against the facade in mock mode (`LLM_MODE=mock`, `JOBS_MODE=inline`
// in the Playwright environment): a learner creates a formation from a deposited document, the
// server detects the sections, proposes a programme `source = 'document'` with page ranges, validates
// it and generates the first modules. The diagnostic is then answered through the ordinary attempt
// routes, and `check` is refused.
import { serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { deleteTestSession, createTestSession, supabaseLocalEnv } from '@learny/testing/supabase';

import { OWN_MODEL_ID, seedOwnModels } from '../../support/own-model';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3142';

interface SimpleState {
  formationId: string;
  status: string;
  steps: { key: string; state: string }[];
  chaptersFound: { position: number; title: string }[];
  sources: { resourceId: string; role: string; status: string; pages: number | null }[];
  proposalVersion: number | null;
  error: { code: string } | null;
  generation?: { moduleId: string; state: string }[];
}

function headers(
  session: { cookieHeader: string },
  origin: string,
): Record<string, string> {
  return { cookie: session.cookieHeader, origin, 'content-type': 'application/json' };
}

async function seedIngestedDocument(userId: string, resourceId: string, formationId: string) {
  const pages = 240;
  const bookmarks = [
    [1, 'Introduction'],
    [81, 'Plan comptable'],
    [161, 'Saisie des pieces'],
  ];
  const chunks: [number, string][] = [
    [1, 'Introduction a la comptabilite generale du document.'],
    [81, 'Le plan comptable, les comptes generaux et le journal.'],
    [161, 'La saisie des pieces comptables et le journal universel.'],
  ];
  const db = serviceDb();
  await db.execute(sql`
    update public.resources
       set status = 'ready',
           mime = 'application/pdf',
           size_bytes = 2048,
           metadata = ${JSON.stringify({ role: 'course', pages, bookmarks })}::jsonb
     where id = ${resourceId}::uuid
  `);
  for (const [index, entry] of chunks.entries()) {
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

test('parcours API du mode simple en mock @SPEC-4001', async ({ request, baseURL }) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  const headersWithKey = (key: string): Record<string, string> => ({
    ...headers(session, origin),
    'idempotency-key': key,
  });
  try {
    // CA-2 — without any personal model the analysis is refused, and the documents stay.
    const created = await request.post('/api/v1/formations/simple', {
      headers: headersWithKey(`spec-4001-create-${session.userId}`),
      data: { motivation: 'Preparer l examen de comptabilite' },
    });
    const createdBody = await created.text();
    expect(created.status(), createdBody).toBe(201);
    const formation = JSON.parse(createdBody) as SimpleState;
    expect(formation.status).toBe('collecting');
    expect(formation.steps.map((step) => step.key)).toEqual([
      'read',
      'structure',
      'practice',
      'programme',
    ]);
    const fid = formation.formationId;

    const upload = await request.post(`/api/v1/formations/${fid}/sources/uploads`, {
      headers: headersWithKey(`spec-4001-upload-${session.userId}`),
      data: { fileName: 'Comptabilite generale.pdf', mime: 'application/pdf', sizeBytes: 2048 },
    });
    const uploadBody = await upload.text();
    expect(upload.status(), uploadBody).toBe(201);
    const uploaded = JSON.parse(uploadBody) as { resourceId: string; uploadUrl: string; role: string };
    expect(uploaded.uploadUrl).toContain(supabaseLocalEnv().url);
    expect(uploaded.role).toBe('course');
    await seedIngestedDocument(session.userId, uploaded.resourceId, fid);

    const refused = await request.post(`/api/v1/formations/${fid}/simple/analysis`, {
      headers: headersWithKey(`spec-4001-analysis-refused-${session.userId}`),
    });
    const refusedBody = await refused.text();
    expect(refused.status(), refusedBody).toBe(409);
    expect(JSON.parse(refusedBody)).toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      details: { tasks: ['simple_analysis', 'programme', 'course'] },
    });
    const afterRefusal = (await (
      await request.get(`/api/v1/formations/${fid}/simple`, { headers: headers(session, origin) })
    ).json()) as SimpleState;
    expect(afterRefusal.sources).toHaveLength(1);
    expect(afterRefusal.status).toBe('collecting');

    // CA-1, CA-3 — with the models, the analysis proposes a document programme with page ranges.
    await seedOwnModels(session.userId);
    await serviceDb().execute(sql`
      insert into public.ai_task_models (user_id, task, credential_id, model_id)
      select ${session.userId}::uuid, 'simple_analysis'::ai_task, c.id, ${OWN_MODEL_ID}
      from public.ai_credentials c
      where c.user_id = ${session.userId}::uuid
      on conflict (user_id, task) do update
        set credential_id = excluded.credential_id, model_id = excluded.model_id
    `);
    const launched = await request.post(`/api/v1/formations/${fid}/simple/analysis`, {
      headers: headersWithKey(`spec-4001-analysis-${session.userId}`),
    });
    const launchedBody = await launched.text();
    expect(launched.status(), launchedBody).toBe(202);
    const analysed = (await (
      await request.get(`/api/v1/formations/${fid}/simple`, { headers: headers(session, origin) })
    ).json()) as SimpleState;
    expect(analysed.status).toBe('proposed');
    expect(analysed.steps.every((step) => step.state === 'done')).toBe(true);
    expect(analysed.chaptersFound.length).toBeGreaterThan(0);
    expect(analysed.proposalVersion).toBe(1);

    const proposal = await request.get(`/api/v1/formations/${fid}/programme`, {
      headers: headers(session, origin),
    });
    const proposalBody = await proposal.text();
    expect(proposal.status(), proposalBody).toBe(200);
    const proposalJson = JSON.parse(proposalBody) as {
      proposal: { source: string; modules: { pageFrom?: number; pageTo?: number }[] };
    };
    expect(proposalJson.proposal.source).toBe('document');
    expect(proposalJson.proposal.modules.length).toBeGreaterThanOrEqual(2);
    expect(proposalJson.proposal.modules.every((module) => module.pageFrom !== undefined)).toBe(
      true,
    );

    const validated = await request.post(`/api/v1/formations/${fid}/programme/validate`, {
      headers: headersWithKey(`spec-4001-validate-${session.userId}`),
      data: { expectedVersion: 1 },
    });
    expect(validated.status(), await validated.text()).toBe(200);

    const afterValidation = (await (
      await request.get(`/api/v1/formations/${fid}/simple`, { headers: headers(session, origin) })
    ).json()) as SimpleState;
    expect(afterValidation.generation?.length ?? 0).toBeGreaterThanOrEqual(2);

    // CA-5 — the diagnostic is answered through the ordinary routes; `check` is refused.
    const diagnostic = await request.post(`/api/v1/formations/${fid}/diagnostic`, {
      headers: headersWithKey(`spec-4001-diagnostic-${session.userId}`),
    });
    const diagnosticBody = await diagnostic.text();
    expect(diagnostic.status(), diagnosticBody).toBe(201);
    const { attemptId } = JSON.parse(diagnosticBody) as { attemptId: string };

    const attempt = (await (
      await request.get(`/api/v1/attempts/${attemptId}`, { headers: headers(session, origin) })
    ).json()) as { questions: { position: number }[] };
    expect(attempt.questions.length).toBeGreaterThan(0);
    for (const question of attempt.questions) {
      const saved = await request.put(`/api/v1/attempts/${attemptId}/answers/${String(question.position)}`, {
        headers: headers(session, origin),
        data: { response: { optionIds: ['a'] }, timeMs: 1000 },
      });
      expect(saved.status(), await saved.text()).toBe(200);
    }
    const check = await request.post(`/api/v1/attempts/${attemptId}/answers/1/check`, {
      headers: headers(session, origin),
      data: { response: { optionIds: ['a'] }, timeMs: 1000 },
    });
    expect(check.status(), await check.text()).toBe(409);
    expect((await check.json()) as { code: string }).toMatchObject({ code: 'DIAGNOSTIC_NO_CHECK' });

    const submitted = await request.post(`/api/v1/attempts/${attemptId}/submit`, {
      headers: headers(session, origin),
    });
    const submittedBody = await submitted.text();
    expect(submitted.status(), submittedBody).toBeLessThan(300);
    const result = (await (
      await request.get(`/api/v1/attempts/${attemptId}/result`, { headers: headers(session, origin) })
    ).json()) as { acquiredModuleIds?: string[] };
    expect(Array.isArray(result.acquiredModuleIds)).toBe(true);

    const again = await request.post(`/api/v1/formations/${fid}/diagnostic`, {
      headers: headersWithKey(`spec-4001-diagnostic-again-${session.userId}`),
    });
    expect(again.status(), await again.text()).toBe(409);
    expect((await again.json()) as { code: string }).toMatchObject({
      code: 'DIAGNOSTIC_ALREADY_DONE',
    });
  } finally {
    await deleteTestSession(session);
  }
});
