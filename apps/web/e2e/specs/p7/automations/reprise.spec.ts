// SPEC-712 — bandeau « Le tuteur propose » (SCR-03, CA-5, CA-6, CA-8). The demonstration dataset
// of SPEC-115 carries the pending `reprise_proposed` action of the mockup; the clock is frozen on
// 2026-11-11T12:20:00Z by the Playwright fixture. Every test restores the seeded action so the
// shared end-to-end run stays deterministic.
import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const ACTION_ID = demoId('automation-action', 'reschedule');
const MISSED_SLOT_ID = demoId('slot', 'm0');
const SUMMARY =
  '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda.';
const REFERENCE_DIR = fileURLToPath(new URL('../../../../../../design/references/', import.meta.url));

let session: TestSession;

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
  // La marge de vendredi 14:00–16:00 du seed recouvrirait l'alternative « Vendredi 15:00 » :
  // elle est libérée le temps de cette suite, puis restaurée par `afterAll`.
  await serviceDb().execute(sql`
    update public.schedule_slots set status = 'cancelled', updated_at = now()
    where id = ${demoId('slot', 'v3')}::uuid
  `);
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${alexId}::uuid and automation = 'reprise'
      and id <> ${ACTION_ID}::uuid
  `);
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'pending_consent',
        decided_at = null,
        undo_payload = null,
        summary = ${SUMMARY}
    where id = ${ACTION_ID}::uuid
  `);
}

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await restoreSeed();
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterAll(async () => {
  await restoreSeed();
  await serviceDb().execute(sql`
    update public.schedule_slots set status = 'planned', updated_at = now()
    where id = ${demoId('slot', 'v3')}::uuid
  `);
  await closeDb();
});

test('bandeau de reprise : autre créneau puis annuler @SPEC-712', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto('/accueil');
  const banner = page.getByTestId('tutor-proposal-banner');
  await expect(banner).toBeVisible();

  // CA-5 — les textes exacts de la maquette.
  await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
    'Le tuteur propose · votre accord est demandé',
  );
  await expect(page.getByTestId('tutor-proposal-text')).toHaveText(SUMMARY);
  await expect(page.getByTestId('tutor-proposal-accept')).toHaveText('Accepter');
  await expect(page.getByTestId('tutor-proposal-other')).toHaveText('Autre créneau');
  await captureEvidence('accueil-bandeau-defaut');
  await axeCheck();

  // CA-5 — « Autre créneau » déplie les trois pastilles et le refus.
  await page.getByTestId('tutor-proposal-other').click();
  await expect(page.getByTestId('tutor-proposal-slots')).toBeVisible();
  await expect(page.getByTestId('tutor-proposal-slot-0')).toHaveText('Jeudi 15:00');
  await expect(page.getByTestId('tutor-proposal-slot-1')).toHaveText('Vendredi 15:00');
  await expect(page.getByTestId('tutor-proposal-slot-2')).toHaveText('Lundi 16 nov., 9:00');
  await expect(page.getByTestId('tutor-proposal-decline')).toHaveText('Ne pas replacer');
  await captureEvidence('accueil-bandeau-deplie');

  // CA-5 — choisir vendredi crée le créneau et affiche « Séance replacée ».
  await page.getByTestId('tutor-proposal-slot-1').click();
  await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText('Séance replacée');
  await expect(page.getByTestId('tutor-proposal-text')).toContainText(
    'C’est noté : reprise de « Ledgers parallèles » vendredi 15:00.',
  );
  await expect(page.getByTestId('tutor-proposal-undo')).toHaveText('Annuler');
  await captureEvidence('accueil-bandeau-replace');

  const created = await serviceDb().execute<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
  }>(sql`
    select id::text as id, starts_at::text as starts_at, ends_at::text as ends_at,
           status::text as status
    from public.schedule_slots
    where user_id = ${demoUserId('alex')}::uuid and moved_from_id = ${MISSED_SLOT_ID}::uuid
  `);
  expect(created).toHaveLength(1);
  expect(new Date(created[0]?.starts_at ?? '').toISOString()).toBe(
    new Date('2026-11-13T15:00:00+01:00').toISOString(),
  );

  // Le créneau apparaît dans la semaine de l'agenda.
  await page.goto('/agenda?vue=semaine&date=2026-11-13');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ledgers parallèles, 15:00 – 16:00/ })).toBeVisible();

  // CA-6 — « Annuler » retire le créneau et ramène la proposition.
  await page.goto('/accueil');
  await page.getByTestId('tutor-proposal-undo').click();
  await expect(page.getByTestId('tutor-proposal-kicker')).toHaveText(
    'Le tuteur propose · votre accord est demandé',
  );
  const cancelled = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.schedule_slots where id = ${created[0]?.id ?? ''}::uuid
  `);
  expect(cancelled[0]?.status).toBe('cancelled');
  await axeCheck();
});

test('refus : ne pas replacer @SPEC-712', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto('/accueil');
  await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible();
  await page.getByTestId('tutor-proposal-other').click();
  await page.getByTestId('tutor-proposal-decline').click();
  await expect(page.getByTestId('tutor-proposal-banner')).toHaveCount(0);

  // Le journal montre le refus avec le préfixe d'EF-8.
  await page.goto('/parametres');
  await page.getByRole('tab', { name: 'Automatismes' }).click();
  const row = page.getByTestId('automation-journal-row').first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('automation-journal-summary')).toContainText('Refusé :');
  await captureEvidence('parametres-journal-refus');
  await axeCheck();
});

test('accueil avec bandeau conforme à la maquette @SPEC-712 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');
  const banner = page.getByTestId('tutor-proposal-banner');
  await expect(banner).toBeVisible();
  await axeCheck();

  // CA-8 — les jetons de la maquette.
  await expectTokens(page, {
    '[data-testid="tutor-proposal-banner"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-left-color': '#F97316',
      'border-top-left-radius': '18px',
    },
    '[data-testid="tutor-proposal-kicker"]': { color: '#8F3305' },
    '[data-testid="tutor-proposal-accept"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="tutor-proposal-other"]': { 'border-top-color': '#DAD9D3' },
  });
  await captureEvidence('accueil-bandeau-visuel');

  const [region] = await compareRegions(page, {
    reference: `${REFERENCE_DIR}SCR-03-base-desktop.png`,
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'SCR-03-bandeau',
        locator: banner,
        rect: { x: 310, y: 161, width: 1044, height: 86 },
      },
    ],
  });
  if (region !== undefined) {
    await testInfo.attach('SCR-03-bandeau-side-by-side', {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('SCR-03-bandeau-diff', {
      path: region.diffPath,
      contentType: 'image/png',
    });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `SCR-03-bandeau:${region.ratio.toFixed(4)}`,
    });
    expect(region.ratio, 'écart à la maquette du bandeau').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }
  await expectScreenshotBaseline(page, 'accueil-bandeau.png');
});
