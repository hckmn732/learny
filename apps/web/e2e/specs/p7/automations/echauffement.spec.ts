// SPEC-714 — échauffement of the home screen (SCR-03, CA-3, CA-4, CA-8). The demonstration dataset
// of SPEC-115 carries the warm-up of the mockup (13:50 before the 14:00 validation quiz); the
// Playwright fixture freezes the clock on 2026-11-11T12:20:00Z. Each test restores the seeded
// memory, action and slot so the shared end-to-end run stays deterministic.
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { closeDb, serviceDb, sql } from '@learny/db';
import {
  DEMO_USERS,
  demoFormationId,
  demoId,
  demoNotionId,
  demoUserId,
} from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ALEX_ID = demoUserId('alex');
const SAP = demoFormationId('sap');
const ACTION_ID = demoId('automation-action', 'warmup');
const SLOT_ID = demoId('slot', 'w2w');
const NOTION_PC = demoNotionId('sap:m2:c1:n2');
const REFERENCE_DIR = fileURLToPath(new URL('../../../../../../design/references/', import.meta.url));
const REFERENCE = `${REFERENCE_DIR}SCR-03-base-desktop.png`;

interface Snapshot {
  states: unknown[];
  daily: unknown[];
  action: unknown;
  globalSessions: string[];
}

let snapshot: Snapshot;
let session: TestSession;

async function captureSnapshot(): Promise<Snapshot> {
  const states = await serviceDb().execute<{ [key: string]: unknown }>(sql`
    select to_jsonb(ns) as row
    from public.notion_states ns
    where ns.user_id = ${ALEX_ID}::uuid
      and ns.notion_id in (select id from public.notions where formation_id = ${SAP}::uuid)
  `);
  const daily = await serviceDb().execute<{ [key: string]: unknown }>(sql`
    select to_jsonb(da) as row from public.daily_activity da where da.user_id = ${ALEX_ID}::uuid
  `);
  const actions = await serviceDb().execute<{ [key: string]: unknown }>(sql`
    select to_jsonb(aa) as row from public.automation_actions aa where aa.id = ${ACTION_ID}::uuid
  `);
  const sessions = await serviceDb().execute<{ id: string }>(sql`
    select id::text as id from public.activities
    where owner_id = ${ALEX_ID}::uuid and kind = 'global_quiz_session'
  `);
  return {
    states: states.map((row) => row.row),
    daily: daily.map((row) => row.row),
    action: actions[0]?.row,
    globalSessions: sessions.map((row) => row.id),
  };
}

async function restoreSnapshot(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.review_logs
    where user_id = ${ALEX_ID}::uuid and source = 'warmup'
  `);
  await serviceDb().execute(sql`
    delete from public.attempts
    where user_id = ${ALEX_ID}::uuid and activity_id = ${demoId('activity', 'warmup')}::uuid
  `);
  await serviceDb().execute(sql`
    delete from public.activities
    where owner_id = ${ALEX_ID}::uuid
      and kind = 'global_quiz_session'
      and id::text not in (select jsonb_array_elements_text(${JSON.stringify(snapshot.globalSessions)}::jsonb))
  `);
  await serviceDb().execute(sql`
    delete from public.notion_states
    where user_id = ${ALEX_ID}::uuid
      and notion_id in (select id from public.notions where formation_id = ${SAP}::uuid)
  `);
  await serviceDb().execute(sql`
    insert into public.notion_states
    select * from jsonb_populate_recordset(null::public.notion_states, ${JSON.stringify(snapshot.states)}::jsonb)
  `);
  await serviceDb().execute(sql`
    delete from public.daily_activity where user_id = ${ALEX_ID}::uuid
  `);
  await serviceDb().execute(sql`
    insert into public.daily_activity
    select * from jsonb_populate_recordset(null::public.daily_activity, ${JSON.stringify(snapshot.daily)}::jsonb)
  `);
  if (snapshot.action !== undefined) {
    await serviceDb().execute(sql`
      delete from public.automation_actions where id = ${ACTION_ID}::uuid
    `);
    await serviceDb().execute(sql`
      insert into public.automation_actions
      select * from jsonb_populate_record(null::public.automation_actions, ${JSON.stringify(snapshot.action)}::jsonb)
    `);
  }
  await serviceDb().execute(sql`
    update public.schedule_slots
    set status = 'planned', updated_at = '2026-11-08T17:00:00Z'::timestamptz
    where id = ${SLOT_ID}::uuid
  `);
}

test.beforeAll(async () => {
  snapshot = await captureSnapshot();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await restoreSnapshot();
  session = await createDemoSession(ALEX_ID, ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await restoreSnapshot();
});

test.afterAll(async () => {
  await restoreSnapshot();
  await closeDb();
});

async function answerAll(page: Page): Promise<void> {
  for (const knew of [true, true, false]) {
    await page.getByTestId('warmup-reveal').click();
    await page.getByTestId(knew ? 'warmup-knew' : 'warmup-review').click();
  }
}

test('échauffement de l’accueil jusqu’au score @SPEC-714', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/accueil');
  const card = page.getByTestId('warmup-card');
  await expect(card).toBeVisible();

  // CA-3 — les textes de la maquette, avant toute réponse.
  await expect(page.getByTestId('warmup-title')).toHaveText(
    'Échauffement · avant votre quiz de 14:00',
  );
  await expect(page.getByTestId('warmup-progress')).toHaveText('Question 1 sur 3');
  await expect(page.getByTestId('warmup-tag')).toHaveText('Vu hier');
  await expect(page.getByTestId('warmup-question')).toHaveText(
    'Quelle clé de comptabilisation pour un débit sur un compte général ?',
  );
  await expect(page.getByTestId('warmup-reveal')).toHaveText('Voir la réponse');
  await captureEvidence('echauffement-question');

  // « Faire » dans « Votre journée » défile vers le bloc.
  const slot = page.getByTestId(`home-slot-${SLOT_ID}`);
  await expect(slot).toBeVisible();
  await slot.getByRole('link', { name: 'Faire' }).click();
  await expect(page).toHaveURL(/#echauffement$/);
  await expect(card).toBeInViewport();

  await page.getByTestId('warmup-reveal').click();
  await expect(page.getByTestId('warmup-answer')).toHaveText(
    '40. Et 50 pour un crédit sur un compte général.',
  );
  await captureEvidence('echauffement-reponse');
  await page.getByTestId('warmup-knew').click();
  await expect(page.getByTestId('warmup-progress')).toHaveText('Question 2 sur 3');

  await page.getByTestId('warmup-reveal').click();
  await page.getByTestId('warmup-knew').click();
  await expect(page.getByTestId('warmup-progress')).toHaveText('Question 3 sur 3');
  await expect(page.getByTestId('warmup-tag')).toHaveText('Prérequis · module 2');

  await page.getByTestId('warmup-reveal').click();
  await page.getByTestId('warmup-review').click();

  const done = page.getByTestId('warmup-done');
  await expect(done).toBeVisible();
  await expect(done).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('warmup-progress')).toHaveText('Terminé');
  await expect(page.getByTestId('warmup-score')).toHaveText('Échauffement fait : 2 sur 3');
  await expect(page.getByTestId('warmup-follow')).toHaveText(
    'À revoir : « Quel objet regroupe la liste des comptes généraux utilisables par une société ». Cette notion repasse dans le quiz global de ce soir.',
  );
  await expect(page.getByTestId('warmup-next')).toHaveText('Passer au quiz de validation');
  await captureEvidence('echauffement-fin');
  await axeCheck();

  // CA-4 — la notion « Plan comptable » entre dans la session du quiz global du soir.
  await page.goto(`/formations/${SAP}/quiz-global`);
  await expect(page.getByTestId('gq-header')).toBeVisible();
  const sessions = await serviceDb().execute<{ config: { items?: { notionIds?: string[] }[] } }>(sql`
    select config from public.activities
    where owner_id = ${ALEX_ID}::uuid and kind = 'global_quiz_session'
      and for_date = '2026-11-11'::date
    order by created_at desc limit 1
  `);
  const notionIds = (sessions[0]?.config.items ?? []).flatMap((item) => item.notionIds ?? []);
  expect(notionIds).toContain(NOTION_PC);
  await captureEvidence('quiz-global-notion-ajoutee');
  await axeCheck();
});

test('bloc d’échauffement conforme à la maquette @SPEC-714 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');
  const card = page.getByTestId('warmup-card');
  await expect(card).toBeVisible();
  await axeCheck();

  // CA-8 — les jetons de la maquette.
  await expectTokens(page, {
    '[data-testid="warmup-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="warmup-title"]': { color: '#111113', 'font-size': '18px', 'font-weight': '600' },
    '[data-testid="warmup-question"]': {
      color: '#111113',
      'font-size': '20px',
    },
    '[data-testid="warmup-tag"]': {
      'background-color': '#E1F4EF',
      color: '#0B5C4D',
    },
    '[data-testid="warmup-segments"] [data-segment="current"]': {
      'background-color': '#111113',
    },
    '[data-testid="warmup-reveal"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
  });
  await captureEvidence('accueil-echauffement-visuel');
  await expect(page.getByTestId('warmup-question')).toHaveCSS('font-family', /Space Grotesk/);

  const [region] = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'SCR-03-echauffement',
        locator: page.getByTestId('warmup-visual'),
        rect: { x: 311, y: 685, width: 614, height: 250 },
      },
    ],
  });
  if (region !== undefined) {
    await testInfo.attach('SCR-03-echauffement-side-by-side', {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('SCR-03-echauffement-diff', {
      path: region.diffPath,
      contentType: 'image/png',
    });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `SCR-03-echauffement:${region.ratio.toFixed(4)}`,
    });
    expect(region.ratio, 'écart à la maquette du bloc d’échauffement').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }

  // Ligne de base de l'état terminé (≤ 1 %).
  await answerAll(page);
  await expect(page.getByTestId('warmup-done')).toBeVisible();
  await expectScreenshotBaseline(card, 'accueil-echauffement-fin.png');
  await axeCheck();
});
