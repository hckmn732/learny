// SPEC-713 — micro-séance de secours (SCR-10, CA-3, CA-4). The test seeds a learner without any
// activity of the day, runs the real `micro_seance` automation with the frozen 20:05 Paris clock,
// follows the notification into the micro quiz global, completes it and checks the home card.
import { randomUUID } from 'node:crypto';

import { runAutomation, type AutomationEngineContext } from '@learny/automations';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createBrick, createNotionState, makeModuleWithBank } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PREFIX = 'sdd-713-e2e-';
const NOW = '2026-11-11T19:05:00.000Z';

let session: TestSession | null = null;

interface Seed {
  formationId: string;
  moduleId: string;
}

const clock = { now: () => new Date(NOW) };

function engine(): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

async function seed(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 5,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale', status = 'validated', threshold = 80
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (
        ${userId}::uuid, ${moduleId}::uuid, 'validated', '2026-11-09T08:00:00Z'::timestamptz
      )
      on conflict (user_id, module_id) do update
        set status = 'validated', validated_at = '2026-11-09T08:00:00Z'::timestamptz
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          timezone = 'Europe/Paris', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${userId}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}'::study_slot[])
      on conflict (user_id) do update
        set study_days = '{1,2,3,4,5,6,7}'::smallint[]
    `);
    await makeModuleWithBank(tx, {
      userId,
      formationId: programme.formationId,
      moduleId,
      notions: 5,
      variantsPerFormat: 3,
    });
    for (const [index, notionId] of programme.notionIds.entries()) {
      await createNotionState(tx, {
        userId,
        notionId,
        dueAt: new Date('2026-11-10T18:00:00Z'),
      });
      await createBrick(tx, {
        ownerId: userId,
        formationId: programme.formationId,
        type: 'recall_card',
        purpose: 'bank',
        notionIds: [notionId],
        payload: {
          front: `Question de rappel ${String(index + 1)} ?`,
          back: `Réponse de rappel ${String(index + 1)}.`,
          sourceLabel: 'votre cours du module 1, chapitre 1',
          sources: [],
        },
      });
    }
    await tx.execute(sql`
      update public.notion_states
      set last_seen_at = '2026-11-10T18:00:00Z'::timestamptz,
          fsrs = jsonb_set(
            fsrs,
            '{last_review}',
            to_jsonb('2026-11-10T18:00:00.000Z'::text),
            true
          )
      where user_id = ${userId}::uuid
        and notion_id = any(
          array(select jsonb_array_elements_text(${JSON.stringify(programme.notionIds)}::jsonb)::uuid)
        )
    `);
    return { formationId: programme.formationId, moduleId };
  });
}

async function automate(userId: string): Promise<void> {
  const result = await runAutomation(engine(), {
    key: 'micro_seance',
    userId,
    trigger: { type: 'hourly', localHour: 20 },
  });
  if (!result.ok) throw result.error;
  if (result.value.created !== 1) throw new Error('micro-séance non proposée');
}

async function playMicroSession(page: import('@playwright/test').Page): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    if (await page.getByTestId('gq-end').isVisible()) return;
    const next = page.getByTestId('gq-next');
    await expect(next).toBeVisible();
    if (await page.getByTestId('gq-recall').isVisible()) {
      await page.getByTestId('recall-card-flip').click();
      await page.getByTestId('recall-grade-good').click();
    } else {
      await page.getByTestId('gq-skip').click();
    }
    await expect(next).toBeEnabled({ timeout: 15_000 });
    const label = (await next.textContent()) ?? '';
    await next.click();
    if (label.includes('Terminer')) {
      await expect(page.getByTestId('gq-end')).toBeVisible({ timeout: 30_000 });
      return;
    }
  }
  await expect(page.getByTestId('gq-end')).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({
    email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`,
  });
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await closeDb();
});

test('micro-séance proposée puis faite @SPEC-713', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}, testInfo) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  const seeded = await seed(current.userId);
  await automate(current.userId);
  const quizUrl = `/formations/${seeded.formationId}/quiz-global?mode=micro`;

  await page.goto('/accueil');
  await page.getByTestId('header-notifications').click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  const item = panel.getByText('Micro-séance de secours').first();
  await expect(item).toBeVisible();
  await expect(panel).toContainText(
    'Pas eu le temps aujourd’hui ? 5 minutes de cartes de rappel suffisent pour garder votre série.',
  );
  await captureEvidence('notification-micro');

  // CA-3 — the notification opens the micro quiz with the selected duration.
  await item.click();
  await expect(page).toHaveURL(new RegExp(`${quizUrl.replace('?', '\\?')}$`));
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-micro')).toHaveText('Micro-séance · 5 min');
  await expect(page.getByTestId('gq-mode-note')).toContainText(
    'Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés.',
  );
  await expect(page.getByTestId('gq-mode-note').getByRole('link', { name: 'Régler' })).toHaveAttribute(
    'href',
    '/parametres#automatismes',
  );
  await captureEvidence('quiz-global-micro');

  await playMicroSession(page);
  await expect(page.getByTestId('gq-end')).toBeVisible();
  await testInfo.attach('session-summary', {
    body: JSON.stringify({ completedAt: NOW, url: quizUrl }, null, 2),
    contentType: 'application/json',
  });

  // CA-4 — the action is consumed, the slot is done and the day qualifies for the streak.
  const rows = await serviceDb().execute<{
    status: string;
    summary: string;
    slot_status: string;
    qualifying: boolean;
  }>(sql`
    select aa.status::text as status,
           aa.summary,
           ss.status::text as slot_status,
           da.qualifying
    from public.automation_actions aa
    join public.schedule_slots ss
      on ss.id = (aa.undo_payload ->> 'slotId')::uuid
    join public.daily_activity da
      on da.user_id = aa.user_id and da.day = '2026-11-11'::date
    where aa.user_id = ${current.userId}::uuid and aa.automation = 'micro_seance'
  `);
  expect(rows[0]?.status).toBe('consumed');
  expect(rows[0]?.slot_status).toBe('done');
  expect(rows[0]?.qualifying).toBe(true);

  await page.goto('/accueil');
  const card = page.getByTestId('tutor-acted');
  await expect(card).toBeVisible();
  const line = card
    .getByText(/micro-séance de 5 min faite/i)
    .first();
  await expect(line).toBeVisible();
  await expect(card).toContainText('votre série est conservée');
  await captureEvidence('accueil-micro-faite');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('quiz global en mode micro, jetons et structure @SPEC-713 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  const seeded = await seed(current.userId);
  await automate(current.userId);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');
  await page.getByTestId('header-notifications').click();
  const panel = page.getByTestId('notification-panel');
  const item = panel.getByText('Micro-séance de secours').first();
  await expect(item).toBeVisible();
  const row = panel
    .locator('a', { hasText: 'Micro-séance de secours' })
    .first();
  const pastille = row.locator('span[aria-hidden="true"]').first();
  await expect(pastille).toHaveCSS('background-color', 'rgb(238, 248, 207)');
  await expect(pastille).toHaveCSS('color', 'rgb(63, 90, 0)');
  await page.keyboard.press('Escape');

  await page.goto(`/formations/${seeded.formationId}/quiz-global?mode=micro`);
  await expect(page.getByTestId('gq-mode-micro')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('gq-mode-full')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('gq-mode-micro')).toHaveText('Micro-séance · 5 min');
  await expect(page.getByTestId('gq-rail')).toBeVisible();
  await captureEvidence('quiz-global-micro-visuel');

  // §10 — the selected mode is dark, the other one muted, and the note carries the link.
  await expectTokens(page, {
    '[data-testid="gq-mode-micro"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="gq-mode-full"]': {
      color: '#62626B',
    },
  });
  await expect(page.getByTestId('gq-mode-note')).toContainText('Version courte de secours');
  await expect(page.getByTestId('gq-mode-note').getByRole('link', { name: 'Régler' })).toBeVisible();
  await axeCheck();
  await expectScreenshotBaseline(page, 'quiz-global-micro.png');
});
