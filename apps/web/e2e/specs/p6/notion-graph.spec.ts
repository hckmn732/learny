import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_NOTION_LINKS } from '@learny/db/seed/fixtures';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { createNotionState, createResource } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReferenceRegion,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T12:20:00Z';

const REFERENCE_DESKTOP = { x: 274, y: 83, width: 1116, height: 724 } as const;
const REFERENCE_MOBILE = { x: 36, y: 633, width: 317, height: 1402 } as const;
const REFERENCE_DIR = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris'
    where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

interface NotionSeed {
  slug: string;
  label: string;
  mastery: number | null;
  gap?: { nature: 'forgetting' | 'confusion' | 'misunderstanding' | 'application'; confusedWith?: string; evidence: string };
}

const MODULE_TITLES = [
  'Fondamentaux de SAP S/4HANA et navigation Fiori',
  'Structure organisationnelle de la Finance',
  'Comptabilité générale',
  'Comptabilité fournisseurs',
  'Comptabilité clients',
  'Immobilisations',
  'Clôture et certification',
];

/** The 48 notions of `Carte.dc.html`, grouped by module. */
const MODULE_NOTIONS: readonly (readonly NotionSeed[])[] = [
  [
    { slug: 's4', label: 'SAP S/4HANA', mastery: 92 },
    { slug: 'fiori', label: 'SAP Fiori', mastery: 90 },
    { slug: 'launchpad', label: 'Launchpad Fiori', mastery: 88 },
    { slug: 'appli', label: 'Application Fiori', mastery: 85 },
    { slug: 'role', label: 'Rôle utilisateur', mastery: 82 },
    { slug: 'bp', label: 'Partenaire (Business Partner)', mastery: 84 },
    { slug: 'donnees', label: 'Données de base', mastery: 86 },
  ],
  [
    { slug: 'societe', label: 'Société', mastery: 90 },
    { slug: 'pc', label: 'Plan comptable', mastery: 88 },
    {
      slug: 'variante',
      label: 'Variante d’exercice',
      mastery: 60,
      gap: {
        nature: 'forgetting',
        evidence: 'Confondue avec la période comptable lors de la révision du 8 novembre.',
      },
    },
    { slug: 'devise', label: 'Devise de la société', mastery: 85 },
    { slug: 'perimetre', label: 'Périmètre analytique', mastery: 81 },
    { slug: 'segment', label: 'Segment', mastery: 80 },
    { slug: 'cdp', label: 'Centre de profit', mastery: 83 },
    { slug: 'division', label: 'Division', mastery: 82 },
    { slug: 'ledger', label: 'Ledger', mastery: 84 },
  ],
  [
    { slug: 'piece', label: 'Pièce comptable', mastery: 88 },
    { slug: 'entete', label: 'En-tête de pièce', mastery: 86 },
    { slug: 'poste', label: 'Poste', mastery: 84 },
    {
      slug: 'cle',
      label: 'Clé de comptabilisation',
      mastery: 35,
      gap: {
        nature: 'confusion',
        confusedWith: 'type',
        evidence: 'Confondue avec le type de pièce, deux fois (9 et 10 novembre).',
      },
    },
    { slug: 'type', label: 'Type de pièce', mastery: 81 },
    { slug: 'dates', label: 'Date comptable', mastery: 83 },
    {
      slug: 'equilibre',
      label: 'Équilibre d’une pièce',
      mastery: 55,
      gap: {
        nature: 'application',
        evidence: 'Équilibre non vérifié sur une saisie d’exercice le 10 novembre.',
      },
    },
    { slug: 'acdoca', label: 'Journal universel (ACDOCA)', mastery: 82 },
    {
      slug: 'ledgers',
      label: 'Ledgers parallèles',
      mastery: 28,
      gap: {
        nature: 'misunderstanding',
        evidence: 'Explication non retenue après la séance du 10 novembre.',
      },
    },
    { slug: 'compte', label: 'Compte général', mastery: 87 },
    { slug: 'partie', label: 'Partie double', mastery: 90 },
  ],
  [
    { slug: 'fourn', label: 'Fournisseur', mastery: null },
    { slug: 'factf', label: 'Facture fournisseur', mastery: null },
    { slug: 'collectif', label: 'Compte collectif', mastery: null },
    { slug: 'paiement', label: 'Paiement', mastery: null },
    { slug: 'progpaie', label: 'Programme de paiement', mastery: null },
    { slug: 'compensation', label: 'Compensation', mastery: null },
  ],
  [
    { slug: 'client', label: 'Client', mastery: null },
    { slug: 'factc', label: 'Facture client', mastery: null },
    { slug: 'encaissement', label: 'Encaissement', mastery: null },
    { slug: 'relance', label: 'Relance', mastery: null },
    { slug: 'credit', label: 'Gestion du crédit', mastery: null },
  ],
  [
    { slug: 'immo', label: 'Immobilisation', mastery: null },
    { slug: 'classe', label: 'Classe d’immobilisation', mastery: null },
    { slug: 'amort', label: 'Amortissement', mastery: null },
    { slug: 'domaine', label: 'Domaine d’évaluation', mastery: null },
    { slug: 'rebut', label: 'Sortie d’immobilisation', mastery: null },
  ],
  [
    { slug: 'cloture', label: 'Clôture de période', mastery: null },
    { slug: 'regul', label: 'Écritures de régularisation', mastery: null },
    { slug: 'report', label: 'Report de solde', mastery: null },
    { slug: 'bilan', label: 'Bilan et compte de résultat', mastery: null },
    { slug: 'reeval', label: 'Réévaluation des devises', mastery: null },
  ],
];

const DEFINITIONS: Readonly<Record<string, string>> = {
  variante: 'Définit l’exercice et ses périodes comptables ; rattachée à chaque société.',
  cle: 'Code à deux chiffres porté par chaque poste : il fixe le sens (débit ou crédit) et le type de compte.',
  piece:
    'Toute écriture est enregistrée sous forme de pièce : un en-tête qui décrit l’opération et des postes qui portent les montants.',
  ledgers: 'Plusieurs ledgers tiennent la même comptabilité selon des normes différentes, par exemple locales et IFRS.',
};

const RESOURCES: readonly {
  key: string;
  module: number;
  title: string;
  kind: 'pdf' | 'note' | 'video' | 'web';
}[] = [
  { key: 'guide-fi', module: 3, title: 'Guide FI (PDF)', kind: 'pdf' },
  { key: 'note-cle-type', module: 3, title: 'Note vocale, 1:42', kind: 'note' },
  { key: 'tutoriel-poste', module: 3, title: 'Tutoriel vidéo, 5:10', kind: 'video' },
  { key: 'notes-module-3', module: 3, title: 'Vos notes · module 3', kind: 'note' },
  { key: 'fiche-fiori', module: 1, title: 'Fiche Fiori (lien web)', kind: 'web' },
  { key: 'cours-organisation', module: 2, title: 'Cours en ligne · organisation', kind: 'web' },
  { key: 'notes-module-1', module: 1, title: 'Vos notes · module 1', kind: 'note' },
  { key: 'pdf-exercices', module: 2, title: 'PDF · exercices comptables', kind: 'pdf' },
];

const REGULARITY_DAYS = [
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

async function seedGraph(userId: string): Promise<{ formationId: string; notionIds: Record<string, string> }> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 11,
      title: 'SAP S/4HANA Finance',
    });
    const notions: { id: string; seed: NotionSeed; module: number; chapterId: string }[] = [];
    for (const [moduleIndex, moduleNotions] of MODULE_NOTIONS.entries()) {
      const chapterId = programme.chapterIds[moduleIndex];
      if (chapterId === undefined) throw new Error('chapitre SAP absent');
      for (const [notionIndex, seed] of moduleNotions.entries()) {
        const id = programme.notionIds[moduleIndex * 11 + notionIndex];
        if (id === undefined) throw new Error('notion SAP absente');
        notions.push({ id, seed, module: moduleIndex + 1, chapterId });
      }
    }
    const keep = new Set(notions.map((notion) => notion.id));
    const remove = programme.notionIds.filter((id) => !keep.has(id));
    if (remove.length > 0) {
      await tx.execute(sql`
        delete from public.notions
        where id in (${sql.join(
          remove.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `);
    }

    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const status = index < 2 ? 'validated' : index === 2 ? 'open' : 'locked';
      await tx.execute(sql`
        update public.modules
        set title = ${MODULE_TITLES[index] ?? `Module ${String(index + 1)}`},
            status = ${status}::public.module_status,
            opened_at = ${index <= 2 ? NOW : null}::timestamptz,
            validated_at = ${index < 2 ? NOW : null}::timestamptz
        where id = ${moduleId}::uuid
      `);
    }

    const notionIds: Record<string, string> = {};
    for (const notion of notions) notionIds[notion.seed.slug] = notion.id;

    for (const notion of notions) {
      await tx.execute(sql`
        update public.notions
        set label = ${notion.seed.label},
            short_definition = ${DEFINITIONS[notion.seed.slug] ?? null}
        where id = ${notion.id}::uuid
      `);
      if (notion.seed.mastery !== null) {
        const confusedWith =
          notion.seed.gap?.confusedWith === undefined
            ? null
            : (notionIds[notion.seed.gap.confusedWith] ?? null);
        await createNotionState(tx, {
          userId,
          notionId: notion.id,
          mastery: notion.seed.mastery,
          inReview: true,
          dueAt: new Date('2026-11-11T16:00:00Z'),
          ...(notion.seed.gap === undefined
            ? {}
            : {
                gapNature: notion.seed.gap.nature,
                evidence: notion.seed.gap.evidence,
                ...(confusedWith === null ? {} : { confusedWith }),
              }),
        });
      }
    }

    const linkRows = DEMO_NOTION_LINKS.map((link) => {
      const from = notionIds[link.from];
      const to = notionIds[link.to];
      if (from === undefined || to === undefined) {
        throw new Error(`lien ${link.from} → ${link.to} absent`);
      }
      const pair =
        link.kind === 'confusion' && from > to ? { left: to, right: from } : { left: from, right: to };
      return sql`(
        ${programme.formationId}::uuid,
        ${pair.left}::uuid,
        ${pair.right}::uuid,
        ${link.kind}::public.link_kind,
        ${link.personal ? sql`${userId}::uuid` : sql`null`},
        ${link.rationale}
      )`;
    });
    await tx.execute(sql`
      insert into public.notion_links (
        formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale
      )
      values ${sql.join(linkRows, sql`, `)}
    `);

    for (const resource of RESOURCES) {
      const chapterId = programme.chapterIds[resource.module - 1];
      if (chapterId === undefined) throw new Error('chapitre apport absent');
      await createResource(tx, {
        ownerId: userId,
        formationId: programme.formationId,
        chapterId,
        kind: resource.kind,
        title: resource.title,
      });
    }

    // One live section anchors « Variante d’exercice » so the course action is exact.
    const module2 = programme.moduleIds[1];
    if (module2 !== undefined) {
      const course = await createTestCourse(tx, { ownerId: userId, moduleId: module2 });
      const section = course.sectionIds[0];
      const variante = notionIds.variante;
      if (section !== undefined && variante !== undefined) {
        await tx.execute(sql`
          update public.course_sections
          set anchor = 'variante-d-exercice', notion_ids = array[${variante}]::uuid[]
          where id = ${section}::uuid
        `);
      }
    }

    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values ${sql.join(
        REGULARITY_DAYS.map(
          (day) => sql`(${userId}::uuid, ${day}::date, 60, true, array['e2e']::text[])`,
        ),
        sql`, `,
      )}
      on conflict (user_id, day) do nothing
    `);
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${programme.formationId}::uuid,
          onboarding_step = 'done',
          timezone = 'Europe/Paris',
          streak_days = 12
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations set last_opened_at = ${NOW}::timestamptz
      where id = ${programme.formationId}::uuid
    `);

    return { formationId: programme.formationId, notionIds };
  });
}

function graphUrl(formationId: string): string {
  return `/formations/${formationId}/carte`;
}

test('explore la carte des notions @SPEC-616', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  const seed = await seedGraph(session.userId);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(graphUrl(seed.formationId));

  await expect(page.getByRole('heading', { level: 1, name: 'Carte des notions' })).toBeVisible();
  await expect(page.getByTestId('notion-graph-content')).toContainText(
    '48 notions · 59 liens · 7 modules',
  );
  await expect(page.getByTestId('graph-node')).toHaveCount(56);
  await expect(page.getByTestId('graph-detail')).toContainText('À consolider · 4');
  const viewport = page.getByTestId('graph-viewport');

  // CA-2 — search + Enter selects and centres « Variante d’exercice ».
  const search = page.getByTestId('graph-search');
  await search.click();
  // Type the query: `fill` does not reach the controlled input on WebKit, and Enter can arrive
  // before React applies the change, so wait for the rendered results first.
  await search.pressSequentially('Variante d’exercice');
  await expect(page.getByTestId('graph-search')).toHaveValue('Variante d’exercice');
  await expect(page.getByTestId('graph-search-results')).toBeVisible();
  await search.press('Enter');
  const detail = page.getByTestId('graph-detail');
  await expect(detail).toContainText('Variante d’exercice');
  await expect(detail).toContainText('S’appuie sur');
  await expect(detail).toContainText('Prépare');
  const selected = page.locator('[data-testid="graph-node"][data-selected="true"]');
  await expect(selected).toHaveCount(1);
  const graphBox = await page.getByTestId('notion-graph').boundingBox();
  const nodeBox = await selected.boundingBox();
  if (graphBox === null || nodeBox === null) throw new Error('graphe non mesurable');
  expect(Math.abs(nodeBox.x + nodeBox.width / 2 - (graphBox.x + graphBox.width / 2))).toBeLessThan(60);
  expect(Math.abs(nodeBox.y + nodeBox.height / 2 - (graphBox.y + graphBox.height / 2))).toBeLessThan(80);

  // CA-2 — zoom then recenter restores the initial transform, the data never changes.
  await page.getByTestId('graph-recenter').click();
  const initialK = await viewport.getAttribute('data-k');
  await page.getByTestId('graph-zoom-in').click();
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-k')))
    .toBeGreaterThan(Number(initialK));
  await page.getByTestId('graph-recenter').click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-k'))).toBeCloseTo(
    Number(initialK),
    3,
  );

  // EF-3 — Mes apports adds the eight personal sources, colours switch to mastery.
  await page.getByTestId('graph-filter-sources').click();
  await expect(page.locator('[data-testid="graph-node"][data-kind="source"]')).toHaveCount(8);
  await page.getByRole('button', { name: 'Par maîtrise' }).click();
  await expect(page.getByTestId('graph-legend')).toContainText('Maîtrisée');
  await expect(page.getByTestId('graph-legend')).toContainText('À consolider');
  await expect(page.getByTestId('graph-legend')).toContainText('Pas encore vue');
  expect(consoleErrors).toEqual([]);

  await axeCheck();
  await captureEvidence('spec-616-carte-exploree');
});

test('parcourt la liste accessible @SPEC-616', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedGraph(session.userId);
  await page.goto(graphUrl(seed.formationId));

  const variante = page
    .locator('[data-testid="graph-list-node"]:visible')
    .filter({ hasText: 'Variante d’exercice' });
  await expect(variante).toBeVisible();
  await variante.press('Enter');
  const detail = page.getByTestId('graph-detail');
  await expect(detail).toContainText('Variante d’exercice');
  await expect(detail).toContainText('S’appuie sur');
  await expect(page.getByTestId('graph-course-link')).toHaveAttribute(
    'href',
    new RegExp(`/formations/${seed.formationId}/modules/.+/cours\\?chapitre=.+#variante-d-exercice$`),
  );
  await expect(page.getByTestId('graph-gap-link')).toBeVisible();
  await expect(page.locator('[data-testid="graph-list-relation"]:visible').first()).toBeVisible();

  await axeCheck();
  await captureEvidence('spec-616-liste-accessible');
});

test('refuse la carte d’un autre apprenant @SPEC-616', async ({ browser, baseURL }) => {
  const seed = await seedGraph(session.userId);
  const stranger = await createTestSession();
  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    await context.addCookies(
      stranger.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
    );
    await serviceDb().execute(
      sql`update public.profiles set onboarding_step = 'done' where id = ${stranger.userId}::uuid`,
    );
    const page = await context.newPage();
    const response = await page.goto(graphUrl(seed.formationId));
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('system-not-found')).toBeVisible();
  } finally {
    await context.close();
    await deleteTestSession(stranger);
  }
});

async function compareContent(
  page: import('@playwright/test').Page,
  referenceName: string,
  reference: { x: number; y: number; width: number; height: number },
  testInfo: import('@playwright/test').TestInfo,
  name: string,
): Promise<number> {
  const content = page.getByTestId('notion-graph-content');
  const actual = await content.screenshot({ animations: 'disabled', scale: 'css' });
  const comparison = compareWithReferenceRegion(
    actual,
    `${REFERENCE_DIR}${referenceName}`,
    reference,
    testInfo.outputPath('visual'),
    name,
  );
  await testInfo.attach(`${name}-side-by-side`, {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await testInfo.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: `${name}:${comparison.ratio.toFixed(4)}`,
  });
  return comparison.ratio;
}

test('conformité SPEC-616 @SPEC-616 @visual', async ({ page, axeCheck }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = await seedGraph(session.userId);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(graphUrl(seed.formationId));
  await expect(page.getByTestId('graph-node')).toHaveCount(56);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="notion-graph"]': { 'background-color': colors.ink, 'border-radius': '21.6px' },
    '[data-testid="graph-color-modes"] button:first-child': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="graph-filter-modules"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="graph-detail"] section:first-child': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
  });
  const ratio = await compareContent(
    page,
    'SCR-14-base-desktop.png',
    REFERENCE_DESKTOP,
    testInfo,
    'spec-616-desktop',
  );
  expect(ratio, 'écart à la maquette desktop').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(graphUrl(seed.formationId));
  await expect(page.getByTestId('graph-node')).toHaveCount(56);
  await page.getByTestId('graph-recenter').click();
  await page.waitForTimeout(400);
  await expectScreenshotBaseline(page, 'SCR-14-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-616 mobile @SPEC-616 @visual @mobile', async ({ page, axeCheck }, testInfo) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = await seedGraph(session.userId);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(graphUrl(seed.formationId));
  await expect(page.getByTestId('graph-node')).toHaveCount(56);
  await expect(page.getByTestId('notion-graph')).toBeVisible();
  await expect(page.getByText('Chargement de la carte des notions…')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Two frames: the SVG paints once more after the fonts and the first layout pass.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-14-mobile.png', { fullPage: false });

  await page.setViewportSize({ width: 390, height: 2300 });
  await page.goto(graphUrl(seed.formationId));
  await expect(page.getByTestId('graph-node')).toHaveCount(56);
  const ratio = await compareContent(
    page,
    'SCR-14-base-mobile.png',
    REFERENCE_MOBILE,
    testInfo,
    'spec-616-mobile',
  );
  expect(ratio, 'écart à la maquette mobile').toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  await axeCheck();
});
