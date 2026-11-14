import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = [
  'spec-115-profile',
  'spec-115-formations',
  'spec-115-sap',
  'spec-115-group',
  'spec-115-agenda',
  'spec-115-checks',
];

const HEADINGS = [
  'Données de démonstration',
  'Formations',
  'Programme SAP',
  'Groupe',
  'Agenda 9–13 novembre',
  'Cohérence des captures',
];

const DAYS = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
];

test.beforeAll(async () => {
  // The demo dataset is shared by the whole e2e run: restore it before asserting its state.
  await restoreDemoData();
});

test('inspecte les données de démonstration @SPEC-115', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-115');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-115 · Jeu de données de démonstration et fabriques');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-1 — profile measured from the seeded row, not a hard-coded success.
  await expect(page.getByTestId('spec-115-profile-name')).toHaveText('Alex Perrin');
  await expect(page.getByTestId('spec-115-profile-email')).toHaveText(
    'alex.perrin@demo.learny.test',
  );
  await expect(page.getByTestId('spec-115-profile-timezone')).toHaveText(
    'Fuseau horaire : Europe/Paris',
  );
  await expect(page.getByTestId('spec-115-profile-streak')).toHaveText('Série : 12 jours');

  // Three active/proposed formations and two completed ones (EF-1, EF-6).
  await expect(page.getByTestId('spec-115-formations-summary')).toHaveText(
    '3 formations en cours ou proposées · 2 terminées',
  );
  await expect(page.getByTestId('spec-115-formation')).toHaveCount(5);
  const formationTitles = await page
    .getByTestId('spec-115-formation')
    .locator('span:first-child')
    .allTextContents();
  expect(formationTitles).toEqual([
    'SAP S/4HANA Finance',
    'Gestion de projet agile',
    "Python pour l'analyse de données",
    "Excel pour l'analyse financière",
    'Anglais professionnel B2',
  ]);
  const statuses = await page
    .getByTestId('spec-115-formation')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-status')));
  expect(statuses).toEqual(['active', 'active', 'programme_proposed', 'completed', 'completed']);

  // 7 modules and 48 notions (CA-1, ET-6).
  await expect(page.getByTestId('spec-115-sap-summary')).toHaveText('SAP : 7 modules · 48 notions');
  await expect(page.getByTestId('spec-115-sap-chapters')).toHaveText('24 chapitres');

  // Shared group of three members (EF-1, CA-3).
  await expect(page.getByTestId('spec-115-group-summary')).toHaveText('Groupe : 3 membres');
  const names = (await page.getByTestId('spec-115-group-names').textContent()) ?? '';
  expect(names).toContain('Alex');
  expect(names).toContain('Camille');
  expect(names).toContain('Hugo');

  // Agenda 9–13 November, 22 local slots, today's four events (EF-3).
  await expect(page.getByTestId('spec-115-agenda-day')).toHaveCount(5);
  const dates = await page
    .getByTestId('spec-115-agenda-day')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-date')));
  expect(dates).toEqual(DAYS);
  await expect(page.getByTestId('spec-115-agenda-summary')).toHaveText(
    /^23 créneaux du 9 au 13 novembre 2026/,
  );
  await expect(
    page.locator('[data-testid="spec-115-agenda-day"][data-date="2026-11-11"]'),
  ).toHaveAttribute('data-slots', '5');
  const todaySlots = await page
    .locator('[data-testid="spec-115-agenda-day"][data-date="2026-11-11"]')
    .getByTestId('spec-115-agenda-slot')
    .allTextContents();
  expect(todaySlots).toEqual([
    '09:00–12:00 · Relecture ciblée',
    '13:50–13:52 · Échauffement',
    '14:00–15:00 · Quiz de validation',
    '15:00–16:00 · Marge de remédiation',
    '17:00–17:30 · Quiz global',
  ]);

  // Coherence table: every row is computed from the database and cites its mockup source.
  await expect(page.getByTestId('spec-115-check')).toHaveCount(8);
  const checks = await page
    .getByTestId('spec-115-check')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        key: element.getAttribute('data-key'),
        ok: element.getAttribute('data-ok'),
      })),
    );
  expect(checks.map((entry) => entry.key)).toEqual([
    'sap.modules',
    'sap.notions',
    'formations.active_or_proposed',
    'formations.completed',
    'group.members',
    'agenda.slots',
    'agenda.days',
    'notifications.unread',
  ]);
  expect(checks.every((entry) => entry.ok === 'true')).toBe(true);
  const sapModules = page.locator('[data-testid="spec-115-check"][data-key="sap.modules"]');
  await expect(sapModules.locator('td').nth(0)).toHaveText('7');
  await expect(sapModules.locator('td').nth(1)).toHaveText('7');
  await expect(sapModules).toContainText('Programme.dc.html');

  await axeCheck();
  await captureEvidence('spec-115-demo');
  expect(consoleErrors).toEqual([]);
});

test('données de démonstration conformes @SPEC-115 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-115');

  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="spec-115-profile"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-115-formations"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-115-sap"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-115-group"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-115-agenda"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-115-checks"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the coherence table stays inside a horizontally scrollable region.
  if (page.viewportSize()?.width === 390) {
    const region = page.getByTestId('spec-115-checks').locator('div.overflow-x-auto').first();
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls, 'le tableau de cohérence doit défiler horizontalement').toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-115-demo.png', { fullPage: true });
});
