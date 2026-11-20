// Owner-role reads of the SPEC-106 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: the thirteen bricks, the three ordered
// versions of the activity, the attempt and its answers disappear at the end of the request. The
// fixture is deterministic and contains no personal data. A newer version is published after the
// attempt so that the page can show answers still bound to the version they presented (BR-BRI-06).
import { sql, type DbTx } from '@learny/db';
import {
  addBrickVersion,
  createActivity,
  createAttempt,
  recordAnswer,
  BRICK_TYPES,
} from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

export interface Spec106BrickType {
  type: string;
  purpose: string;
  status: string;
  currentVersion: number;
}

export interface Spec106ActivityItem {
  position: number;
  type: string;
  version: number;
  availableVersion: number;
  points: number | null;
}

export interface Spec106Attempt {
  attemptNo: number;
  status: string;
  score: number | null;
  passed: boolean | null;
  answers: number;
}

export interface Spec106Answer {
  position: number;
  type: string;
  version: number;
  currentVersion: number;
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number | null;
  gradedBy: string | null;
}

export interface Spec106Data {
  types: Spec106BrickType[];
  activity: {
    kind: string;
    status: string;
    items: Spec106ActivityItem[];
  };
  attempt: Spec106Attempt;
  answers: Spec106Answer[];
}

interface Row {
  [key: string]: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const PURPOSES = ['validation', 'exercise', 'course', 'bank'] as const;

function purposeFor(index: number): string {
  return PURPOSES[index % PURPOSES.length] ?? 'exercise';
}

function statusFor(index: number): string {
  if (index === 11) return 'reported';
  if (index === 12) return 'retired';
  return 'active';
}

async function insertBrick(
  tx: DbTx,
  input: { ownerId: string; formationId: string; type: string; purpose: string; status: string },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.bricks (owner_id, formation_id, type, purpose, status)
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.type}::public.brick_type,
      ${input.purpose}::public.brick_purpose,
      ${input.status}::public.brick_status
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('brique de démonstration non créée');
  return id;
}

async function loadTypes(tx: DbTx, ownerId: string): Promise<Spec106BrickType[]> {
  const rows = await tx.execute<Row>(sql`
    select type::text as type, purpose::text as purpose, status::text as status,
           current_version
    from public.bricks
    where owner_id = ${ownerId}::uuid
    order by array_position(enum_range(null::public.brick_type), type)
  `);
  return rows.map((row) => ({
    type: String(row.type),
    purpose: String(row.purpose),
    status: String(row.status),
    currentVersion: Number(row.current_version),
  }));
}

async function loadActivity(tx: DbTx, activityId: string): Promise<Spec106Data['activity']> {
  const activityRows = await tx.execute<Row>(sql`
    select kind::text as kind, status::text as status from public.activities
    where id = ${activityId}::uuid
  `);
  const itemRows = await tx.execute<Row>(sql`
    select
      item.ordinality as position,
      b.type::text as type,
      v.version as version,
      b.current_version,
      item.value ->> 'points' as points
    from public.activities a
    cross join lateral jsonb_array_elements(a.items) with ordinality as item(value, ordinality)
    join public.brick_versions v on v.id = (item.value ->> 'brickVersionId')::uuid
    join public.bricks b on b.id = v.brick_id
    where a.id = ${activityId}::uuid
    order by item.ordinality
  `);
  const activity = activityRows[0];
  return {
    kind: asString(activity?.kind),
    status: asString(activity?.status),
    items: itemRows.map((row) => ({
      position: Number(row.position),
      type: String(row.type),
      version: Number(row.version),
      availableVersion: Number(row.current_version),
      points: row.points === null || row.points === undefined ? null : Number(row.points),
    })),
  };
}

async function loadAttempt(tx: DbTx, attemptId: string): Promise<Spec106Attempt> {
  const rows = await tx.execute<Row>(sql`
    select
      a.attempt_no,
      a.status::text as status,
      a.score,
      a.passed,
      (select count(*)::int from public.answers where attempt_id = a.id) as answers
    from public.attempts a
    where a.id = ${attemptId}::uuid
  `);
  const row = rows[0];
  return {
    attemptNo: Number(row?.attempt_no ?? 0),
    status: asString(row?.status),
    score: row?.score === null || row?.score === undefined ? null : Number(row.score),
    passed: typeof row?.passed === 'boolean' ? row.passed : null,
    answers: Number(row?.answers ?? 0),
  };
}

async function loadAnswers(tx: DbTx, attemptId: string): Promise<Spec106Answer[]> {
  const rows = await tx.execute<Row>(sql`
    select
      a.position,
      b.type::text as type,
      v.version,
      b.current_version,
      a.is_correct,
      a.score,
      a.max_score,
      a.graded_by::text as graded_by
    from public.answers a
    join public.brick_versions v on v.id = a.brick_version_id
    join public.bricks b on b.id = v.brick_id
    where a.attempt_id = ${attemptId}::uuid
    order by a.position
  `);
  return rows.map((row) => ({
    position: Number(row.position),
    type: String(row.type),
    version: Number(row.version),
    currentVersion: Number(row.current_version),
    isCorrect: typeof row.is_correct === 'boolean' ? row.is_correct : null,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    maxScore: row.max_score === null || row.max_score === undefined ? null : Number(row.max_score),
    gradedBy: typeof row.graded_by === 'string' ? row.graded_by : null,
  }));
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec106Demo(): Promise<Spec106Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
    });

    const brickIds: string[] = [];
    for (const [index, type] of BRICK_TYPES.entries()) {
      brickIds.push(
        await insertBrick(tx, {
          ownerId: user.id,
          formationId: programme.formationId,
          type,
          purpose: purposeFor(index),
          status: statusFor(index),
        }),
      );
    }

    const activityBrick = brickIds[2];
    if (activityBrick === undefined) throw new Error('briques de démonstration incomplètes');
    const versionIds: string[] = [];
    for (const versionNumber of [1, 2, 3]) {
      const version = await addBrickVersion(tx, {
        brickId: activityBrick,
        version: versionNumber,
        payload: { statement: `Énoncé ${String(versionNumber)}`, sample: true },
        origin: 'tutor',
        createdBy: 'tutor',
      });
      versionIds.push(version.id);
    }

    const activity = await createActivity(tx, {
      ownerId: user.id,
      formationId: programme.formationId,
      moduleId: programme.moduleIds[0] ?? null,
      kind: 'validation_quiz',
      config: { threshold: 80, durationSec: 1800, questionCount: 3, hintsMax: 2 },
      items: versionIds.map((brickVersionId) => ({
        brickId: activityBrick,
        brickVersionId,
        points: 1,
      })),
      status: 'ready',
      forDate: '2026-11-11',
    });

    const attempt = await createAttempt(tx, {
      userId: user.id,
      activityId: activity.id,
    });

    await recordAnswer(tx, {
      attemptId: attempt.id,
      brickVersionId: versionIds[0] ?? '',
      position: 1,
      response: { choice: '401' },
      isCorrect: true,
      score: 1,
      maxScore: 1,
      timeMs: 4200,
      gradedBy: 'code',
      feedback: { explanation: 'Compte fournisseur.', criteria: [] },
    });
    await recordAnswer(tx, {
      attemptId: attempt.id,
      brickVersionId: versionIds[1] ?? '',
      position: 2,
      response: { choice: '512' },
      isCorrect: false,
      score: 0,
      maxScore: 1,
      timeMs: 7800,
      gradedBy: 'code',
      chosenDistractorNotionId: programme.notionIds[0] ?? null,
      markedForReview: true,
    });
    await recordAnswer(tx, {
      attemptId: attempt.id,
      brickVersionId: versionIds[2] ?? '',
      position: 3,
      response: { text: 'La clé 401 est un compte fournisseur.' },
      isCorrect: true,
      score: 0.5,
      maxScore: 1,
      timeMs: 15000,
      gradedBy: 'tutor',
      feedback: {
        explanation: 'Réponse juste mais incomplète.',
        criteria: [{ key: 'sens', ok: true, comment: 'Compte fournisseur identifié.' }],
        missing: ['contrepartie'],
      },
    });
    await tx.execute(sql`
      update public.attempts
      set status = 'graded', score = 50, passed = false, duration_ms = 27000, submitted_at = now()
      where id = ${attempt.id}::uuid
    `);

    // Publish version 2 after the attempt: the activity items and the answers stay on version 1.
    await addBrickVersion(tx, {
      brickId: activityBrick,
      version: 4,
      payload: { statement: 'Énoncé 1 corrigé', sample: true },
      origin: 'tutor',
      createdBy: 'tutor',
    });

    return {
      types: await loadTypes(tx, user.id),
      activity: await loadActivity(tx, activity.id),
      attempt: await loadAttempt(tx, attempt.id),
      answers: await loadAnswers(tx, attempt.id),
    };
  });
}
