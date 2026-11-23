// Vitest [SPEC-3302] — cours contre la pile locale : lecture, progression, citation, signalement et
// résumé (CA-1, CA-2, CA-3, CA-4; BR-COU-02, BR-COU-07, BR-COU-08, BR-COU-09).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock` and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs`. Source `.env.local` before the run:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3302 --skip-build
//
// The shared demonstration dataset is left in place:
// - the progress write is sent on a chapter that is already read at 100 %, so the monotone value does
//   not move (BR-COU-08: no route makes the reading progress regress, so a real increase could not be
//   undone); the increase itself is proven by the unit test of the hook, with a mocked client;
// - the report and the summary target chapter 3 of the open module, which no assertion and no visual
//   baseline of the track reads (the mockup and the Maestro flow capture chapter 2), and the report is
//   undone in the same test by correcting the section (BR-COU-09: a corrected section leaves the
//   reported state). The summary is an added row of the seed, documented in acceptance.md.
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import type { CourseView, ModuleCourseScreen } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

type Client = ReturnType<typeof createMobileApiClient>;

async function signedInClient(): Promise<Client> {
  if (ANON_KEY === '') {
    throw new Error(
      'Clé anonyme Supabase absente : sourcer .env.local (set -a; . ./.env.local; set +a) et lancer pnpm dev:up.',
    );
  }
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await auth.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signedIn.error !== null) {
    throw new Error(
      `Connexion du compte de démonstration impossible (${signedIn.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
    );
  }
  const accessToken = signedIn.data.session.access_token;
  return createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
}

/** Course of the module opened by the demonstration programme, chapter 2 of the mockup. */
async function openModuleId(client: Client): Promise<string> {
  const me = await client.api.meGet({});
  const sidebar = await client.api.sidebarGet({});
  const formationId = me.currentFormationId ?? sidebar.currentFormation?.id ?? null;
  const programme = await client.api.programmeGet({ params: { fid: formationId ?? '' } });
  if (!('modules' in programme)) throw new Error('programme actif attendu');
  const open = programme.modules.find((module) => module.status === 'open');
  if (open === undefined) throw new Error('module ouvert attendu');
  return open.id;
}

/** A chapter of the open module that no assertion nor visual baseline of the track reads. */
async function writableChapter(client: Client, moduleId: string): Promise<CourseView> {
  const screen = await client.api.moduleCourse({ params: { mid: moduleId } });
  const chapter = screen.chapters[2];
  if (chapter === undefined) throw new Error('chapitre 3 attendu dans le module ouvert');
  const selected: ModuleCourseScreen = await client.api.moduleCourse({
    params: { mid: moduleId },
    query: { chapitre: chapter.id },
  });
  if (selected.course === null) throw new Error('cours du chapitre 3 attendu');
  return selected.course;
}

let client: Client;
let moduleId: string;
let chapterTwo: ModuleCourseScreen;

beforeAll(async () => {
  client = await signedInClient();
  moduleId = await openModuleId(client);
  const opened = await client.api.moduleCourse({ params: { mid: moduleId } });
  chapterTwo = await client.api.moduleCourse({
    params: { mid: moduleId },
    query: { chapitre: opened.chapters[1]?.id ?? opened.selectedChapterId },
  });
});

describe('[SPEC-3302] cours du module ouvert contre la pile locale', () => {
  it('lit le chapitre 2 du module 3 et ses sections (CA-1)', async () => {
    const programme = await client.api.meGet({});
    expect(programme.timezone).toBe('Europe/Paris');
    expect(chapterTwo.module.title).toBe('Comptabilité générale');
    expect(chapterTwo.chapters).toHaveLength(4);
    const chapter = chapterTwo.course?.chapter;
    expect(chapter?.position).toBe(2);
    expect(chapter?.title).toBe('Saisie des pièces comptables');
    const sections = chapterTwo.course?.sections ?? [];
    expect(sections.map((section) => section.kind)).toEqual([
      'text',
      'flash_question',
      'dont_confuse',
      'retain',
    ]);
    // BR-COU-11 — the meta line of the mockup reads the reading time and the contributions.
    expect(chapterTwo.course?.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(chapterTwo.course?.resourceCount).toBe(4);
    expect(chapterTwo.course?.quiz.threshold).toBe(80);
    expect(chapterTwo.course?.nextChapterId).not.toBeNull();
    expect(chapterTwo.course?.previousChapterId).not.toBeNull();
  });

  it('enregistre la progression d’un chapitre déjà lu sans la faire reculer (CA-2, BR-COU-08)', async () => {
    const current = chapterTwo.course;
    if (current === null) throw new Error('cours attendu');
    expect(current.progress.chapterPercent).toBe(100);
    const progress = await client.api.courseProgress(
      {
        params: { cid: current.id },
        body: {
          chapterId: current.chapter.id,
          visibleSectionIds: current.sections.map((section) => section.id),
        },
      },
      { idempotencyKey: randomUUID() },
    );
    // The round-trip of `PUT /courses/:cid/progress` is proven; the value cannot move.
    expect(progress.chapterPercent).toBe(100);
    expect(progress.coursePercent).toBeGreaterThan(0);
    const after = await client.api.moduleCourse({
      params: { mid: moduleId },
      query: { chapitre: current.chapter.id },
    });
    // CA-2 — Programme reads this value: the chapter stays announced as read.
    expect(after.chapters[1]?.percent).toBe(100);
  });

  it('résout la source d’une citation du chapitre (CA-3, BR-COU-02)', async () => {
    const citation = (chapterTwo.course?.sections ?? [])
      .flatMap((section) => section.citations)
      .find((entry) => !entry.deleted);
    expect(citation).toBeDefined();
    const source = await client.api.courseCitationSource({ params: { cid: citation?.id ?? '' } });
    expect(source.citationId).toBe(citation?.id);
    expect(source.deleted).toBe(false);
    // The demonstration citation is a note of the learner: no external file, so no URL to open.
    expect(source.mediaKind).toBe('note');
    expect(source.page).toBeNull();
  });
});

describe('[SPEC-3302] signalement et résumé d’un chapitre non capturé', () => {
  it('signale une section puis la corrige pour la remettre en état (CA-3, BR-COU-09)', async () => {
    const current = await writableChapter(client, moduleId);
    const section = current.sections.find((entry) => !entry.reported);
    expect(section).toBeDefined();
    const sectionId = section?.id ?? '';

    const report = await client.api.courseSectionReport(
      { params: { sid: sectionId }, body: { reason: 'Vérification de la chaîne de signalement.' } },
      { idempotencyKey: randomUUID() },
    );
    expect(report.status).toBe('open');
    expect(report.reported).toBe(true);
    expect(report.sectionId).toBe(sectionId);

    // BR-COU-09 — correcting the section clears the reported state: the dataset is back in place.
    const corrected = await client.api.courseSectionEdit(
      {
        params: { sid: sectionId },
        body: { expectedVersion: section?.version ?? 1, contentMd: section?.contentMd ?? '' },
      },
      { idempotencyKey: randomUUID() },
    );
    expect(corrected.reported).toBe(false);
    // The state is read back: the section is out of the reported state, the dataset is in place.
    const after = await client.api.moduleCourse({
      params: { mid: moduleId },
      query: { chapitre: current.chapter.id },
    });
    const restored = (after.course?.sections ?? []).find((entry) => entry.id === sectionId);
    expect(restored?.reported).toBe(false);
  });

  it('envoie un résumé et reçoit le retour du tuteur simulé (CA-4, BR-COU-07)', async () => {
    const current = await writableChapter(client, moduleId);
    const summary = await client.api.chapterSummary(
      {
        params: { cid: current.chapter.id },
        body: {
          courseId: current.id,
          text: 'Une pièce se saisit en deux temps : l’en-tête, puis les postes équilibrés.',
        },
      },
      { idempotencyKey: randomUUID() },
    );
    expect(summary.chapterId).toBe(current.chapter.id);
    expect(summary.text).toContain('deux temps');
    // LLM_MODE=mock — the tutor always corrects, the verdict and the missing points are structured.
    expect(summary.status).toBe('corrected');
    expect(summary.feedback).not.toBeNull();
    expect(summary.feedback?.message.length ?? 0).toBeGreaterThan(0);
    expect(Array.isArray(summary.feedback?.missing)).toBe(true);
  });
});
