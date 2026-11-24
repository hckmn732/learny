// [SPEC-4001] Visual conformity of the existing Programme screen (SCR-05) displaying a proposal
// `source = 'document'` created by the API: same tokens, same layout as a tutor proposal.
import { serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

import { OWN_MODEL_ID, seedOwnModels } from '../../support/own-model';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3142';

interface Session {
  cookieHeader: string;
  userId: string;
}

function headers(session: Session, origin: string, key?: string): Record<string, string> {
  const base: Record<string, string> = {
    cookie: session.cookieHeader,
    origin,
    'content-type': 'application/json',
  };
  return key === undefined ? base : { ...base, 'idempotency-key': key };
}

async function seedIngestedDocument(userId: string, resourceId: string, formationId: string) {
  const db = serviceDb();
  await db.execute(sql`
    update public.resources
       set status = 'ready', mime = 'application/pdf', size_bytes = 2048,
           metadata = ${JSON.stringify({
             role: 'course',
             pages: 240,
             bookmarks: [
               [1, 'Introduction'],
               [81, 'Plan comptable'],
               [161, 'Saisie des pieces'],
             ],
           })}::jsonb
     where id = ${resourceId}::uuid
  `);
  const chunks: [number, string][] = [
    [1, 'Introduction a la comptabilite generale du document.'],
    [81, 'Le plan comptable, les comptes generaux et le journal.'],
    [161, 'La saisie des pieces comptables et le journal universel.'],
  ];
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

async function createDocumentProposal(
  request: import('@playwright/test').APIRequestContext,
  session: Session,
  origin: string,
): Promise<string> {
  await seedOwnModels(session.userId);
  await serviceDb().execute(sql`
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    select ${session.userId}::uuid, 'simple_analysis'::ai_task, c.id, ${OWN_MODEL_ID}
    from public.ai_credentials c where c.user_id = ${session.userId}::uuid
    on conflict (user_id, task) do update
      set credential_id = excluded.credential_id, model_id = excluded.model_id
  `);
  const created = await request.post('/api/v1/formations/simple', {
    headers: headers(session, origin, `spec-4001-visual-create-${session.userId}`),
    data: {},
  });
  expect(created.status(), await created.text()).toBe(201);
  const { formationId } = (await created.json()) as { formationId: string };
  const upload = await request.post(`/api/v1/formations/${formationId}/sources/uploads`, {
    headers: headers(session, origin, `spec-4001-visual-upload-${session.userId}`),
    data: { fileName: 'Comptabilite generale.pdf', mime: 'application/pdf', sizeBytes: 2048 },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { resourceId } = (await upload.json()) as { resourceId: string };
  await seedIngestedDocument(session.userId, resourceId, formationId);
  const launched = await request.post(`/api/v1/formations/${formationId}/simple/analysis`, {
    headers: headers(session, origin, `spec-4001-visual-analysis-${session.userId}`),
  });
  expect(launched.status(), await launched.text()).toBe(202);
  const state = (await (
    await request.get(`/api/v1/formations/${formationId}/simple`, { headers: headers(session, origin) })
  ).json()) as { status: string };
  expect(state.status).toBe('proposed');
  return formationId;
}

test('conformité SCR-05 avec une proposition tirée d’un document @SPEC-4001 @visual', async ({
  page,
  context,
  baseURL,
  axeCheck,
  request,
}) => {
  const session = await createTestSession();
  try {
    // The learner reaches the programme through the ordinary shell: onboarding is finished and the
    // rhythm is the documented default, exactly like the demonstration accounts.
    await serviceDb().execute(sql`
      update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
    `);
    await serviceDb().execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${session.userId}::uuid, 2, '{1,2,3,4,5}'::smallint[], '{soir}'::public.study_slot[])
      on conflict (user_id) do nothing
    `);
    const origin = baseURL ?? DEFAULT_ORIGIN;
    const formationId = await createDocumentProposal(request, session, origin);
    await context.addCookies(
      session.cookies.map((cookie) => ({
        ...cookie,
        url: baseURL ?? supabaseLocalEnv().url,
      })),
    );
    await page.goto(`/formations/${formationId}/programme`);
    try {
      await expect(page.getByTestId('programme-proposal')).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      throw new Error(`proposition absente : ${await page.locator('body').innerText()}`, {
        cause: error,
      });
    }
    await expect(page.getByTestId('programme-module-1')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expectTokens(page, {
      body: { 'background-color': colors.canvas, color: colors.ink },
      '[data-testid="programme-timeline"]': {
        'background-color': colors.surface,
        'border-top-color': colors.border,
      },
      '[data-testid="programme-module-1"]': {
        'background-color': colors.surface,
        'border-top-color': colors.ink,
      },
      '[data-testid="programme-validate"]': {
        'background-color': colors.ink,
        color: colors.white,
      },
      '[data-testid="programme-adjust"]': {
        'background-color': colors.surface,
        'border-top-color': colors['border-strong'],
      },
    });
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
    await expect(page.getByTestId('programme-validate')).toHaveText('Valider le programme');
    await expect(page.getByText('Modules et chapitres')).toBeVisible();
    await expectScreenshotBaseline(page, 'SPEC-4001-programme-document.png', {
      fullPage: true,
    });
    await axeCheck();
  } finally {
    await deleteTestSession(session);
  }
});
