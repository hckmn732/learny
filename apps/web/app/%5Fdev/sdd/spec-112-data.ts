// Owner-role reads of the SPEC-112 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole fixture runs inside `withRollback`: one learner, a programme whose formation, first
// notion and current course section all mention the treasury, a second learner holding the same
// words (never returned by the private search), one downloadable export, one expired export, three
// legal acceptances and three idempotency states. Nothing survives the request; no real personal
// data is displayed (EF-7). The search itself runs under the learner's JWT with `asUser`, so the
// SECURITY INVOKER function and the RLS policies are exercised for real.
import {
  canDownloadDataExport,
  completeDataExport,
  completeIdempotencyKey,
  createDataExport,
  groupSearchResults,
  listDataExports,
  listLegalAcceptances,
  recordLegalAcceptance,
  reserveIdempotencyKey,
  searchUserContent,
  sql,
  type LegalDocument,
  type SearchGroup,
} from '@learny/db';
import {
  asUser,
  createTestCourse,
  createTestProgramme,
  createTestUser,
  withRollback,
} from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const QUERY = 'tresorerie';

export interface Spec112SearchItem {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  href: string;
  rank: number;
}

export interface Spec112Export {
  id: string;
  status: string;
  sizeBytes: number | null;
  createdAt: string;
  expiresAt: string | null;
  downloadable: boolean;
}

export interface Spec112Acceptance {
  id: string;
  document: LegalDocument;
  version: string;
  acceptedAt: string;
}

export interface Spec112Idempotency {
  key: string;
  state: 'replayed' | 'in_progress' | 'reused';
  statusCode: number;
  createdAt: string;
  completedAt: string | null;
  response: unknown;
}

export interface Spec112Data {
  query: string;
  groups: Array<{
    kind: SearchGroup['kind'];
    items: Spec112SearchItem[];
  }>;
  total: number;
  foreignTitle: string;
  foreignVisible: number;
  exports: Spec112Export[];
  acceptances: Spec112Acceptance[];
  latestCgu: string | null;
  idempotency: Spec112Idempotency[];
}

/** Full demonstration payload; every write is rolled back at the end of the request. */
export async function loadSpec112Demo(): Promise<Spec112Data> {
  return withRollback(async (tx) => {
    const alex = await createTestUser(tx, { firstName: 'Alex' });
    const programme = await createTestProgramme(tx, alex.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    const chapterId = programme.chapterIds[0];
    const firstNotionId = programme.notionIds[0];
    const secondNotionId = programme.notionIds[1];
    if (
      moduleId === undefined ||
      chapterId === undefined ||
      firstNotionId === undefined ||
      secondNotionId === undefined
    ) {
      throw new Error('programme de démonstration incomplet');
    }

    await tx.execute(sql`
      update public.formations
      set description = 'Formation à la trésorerie, au budget et aux encaissements.'
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = 'Trésorerie prévisionnelle',
          short_definition = 'Anticiper les encaissements et les décaissements de la trésorerie.'
      where id = ${firstNotionId}::uuid
    `);
    await tx.execute(sql`
      update public.notions
      set label = 'Budget annuel', short_definition = 'Le budget pilote les dépenses.'
      where id = ${secondNotionId}::uuid
    `);

    const course = await createTestCourse(tx, {
      ownerId: alex.id,
      moduleId,
      sectionsPerChapter: 1,
    });
    const sectionId = course.sectionIds[0];
    if (sectionId === undefined) throw new Error('section de démonstration absente');
    await tx.execute(sql`
      update public.course_sections
      set title = 'Le cycle de trésorerie',
          content_md = ${'<script>alert(1)</script>La trésorerie suit les encaissements et les décaissements. <b>Texte sûr</b>'}
      where id = ${sectionId}::uuid
    `);

    // A second learner shares the same words; the private search must never return them (CA-4).
    const bob = await createTestUser(tx, { firstName: 'Bob' });
    const foreignProgramme = await createTestProgramme(tx, bob.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Trésorerie confidentielle de Bob',
    });
    const bobModuleId = foreignProgramme.moduleIds[0];
    if (bobModuleId === undefined) throw new Error('programme étranger incomplet');
    const foreignCourse = await createTestCourse(tx, {
      ownerId: bob.id,
      moduleId: bobModuleId,
      sectionsPerChapter: 1,
    });
    const foreignSectionId = foreignCourse.sectionIds[0];
    if (foreignSectionId === undefined) throw new Error('section étrangère absente');
    await tx.execute(sql`
      update public.course_sections
      set title = 'Le secret de Bob',
          content_md = 'La trésorerie de Bob reste privée et ne doit jamais apparaître.'
      where id = ${foreignSectionId}::uuid
    `);

    const results = await asUser(tx, alex.id, (inner) =>
      searchUserContent(inner, { q: QUERY, limit: 20 }),
    );
    const groups = groupSearchResults(results).map((group) => ({
      kind: group.kind,
      items: group.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        title: item.title,
        snippet: item.snippet,
        href: item.href,
        rank: item.rank,
      })),
    }));

    // Two exports: one still downloadable, one expired but kept for audit (CL-2).
    const expired = await createDataExport(tx, {
      userId: alex.id,
      createdAt: new Date('2026-11-01T08:00:00Z'),
    });
    await completeDataExport(tx, {
      userId: alex.id,
      exportId: expired.id,
      storagePath: `exports/${alex.id}/2026-11-01.zip`,
      sizeBytes: 1_240_000,
      expiresAt: new Date('2026-11-08T08:00:00Z'),
    });
    const ready = await createDataExport(tx, {
      userId: alex.id,
      createdAt: new Date('2026-11-11T12:00:00Z'),
    });
    await completeDataExport(tx, {
      userId: alex.id,
      exportId: ready.id,
      storagePath: `exports/${alex.id}/2026-11-11.zip`,
      sizeBytes: 2_480_000,
      expiresAt: new Date('2026-11-18T12:00:00Z'),
    });
    const exports = await listDataExports(tx, { userId: alex.id });

    // Accepting the same version twice keeps one row; a new version adds a new row (CL-1).
    await recordLegalAcceptance(tx, {
      userId: alex.id,
      document: 'cgu',
      version: '1.2',
      acceptedAt: new Date('2026-10-01T09:00:00Z'),
    });
    await recordLegalAcceptance(tx, {
      userId: alex.id,
      document: 'cgu',
      version: '1.2',
      acceptedAt: new Date('2026-10-02T09:00:00Z'),
    });
    await recordLegalAcceptance(tx, {
      userId: alex.id,
      document: 'cgu',
      version: '1.3',
      acceptedAt: new Date('2026-11-01T09:00:00Z'),
    });
    await recordLegalAcceptance(tx, {
      userId: alex.id,
      document: 'privacy',
      version: '3.0',
      acceptedAt: new Date('2026-11-01T09:05:00Z'),
    });
    const acceptances = await listLegalAcceptances(tx, { userId: alex.id });

    // Three idempotency states: replayed, in progress and a refused reuse (CL-3).
    const replayKey = 'demo-export-ready-0001';
    await reserveIdempotencyKey(tx, {
      userId: alex.id,
      key: replayKey,
      method: 'POST',
      route: '/api/v1/exports',
      body: { format: 'zip' },
      now: FIXED,
      createdAt: new Date('2026-11-11T12:00:00Z'),
    });
    await completeIdempotencyKey(tx, {
      userId: alex.id,
      key: replayKey,
      statusCode: 202,
      response: { exportId: ready.id, status: 'queued' },
      completedAt: new Date('2026-11-11T12:00:02Z'),
    });

    const runningKey = 'demo-export-running-02';
    await reserveIdempotencyKey(tx, {
      userId: alex.id,
      key: runningKey,
      method: 'POST',
      route: '/api/v1/exports',
      body: { format: 'zip', includeConversations: true },
      now: FIXED,
      createdAt: new Date('2026-11-11T12:10:00Z'),
    });

    const reusedKey = 'demo-export-reused-003';
    await reserveIdempotencyKey(tx, {
      userId: alex.id,
      key: reusedKey,
      method: 'POST',
      route: '/api/v1/exports',
      body: { format: 'json' },
      now: FIXED,
      createdAt: new Date('2026-11-11T11:55:00Z'),
    });
    await completeIdempotencyKey(tx, {
      userId: alex.id,
      key: reusedKey,
      statusCode: 422,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
      completedAt: new Date('2026-11-11T11:55:00.500Z'),
    });

    const idempotencyRows = await tx.execute<{
      key: string;
      status_code: number;
      created_at: string;
      completed_at: string | null;
      response: unknown;
    }>(sql`
      select key, status_code, created_at, completed_at, response
      from public.idempotency_keys
      where user_id = ${alex.id}::uuid
      order by created_at desc
    `);
    const stateOf = (key: string, statusCode: number): Spec112Idempotency['state'] => {
      if (key === runningKey || statusCode === 0) return 'in_progress';
      if (statusCode >= 400) return 'reused';
      return 'replayed';
    };

    const latestCgu = acceptances.find((row) => row.document === 'cgu');

    return {
      query: QUERY,
      groups,
      total: results.length,
      foreignTitle: 'Trésorerie confidentielle de Bob',
      foreignVisible: results.filter((row) => row.title === 'Le secret de Bob').length,
      exports: exports.map((row) => ({
        id: row.id,
        status: row.status,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
        downloadable: canDownloadDataExport(row, FIXED),
      })),
      acceptances: acceptances.map((row) => ({
        id: row.id,
        document: row.document,
        version: row.version,
        acceptedAt: row.acceptedAt.toISOString(),
      })),
      latestCgu: latestCgu?.version ?? null,
      idempotency: idempotencyRows.map((row) => ({
        key: row.key,
        state: stateOf(row.key, row.status_code),
        statusCode: row.status_code,
        createdAt: new Date(row.created_at).toISOString(),
        completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
        response: row.response,
      })),
    };
  });
}
