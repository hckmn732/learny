// [SPEC-2203] Content, retrieval and ingestion served by the Python facade, end to end through
// the web. The three operations exercised here carry a path parameter (module, contribution), so
// they are exactly the ones the parity recorder cannot generate a scenario for: the integration
// suite covers their use cases under RLS and this test covers the façade contract end to end.
import { serviceDb } from '@learny/db';
import { createFormation, createModule, createResource } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
// A syntactically valid identifier that exists for nobody: the response must not reveal whether a
// row exists, and an entry of another learner answers exactly the same way.
const ABSENT_ID = '00000000-0000-4000-8000-000000000000';

test('sert les opérations content depuis Python @SPEC-2203', async ({ request, baseURL }) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // A real learner, formation, module, chapter and note: the screen, the course and the rename
    // below all go through RLS with this session's claims.
    const seeded = await serviceDb().transaction(async (tx) => {
      const formation = await createFormation(tx, {
        ownerId: session.userId,
        title: 'Formation content',
        status: 'active',
        startDate: '2026-11-02',
        endDate: '2026-12-20',
      });
      const createdModule = await createModule(tx, {
        ownerId: session.userId,
        formationId: formation.id,
        position: 1,
        title: 'Module content',
        chapters: ['Chapitre content'],
        plannedStart: '2026-11-02',
        plannedEnd: '2026-11-15',
        status: 'open',
      });
      const chapterId = createdModule.chapterIds[0] ?? '';
      const resource = await createResource(tx, {
        ownerId: session.userId,
        formationId: formation.id,
        chapterId,
        kind: 'note',
        title: 'Note de fabrique',
        content: 'La photosynthèse convertit la lumière en énergie chimique.',
      });
      return {
        formationId: formation.id,
        moduleId: createdModule.id,
        chapterId,
        resourceId: resource.id,
      };
    });

    // The `request` fixture does not share the browser context cookies: they are sent explicitly.
    // The origin header keeps the SPEC-208 guard satisfied on every mutation.
    const headers = { cookie: session.cookieHeader, origin };

    // CA-1, CA-5 — a content read served by Python: the module screen of the seeded module.
    const screen = await request.get(`/api/v1/modules/${seeded.moduleId}`, { headers });
    const screenPayload = await screen.text();
    expect(screen.status(), screenPayload).toBe(200);
    expect(screen.headers()['x-served-by']).toBe('learny-api');
    const screenBody = JSON.parse(screenPayload) as {
      allChaptersDone: boolean;
      chapters: { id: string; position: number; title: string; contributionsStatus: string }[];
      counts: { chaptersDone: number; chaptersTotal: number; chapterResources: number };
      formation: { id: string; title: string };
      module: { id: string; position: number; title: string; status: string };
      resources: { id: string; kind: string; title: string; status: string }[];
      selectedChapterId: string;
      suggestions: unknown[];
    };
    expect(Object.keys(screenBody).sort()).toEqual([
      'allChaptersDone',
      'chapters',
      'counts',
      'formation',
      'module',
      'resources',
      'selectedChapterId',
      'suggestions',
    ]);
    expect(screenBody.formation).toEqual({ id: seeded.formationId, title: 'Formation content' });
    expect(screenBody.module).toMatchObject({
      id: seeded.moduleId,
      position: 1,
      title: 'Module content',
      status: 'open',
    });
    expect(screenBody.selectedChapterId).toBe(seeded.chapterId);
    expect(screenBody.chapters).toHaveLength(1);
    expect(screenBody.chapters[0]).toMatchObject({
      id: seeded.chapterId,
      position: 1,
      title: 'Chapitre content',
      contributionsStatus: 'in_progress',
    });
    expect(screenBody.resources.map((resource) => resource.id)).toEqual([seeded.resourceId]);
    expect(screenBody.resources[0]).toMatchObject({ kind: 'note', status: 'ready' });
    expect(screenBody.allChaptersDone).toBe(false);
    expect(screenBody.counts).toMatchObject({ chaptersDone: 0, chaptersTotal: 1 });
    expect(screenBody.suggestions).toEqual([]);

    // CA-1, CA-5 — a second content read served by Python: the course of a module that has none.
    const course = await request.get(`/api/v1/modules/${seeded.moduleId}/course`, { headers });
    const coursePayload = await course.text();
    expect(course.status(), coursePayload).toBe(200);
    expect(course.headers()['x-served-by']).toBe('learny-api');
    const courseBody = JSON.parse(coursePayload) as {
      chapters: {
        hasCourse: boolean;
        id: string;
        percent: number;
        position: number;
        title: string;
      }[];
      course: unknown;
      formation: { id: string };
      generation: { status: string; version: number | null };
      module: { id: string; positionTotal: number };
      selectedChapterId: string;
    };
    expect(Object.keys(courseBody).sort()).toEqual([
      'chapters',
      'course',
      'formation',
      'generation',
      'module',
      'selectedChapterId',
    ]);
    expect(courseBody.module.id).toBe(seeded.moduleId);
    expect(courseBody.formation.id).toBe(seeded.formationId);
    expect(courseBody.course).toBeNull();
    expect(courseBody.generation.status).toBe('none');
    expect(courseBody.selectedChapterId).toBe(seeded.chapterId);
    expect(courseBody.chapters).toEqual([
      {
        hasCourse: false,
        id: seeded.chapterId,
        percent: 0,
        position: 1,
        title: 'Chapitre content',
      },
    ]);

    // CA-1, CA-5 — a content mutation served by Python: the rename creates no event and returns
    // the new version of the contribution, which the screen then shows.
    const renamed = await request.patch(`/api/v1/resources/${seeded.resourceId}`, {
      headers,
      data: { title: 'Note renommée' },
    });
    const renamedPayload = await renamed.text();
    expect(renamed.status(), renamedPayload).toBe(200);
    expect(renamed.headers()['x-served-by']).toBe('learny-api');
    const renamedBody = JSON.parse(renamedPayload) as {
      id: string;
      status: string;
      title: string;
      updatedAt: string;
    };
    expect(Object.keys(renamedBody).sort()).toEqual(['id', 'status', 'title', 'updatedAt']);
    expect(renamedBody.id).toBe(seeded.resourceId);
    expect(renamedBody.status).toBe('ready');
    expect(renamedBody.title).toBe('Note renommée');

    // CA-1, CL-1 — the same operation on an identifier that exists for nobody answers the shared
    // problem+json contract, never a hint about the row: the façade still served it.
    const missing = await request.get(`/api/v1/modules/${ABSENT_ID}`, { headers });
    const missingPayload = await missing.text();
    expect(missing.status(), missingPayload).toBe(404);
    expect(missing.headers()['x-served-by']).toBe('learny-api');
    expect(missing.headers()['content-type']).toContain('application/problem+json');
    expect(JSON.parse(missingPayload)).toMatchObject({
      type: 'https://learny.app/errors/not-found',
      title: 'Introuvable',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Module introuvable.',
    });
  } finally {
    await deleteTestSession(session);
  }
});

