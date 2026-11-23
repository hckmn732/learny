// SPEC-717 — automatisme 6 : questions transformées en cartes (SCR-03). The journey starts from
// the demonstration dataset of SPEC-115, runs the real automation on the seeded tutor question,
// accepts the pending card from the home banner and checks the created brick. The automatic mode
// publishes a second card and a replayed delivery creates nothing. The visual test fixes the
// clock, controls the rendered tokens and writes the desktop/mobile baselines of the home banner.
import { randomUUID } from 'node:crypto';

import { runAutomation, type AutomationEngineContext } from '@learny/automations';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/testing/db';
import {
  DEMO_USERS,
  demoChapterId,
  demoFormationId,
  demoId,
  demoNotionId,
  demoUserId,
} from '@learny/testing/db-factories';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ALEX_ID = demoUserId('alex');
const SAP = demoFormationId('sap');
const COURSE_KEY = 'alex:sap:m3';
const COURSE_ID = demoId('course', COURSE_KEY);
const CONVERSATION_ID = demoId('conversation', 'alex', COURSE_KEY);
const QUESTION_ID = demoId('message', COURSE_KEY, '2');
const CHAPTER_ID = demoChapterId('sap', 3, 2);
const NOTION_A = demoNotionId('sap:m3:c2:n4');
const NOTION_B = demoNotionId('sap:m3:c2:n5');
const QUESTION = 'Je confonds encore la clé de comptabilisation et le type de pièce.';
const RESCHEDULE_ID = demoId('automation-action', 'reschedule');
const NOW = '2026-11-11T12:20:00.000Z';

let session: TestSession | null = null;

const clock = { now: () => new Date(NOW) };

function engine(): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

async function runCard(notionId: string): Promise<void> {
  const result = await runAutomation(engine(), {
    key: 'questions_cartes',
    userId: ALEX_ID,
    trigger: {
      type: 'event',
      name: 'tutor/question-asked',
      data: {
        userId: ALEX_ID,
        formationId: SAP,
        courseId: COURSE_ID,
        conversationId: CONVERSATION_ID,
        messageId: QUESTION_ID,
        chapterId: CHAPTER_ID,
        notionIds: [notionId],
        text: QUESTION,
      },
    },
  });
  if (!result.ok) throw result.error;
}

async function setMode(mode: 'confirm' | 'auto'): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (${ALEX_ID}::uuid, 'questions_cartes', true, ${JSON.stringify({ mode })}::jsonb)
    on conflict (user_id, key) do update
      set enabled = true, params = excluded.params
  `);
}

async function clearQuestionCards(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.bricks
    where owner_id = ${ALEX_ID}::uuid
      and id in (
        select (payload ->> 'brickId')::uuid
        from public.automation_actions
        where user_id = ${ALEX_ID}::uuid
          and automation = 'questions_cartes'
          and payload ->> 'brickId' is not null
      )
  `);
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${ALEX_ID}::uuid and automation = 'questions_cartes'
  `);
}

async function hideSeedProposal(): Promise<void> {
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'declined', decided_at = created_at
    where id = ${RESCHEDULE_ID}::uuid
  `);
}

async function restoreSeedProposal(): Promise<void> {
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'pending_consent', decided_at = null, undo_payload = null
    where id = ${RESCHEDULE_ID}::uuid
  `);
}

async function questionCardActions(): Promise<
  { id: string; status: string; payload: Record<string, unknown> }[]
> {
  return serviceDb().execute<{ id: string; status: string; payload: Record<string, unknown> }>(sql`
    select id::text as id, status::text as status, payload
    from public.automation_actions
    where user_id = ${ALEX_ID}::uuid and automation = 'questions_cartes'
    order by created_at asc, id asc
  `);
}

async function questionCardBricks(): Promise<{ id: string; status: string }[]> {
  return serviceDb().execute<{ id: string; status: string }>(sql`
    select b.id::text as id, b.status::text as status
    from public.bricks b
    where b.owner_id = ${ALEX_ID}::uuid
      and b.id in (
        select (payload ->> 'brickId')::uuid
        from public.automation_actions
        where user_id = ${ALEX_ID}::uuid
          and automation = 'questions_cartes'
          and payload ->> 'brickId' is not null
      )
    order by b.created_at asc, b.id asc
  `);
}

test.describe('automatisme 6 — parcours', () => {
  test.beforeAll(async () => {
    await restoreDemoData();
  });

  test.beforeEach(async ({ context, baseURL }) => {
    if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
    await hideSeedProposal();
    await clearQuestionCards();
    await setMode('confirm');
    session = await createDemoSession(ALEX_ID, ALEX.email);
    await context.addCookies(
      session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
    );
  });

  test.afterEach(async () => {
    const current = session;
    if (current !== null) await deleteTestSession(current);
    session = null;
    await clearQuestionCards();
    await setMode('confirm');
  });

  test.afterAll(async () => {
    await restoreSeedProposal();
    await closeDb();
  });

  test('parcours SPEC-717 @SPEC-717', async ({
    page,
    axeCheck,
    captureEvidence,
    consoleErrors,
  }) => {
    await page.clock.setFixedTime(new Date(NOW));
    await runCard(NOTION_A);

    await page.goto('/accueil');
    await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
      'Le tuteur propose · votre accord est demandé',
    );
    await expect(page.getByTestId('tutor-proposal-text')).toContainText(
      'peut devenir une carte de rappel',
    );
    await expect(page.getByTestId('tutor-proposal-accept')).toHaveText('Accepter');
    await expect(page.getByTestId('tutor-proposal-decline')).toHaveText('Refuser');
    expect(await questionCardBricks()).toHaveLength(0);

    // CA-1 — l'acceptation crée une seule carte et aucune seconde acceptation ne la duplique.
    await page.getByTestId('tutor-proposal-accept').click();
    await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
      'Le tuteur a agi pour vous',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('tutor-acted')).toContainText('Carte de rappel');
    const actions = await questionCardActions();
    expect(actions).toHaveLength(1);
    expect(actions[0]?.status).toBe('applied');
    expect(typeof actions[0]?.payload.brickId).toBe('string');
    const bricks = await questionCardBricks();
    expect(bricks).toHaveLength(1);
    const applied = await serviceDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.event_outbox
      where event_id = ${`automation-action-applied:${actions[0]?.id ?? ''}`}
    `);
    expect(applied[0]?.n).toBe(1);

    await page.reload();
    await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
      'Le tuteur a agi pour vous',
      { timeout: 20_000 },
    );
    expect(await questionCardBricks()).toHaveLength(1);
    await axeCheck();
    await captureEvidence('carte-acceptee');
    expect(consoleErrors).toEqual([]);

    // CA-2 — le mode automatique publie une seconde carte ; un rejeu n'en crée pas d'autre.
    await setMode('auto');
    await runCard(NOTION_B);
    const auto = await questionCardActions();
    expect(auto).toHaveLength(2);
    expect(auto[1]?.status).toBe('applied');
    const autoBricks = await questionCardBricks();
    expect(autoBricks).toHaveLength(2);
    await runCard(NOTION_B);
    expect(await questionCardActions()).toHaveLength(2);
    expect(await questionCardBricks()).toHaveLength(2);
    await captureEvidence('mode-automatique');
  });
});

test.describe('automatisme 6 — conformité visuelle', () => {
  test.beforeAll(async () => {
    await restoreDemoData();
  });

  test.beforeEach(async ({ context, baseURL }) => {
    if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
    await hideSeedProposal();
    await clearQuestionCards();
    await setMode('auto');
    await runCard(NOTION_B);
    await setMode('confirm');
    await runCard(NOTION_A);
    session = await createDemoSession(ALEX_ID, ALEX.email);
    await context.addCookies(
      session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
    );
  });

  test.afterEach(async () => {
    const current = session;
    if (current !== null) await deleteTestSession(current);
    session = null;
    await clearQuestionCards();
    await setMode('confirm');
  });

  test.afterAll(async () => {
    await restoreSeedProposal();
    await closeDb();
  });

  test('conformité SPEC-717 @SPEC-717 @visual', async ({ page, axeCheck }) => {
    await page.clock.setFixedTime(new Date(NOW));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/accueil');

    await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
      'Le tuteur propose · votre accord est demandé',
    );
    await expect(page.getByTestId('tutor-proposal-decline')).toHaveText('Refuser');
    await expect(page.getByTestId('tutor-acted')).toBeVisible();
    await expect(page.getByTestId('tutor-acted-title')).toHaveText('Le tuteur a agi pour vous');
    await expect(page.getByTestId('tutor-acted')).toContainText('Carte de rappel');

    await expectTokens(page, {
      '[data-testid="tutor-proposal-banner"]': {
        'background-color': colors.surface,
        'border-left-color': colors.orange,
      },
      '[data-testid="tutor-proposal-kicker"]': { color: colors['orange-ink'] },
      '[data-testid="tutor-proposal-accept"]': {
        'background-color': colors.ink,
        color: colors.white,
      },
      '[data-testid="tutor-acted"]': { 'background-color': colors.surface },
      '[data-testid="tutor-acted-title"]': { color: colors.ink },
    });

    const regions = await page
      .locator('main section[data-testid]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('data-testid'))
          .filter((value) => value === 'tutor-proposal-banner' || value === 'tutor-acted'),
      );
    expect(regions).toEqual(['tutor-proposal-banner', 'tutor-acted']);

    await axeCheck();
    await expectScreenshotBaseline(page, 'spec-717-carte.png', { fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tutor-proposal-accept')).toBeVisible();
    await axeCheck();
    await expectScreenshotBaseline(page, 'spec-717-carte-mobile.png', { fullPage: true });
  });
});
