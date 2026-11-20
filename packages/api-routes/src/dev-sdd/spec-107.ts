// Owner-role reads of the SPEC-107 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: three notion states, the review history of
// the first one and its active gap disappear at the end of the request. A second learner owns a
// due notion that must never appear in the first learner's payload (EF-6, CL-6). The fixture is
// deterministic and uses the fixed clock of ADR-0047.
import { sql, type DbTx } from '@learny/db';
import {
  applyReview,
  createNotionState,
  detectGap,
  getDueNotionStates,
  getReviewHistory,
  type FsrsCardJson,
  type GapNature,
  type NotionState,
} from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const FIRST_REVIEW = new Date('2026-11-11T07:00:00Z');
const SECOND_REVIEW = new Date('2026-11-11T08:00:00Z');
const FIRST_DUE = new Date('2026-11-11T07:10:00Z');
const SECOND_DUE = new Date('2026-11-11T09:00:00Z');
const GAP_REVIEW = new Date('2026-11-09T08:00:00Z');
const GAP_DUE = new Date('2026-11-10T18:00:00Z');
const GAP_DETECTED = new Date('2026-11-09T08:01:00Z');

export interface Spec107NotionCard {
  notionId: string;
  label: string;
  dueAt: string | null;
  mastery: number;
  inReview: boolean;
  suspended: boolean;
  fsrs: FsrsCardJson;
}

export interface Spec107History {
  reviewedAt: string;
  source: string;
  grade: string;
  correct: boolean | null;
  timeMs: number | null;
  before: FsrsCardJson | null;
  after: FsrsCardJson | null;
}

export interface Spec107Gap {
  active: boolean;
  nature: GapNature | null;
  confusedWithLabel: string | null;
  detectedAt: string | null;
  evidence: Record<string, unknown> | null;
  natures: GapNature[];
}

export interface Spec107Data {
  dueCount: number;
  states: Spec107NotionCard[];
  gap: Spec107Gap;
  history: Spec107History[];
  isolation: { foreignStates: number; foreignVisible: number };
}

function emptyCard(due: Date): FsrsCardJson {
  return {
    due: due.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  };
}

function reviewedCard(input: {
  due: Date;
  reps: number;
  state: 1 | 2 | 3;
  lastReview: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  lapses?: number;
}): FsrsCardJson {
  return {
    due: input.due.toISOString(),
    stability: input.stability,
    difficulty: input.difficulty,
    elapsed_days: 0,
    scheduled_days: input.scheduledDays,
    reps: input.reps,
    lapses: input.lapses ?? 0,
    state: input.state,
    last_review: input.lastReview.toISOString(),
  };
}

async function notionLabel(tx: DbTx, notionId: string): Promise<string> {
  const rows = await tx.execute<{ label: string }>(sql`
    select label from public.notions where id = ${notionId}::uuid
  `);
  return rows[0]?.label ?? '';
}

async function loadCards(tx: DbTx, userId: string): Promise<Spec107NotionCard[]> {
  const rows = await tx.execute<{
    notion_id: string;
    label: string;
    due_at: Date | null;
    mastery: string;
    in_review: boolean;
    suspended: boolean;
    fsrs: FsrsCardJson;
  }>(sql`
    select
      s.notion_id::text as notion_id,
      n.label,
      s.due_at,
      s.mastery::text as mastery,
      s.in_review,
      s.suspended,
      s.fsrs
    from public.notion_states s
    join public.notions n on n.id = s.notion_id
    where s.user_id = ${userId}::uuid
    order by n.position, n.id
  `);
  return rows.map((row) => ({
    notionId: row.notion_id,
    label: row.label,
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    mastery: Number(row.mastery),
    inReview: row.in_review,
    suspended: row.suspended,
    fsrs: row.fsrs,
  }));
}

function activeGap(state: NotionState | undefined, confusedWithLabel: string | null): Spec107Gap {
  const natures: GapNature[] = ['confusion', 'application', 'misunderstanding', 'forgetting'];
  if (state === undefined || state.gapNature === null || state.gapClearedAt !== null) {
    return {
      active: false,
      nature: null,
      confusedWithLabel: null,
      detectedAt: null,
      evidence: null,
      natures,
    };
  }
  let evidence: Record<string, unknown> | null = null;
  if (state.gapEvidence !== null) {
    try {
      const parsed: unknown = JSON.parse(state.gapEvidence);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        evidence = parsed as Record<string, unknown>;
      }
    } catch {
      evidence = null;
    }
  }
  return {
    active: true,
    nature: state.gapNature,
    confusedWithLabel,
    detectedAt: state.gapDetectedAt === null ? null : state.gapDetectedAt.toISOString(),
    evidence,
    natures,
  };
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec107Demo(): Promise<Spec107Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 3,
    });
    const [first, second, third] = programme.notionIds;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('programme de démonstration incomplet');
    }

    // A is reviewed twice and due now; B is due with an active confusion; C has no due date yet.
    await createNotionState(tx, {
      userId: user.id,
      notionId: first,
      fsrs: emptyCard(FIXED),
      dueAt: null,
      inReview: true,
    });
    const firstReview = await applyReview(tx, {
      userId: user.id,
      notionId: first,
      expectedRevision: 0,
      fsrsBefore: emptyCard(FIXED),
      fsrsAfter: reviewedCard({
        due: FIRST_DUE,
        reps: 1,
        state: 1,
        lastReview: FIRST_REVIEW,
        stability: 1.2,
        difficulty: 5.4,
        scheduledDays: 0,
      }),
      mastery: 60,
      successCount: 1,
      inReview: true,
      reviewedAt: FIRST_REVIEW,
      source: 'validation',
      grade: 'hard',
      correct: true,
      timeMs: 5200,
    });
    await applyReview(tx, {
      userId: user.id,
      notionId: first,
      expectedRevision: firstReview.state.revision,
      fsrsBefore: reviewedCard({
        due: FIRST_DUE,
        reps: 1,
        state: 1,
        lastReview: FIRST_REVIEW,
        stability: 1.2,
        difficulty: 5.4,
        scheduledDays: 1,
      }),
      fsrsAfter: reviewedCard({
        due: SECOND_DUE,
        reps: 2,
        state: 1,
        lastReview: SECOND_REVIEW,
        stability: 2.4,
        difficulty: 4.6,
        scheduledDays: 0,
      }),
      mastery: 82.5,
      successCount: 2,
      inReview: true,
      reviewedAt: SECOND_REVIEW,
      source: 'global_quiz',
      grade: 'good',
      correct: true,
      timeMs: 3100,
    });

    await createNotionState(tx, {
      userId: user.id,
      notionId: second,
      fsrs: emptyCard(FIXED),
      dueAt: null,
      inReview: true,
    });
    const gapReview = await applyReview(tx, {
      userId: user.id,
      notionId: second,
      expectedRevision: 0,
      fsrsBefore: emptyCard(FIXED),
      fsrsAfter: reviewedCard({
        due: GAP_DUE,
        reps: 1,
        state: 3,
        lastReview: GAP_REVIEW,
        stability: 0.4,
        difficulty: 8.1,
        scheduledDays: 1,
        lapses: 1,
      }),
      mastery: 45,
      successCount: 0,
      inReview: true,
      reviewedAt: GAP_REVIEW,
      source: 'global_quiz',
      grade: 'again',
      correct: false,
      timeMs: 18000,
    });
    await detectGap(tx, {
      userId: user.id,
      notionId: second,
      expectedRevision: gapReview.state.revision,
      nature: 'confusion',
      confusedWith: third,
      evidence: { chosen: 'Compte de résultat', expected: 'Compte fournisseur', answerId: null },
      detectedAt: GAP_DETECTED,
    });

    await createNotionState(tx, {
      userId: user.id,
      notionId: third,
      fsrs: emptyCard(FIXED),
      dueAt: null,
      inReview: false,
    });

    // A second learner owns a due notion: it must never surface in this payload (EF-6).
    const foreign = await createTestUser(tx, { firstName: 'Béatrice' });
    const foreignProgramme = await createTestProgramme(tx, foreign.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'Formation privée',
    });
    const foreignNotionId = foreignProgramme.notionIds[0] ?? '';
    await createNotionState(tx, {
      userId: foreign.id,
      notionId: foreignNotionId,
      fsrs: emptyCard(FIXED),
      dueAt: FIXED,
      inReview: true,
    });

    const due = await getDueNotionStates(tx, { userId: user.id, now: FIXED });
    const [stateB] = due.filter((state) => state.notionId === second);
    const history = await getReviewHistory(tx, { userId: user.id, notionId: first });
    const confusedLabel = await notionLabel(tx, third);
    const foreignRows = await tx.execute<{ count: string }>(sql`
      select count(*)::int as count
      from public.notion_states
      where user_id = ${foreign.id}::uuid
    `);

    return {
      dueCount: due.length,
      states: await loadCards(tx, user.id),
      gap: activeGap(stateB, confusedLabel),
      history: history.map((log) => ({
        reviewedAt: log.reviewedAt.toISOString(),
        source: log.source,
        grade: log.grade,
        correct: log.correct,
        timeMs: log.timeMs,
        before: log.fsrsBefore ?? null,
        after: log.fsrsAfter ?? null,
      })),
      isolation: {
        foreignStates: Number(foreignRows[0]?.count ?? '0'),
        foreignVisible: due.some((state) => state.notionId === foreignNotionId) ? 1 : 0,
      },
    };
  });
}
