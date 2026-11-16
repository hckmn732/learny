import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const SAP = demoFormationId('sap');
const PROPOSAL_ID = demoId('automation-action', 'reschedule');
const MISSED_SLOT_ID = demoId('slot', 'm0');
const FRIDAY_BUFFER_ID = demoId('slot', 'v3');
const CONSUMED_ID = demoId('automation-action', 'schedule-remains');
const PROPOSAL_SUMMARY =
  '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda.';
const REMEDIATION_SUMMARY = 'Marge de remédiation réservée mercredi de 15:00 à 16:00.';
const REFERENCE = 'design/references/SCR-03-base-desktop.png';

let session: TestSession | null = null;

async function restoreSeed(): Promise<void> {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  const alexId = demoUserId('alex');
  await serviceDb().execute(sql`
    delete from public.schedule_slots
    where user_id = ${alexId}::uuid and moved_from_id = ${MISSED_SLOT_ID}::uuid
  `);
  await serviceDb().execute(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${MISSED_SLOT_ID}::uuid, ${alexId}::uuid, ${SAP}::uuid, 'course', 'Ledgers parallèles',
      '2026-11-03T10:30:00+01:00'::timestamptz, '2026-11-03T12:00:00+01:00'::timestamptz,
      'missed', 'planner'
    )
    on conflict (id) do update
      set status = 'missed', moved_from_id = null, updated_at = now()
  `);
  // La marge de vendredi 14:00–16:00 recouvrirait l'alternative « Vendredi 15:00 ».
  await serviceDb().execute(sql`
    update public.schedule_slots set status = 'cancelled', updated_at = now()
    where id = ${FRIDAY_BUFFER_ID}::uuid
  `);
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${alexId}::uuid and automation = 'reprise'
      and id <> ${PROPOSAL_ID}::uuid
  `);
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'pending_consent',
        decided_at = null,
        undo_payload = null,
        summary = ${PROPOSAL_SUMMARY},
        payload = (payload - 'chosenStartsAt' - 'choice')
    where id = ${PROPOSAL_ID}::uuid
  `);
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'applied',
        decided_at = created_at,
        undo_payload = null,
        summary = ${REMEDIATION_SUMMARY}
    where id = ${CONSUMED_ID}::uuid
  `);
}

test.beforeAll(async () => {
  // The demonstration dataset is shared by the whole end-to-end run: restore it first.
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await restoreSeed();
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3122' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await restoreSeed();
  await serviceDb().execute(sql`
    update public.schedule_slots set status = 'planned', updated_at = now()
    where id = ${FRIDAY_BUFFER_ID}::uuid
  `);
  await closeDb();
});

test('parcours SPEC-722 @SPEC-722', async ({ page, axeCheck, captureEvidence }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/accueil');

  // EF-1 — la proposition du seed est dans le bandeau.
  await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible();
  await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
    'Le tuteur propose · votre accord est demandé',
  );
  await expect(page.getByTestId('tutor-proposal-text')).toHaveText(PROPOSAL_SUMMARY);

  // EF-2 — la carte et son lien « Régler ».
  const card = page.getByTestId('tutor-acted');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('Le tuteur a agi pour vous');
  await expect(page.getByTestId('automation-settings-link')).toHaveAttribute(
    'href',
    '/parametres#automatismes',
  );
  await expect(page.getByTestId('automation-action').first()).toBeVisible();
  await expect(card).toContainText('Lacune « Variante d’exercice » : carte de rappel ajoutée');
  await expect(card).toContainText('18 notions étaient dues');
  await expect(card).toContainText(REMEDIATION_SUMMARY);
  // QA SCR-03 — une action appliquée sans charge d'annulation n'offre pas « Annuler » (400 sinon).
  await expect(
    card
      .getByTestId('automation-action')
      .filter({ hasText: REMEDIATION_SUMMARY })
      .getByTestId('automation-action-undo'),
  ).toHaveCount(0);
  await axeCheck();

  // CA-1 — Accepter une alternative applique l'action une fois, la carte et l'annonce se mettent à
  // jour. Le créneau proposé par défaut (jeudi 10:30) est déjà occupé par le seed SPEC-115.
  await page.getByTestId('tutor-proposal-other').click();
  await page.getByTestId('tutor-proposal-slot-1').click();
  await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText('Séance replacée');
  const acceptedLine = page
    .getByTestId('automation-action')
    .filter({ hasText: 'Ledgers parallèles' })
    .first();
  await expect(acceptedLine).toBeVisible();
  await expect(acceptedLine).toHaveAttribute('data-status', 'applied');
  await expect(acceptedLine.getByTestId('automation-action-undo')).toHaveText('Annuler');
  const applied = await serviceDb().execute<{ n: number }>(sql`
    select count(*)::int as n from public.event_outbox
    where event_id = ${`automation-action-applied:${PROPOSAL_ID}`}
  `);
  expect(applied[0]?.n).toBe(1);
  const proposal = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.automation_actions
    where id = ${PROPOSAL_ID}::uuid
  `);
  expect(proposal[0]?.status).toBe('applied');

  // CA-2 — une action consommée garde son résumé et n'affiche pas « Annuler ».
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'consumed', decided_at = created_at
    where id = ${CONSUMED_ID}::uuid
  `);
  await page.reload();
  const consumedLine = page
    .getByTestId('automation-action')
    .filter({ hasText: REMEDIATION_SUMMARY })
    .first();
  await expect(consumedLine).toBeVisible();
  await expect(consumedLine).toHaveAttribute('data-status', 'consumed');
  await expect(consumedLine.getByTestId('automation-action-undo')).toHaveCount(0);
  await expect(consumedLine.getByTestId('automation-action-open')).toBeVisible();
  await expect(page.getByTestId('automation-settings-link')).toHaveAttribute(
    'href',
    '/parametres#automatismes',
  );
  await axeCheck();
  await captureEvidence('spec-722-parcours');
});

test('états vide et erreur @SPEC-722', async ({ page, axeCheck, baseURL, context }) => {
  await page.clock.setFixedTime(NOW);
  const fresh = await createTestSession();
  try {
    await serviceDb().execute(sql`
      update public.profiles set onboarding_step = 'done' where id = ${fresh.userId}::uuid
    `);
    const current = session;
    if (current !== null) await deleteTestSession(current);
    session = null;
    await context.clearCookies();
    await context.addCookies(
      fresh.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3122' })),
    );

    // CL-4 — ni proposition ni action récente : le bandeau est absent, la carte est vide.
    await page.goto('/accueil');
    await expect(page.getByTestId('tutor-proposal-banner')).toHaveCount(0);
    await expect(page.getByTestId('tutor-acted')).toBeVisible();
    await expect(page.getByTestId('tutor-acted-empty')).toHaveText('Aucune action récente du tuteur.');
    await axeCheck();

    // État erreur : la requête échoue, le message et « Réessayer » restent accessibles.
    await page.route('**/api/v1/me/automation-actions*', (route) => route.abort());
    await page.reload();
    await expect(page.getByTestId('tutor-acted-error')).toBeVisible();
    await expect(page.getByTestId('tutor-acted-error')).toContainText(
      'Impossible de charger les actions du tuteur.',
    );
    await axeCheck();
    await page.unroute('**/api/v1/me/automation-actions*');
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByTestId('tutor-acted-empty')).toBeVisible();
  } finally {
    await deleteTestSession(fresh);
  }
});

test('conformité SCR-03 carte du tuteur @SPEC-722 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');

  const card = page.getByTestId('tutor-acted');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('home-slot-agent-feed')).toBeVisible();
  await expect(page.getByTestId('tutor-acted-title')).toHaveText('Le tuteur a agi pour vous');
  await expect(page.getByTestId('automation-settings-link')).toHaveText('Régler');
  await expect(page.getByTestId('automation-action')).toHaveCount(5);

  // Jetons de la maquette : carte blanche, bord et rayon, pastille verte du quiz lissé.
  await expectTokens(page, {
    '[data-testid="tutor-acted"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="automation-settings-link"]': { color: '#111113' },
    '[data-testid="automation-action"]:first-of-type [data-testid="automation-action-dot"]': {
      'background-color': '#0F9F7F',
    },
  });
  await axeCheck();
  await captureEvidence('spec-722-carte-visuel');

  const [region] = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'SCR-03-tuteur-a-agi',
        locator: card,
        rect: { x: 945, y: 684, width: 408, height: 604 },
      },
    ],
  });
  if (region !== undefined) {
    await testInfo.attach('SCR-03-tuteur-a-agi-side-by-side', {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('SCR-03-tuteur-a-agi-diff', {
      path: region.diffPath,
      contentType: 'image/png',
    });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `SCR-03-tuteur-a-agi:${region.ratio.toFixed(4)}`,
    });
    expect(region.ratio, 'écart à la maquette de la carte').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }
  await expectScreenshotBaseline(card, 'spec-722-carte-desktop.png');

  // Mobile : mêmes textes, même ordre, capture de non-régression ≤ 1 %.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('tutor-acted')).toBeVisible();
  await expect(page.getByTestId('automation-settings-link')).toBeVisible();
  await axeCheck();
  await expectScreenshotBaseline(
    page.getByTestId('tutor-acted'),
    'spec-722-carte-mobile.png',
  );
});
