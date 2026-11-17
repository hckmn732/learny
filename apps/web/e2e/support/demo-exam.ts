// SPEC-802 ET-3 — demonstration exam states. The seeded `mock-exam` activity only references its
// bricks; the exam screen needs the frozen question rows, so the first matrix navigation upgrades
// the activity and inserts one graded and one in-progress attempt for the demo learner.
import { serviceDb, sql } from '@learny/db';
import { demoId, demoUserId } from '@learny/db/seed/fixtures';

interface BrickRow extends Record<string, unknown> {
  brick_id: string;
  version_id: string;
  payload: unknown;
  notion_id: string;
  notion_label: string;
  module_id: string;
  module_position: number;
  module_label: string;
  type: string;
}

export interface DemoExamAttempts {
  gradedId: string;
  inProgressId: string;
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The demonstration bricks predate the canonical payloads (SPEC-115): the exam screen parses the
 * strict `choice_question` schema, so the legacy `{question, choices, answer}` is converted here.
 */
function canonicalPayload(row: BrickRow): unknown {
  const payload = row.payload;
  if (typeof payload !== 'object' || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  if ('stem' in record) return payload;
  if (!Array.isArray(record.choices)) return payload;
  const choices = record.choices.filter((choice): choice is string => typeof choice === 'string');
  const answer = typeof record.answer === 'string' ? record.answer : '';
  return {
    stem: typeof record.question === 'string' ? record.question : row.notion_label,
    mode: 'single',
    options: choices.map((text, index) => ({
      id: `o${String(index + 1)}`,
      text,
      correct: text === answer,
      notionId: null,
    })),
    explanation:
      typeof record.explanation === 'string'
        ? record.explanation
        : `La bonne réponse est « ${answer} ».`,
    objective: `Vérifier la notion ${row.notion_label}`,
    sources: [],
  };
}

export async function seedDemoExamAttempts(): Promise<DemoExamAttempts> {
  const alex = demoUserId('alex');
  const activityId = demoId('activity', 'mock-exam');
  const rows = await serviceDb().execute<BrickRow>(sql`
    select b.id::text as brick_id, bv.id::text as version_id, bv.payload,
           n.id::text as notion_id, n.label as notion_label,
           m.id::text as module_id, m.position as module_position, m.title as module_label,
           b.type::text as type
    from public.activities a
    cross join lateral jsonb_array_elements(a.items) as item
    join public.bricks b on b.id = (item->>'brickId')::uuid
    join public.brick_versions bv on bv.id = (item->>'brickVersionId')::uuid
    join public.notions n on n.id = b.notion_ids[1]
    join public.modules m on m.id = n.module_id
    where a.id = ${activityId}::uuid
    order by m.position, b.id
  `);
  if (rows.length === 0) throw new Error('briques de l’examen de démonstration introuvables');

  const points = 100 / rows.length;
  const items = rows.map((row) => ({
    brickId: row.brick_id,
    brickVersionId: row.version_id,
    points,
    notionId: row.notion_id,
    notionLabel: row.notion_label,
    type: row.type,
    payload: canonicalPayload(row),
    moduleId: row.module_id,
    modulePosition: numberOf(row.module_position),
    moduleLabel: row.module_label,
    studied: true,
  }));
  const modules = [...new Set(items.map((item) => item.modulePosition))].map((position) => {
    const item = items.find((entry) => entry.modulePosition === position);
    return {
      moduleId: item?.moduleId ?? '',
      position,
      label: item?.moduleLabel ?? '',
      studied: true,
    };
  });
  const config = {
    threshold: 80,
    durationSec: 10_800,
    questionCount: items.length,
    examFormat: {
      questionCount: items.length,
      secondsPerQuestion: 3600,
      durationMin: 180,
      threshold: 80,
      source: 'default',
      confirmed: true,
    },
    diagnosticPositions: [],
    modules,
  };

  await serviceDb().execute(sql`
    update public.activities
    set config = ${JSON.stringify(config)}::jsonb, items = ${JSON.stringify(items)}::jsonb
    where id = ${activityId}::uuid
  `);

  const graded = await serviceDb().execute<{ id: string }>(sql`
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at, deadline_at, submitted_at,
      duration_ms, score, passed, review_feedback
    ) values (
      ${alex}::uuid, ${activityId}::uuid, 1, 'graded'::public.attempt_status,
      '2026-11-11T10:00:00Z'::timestamptz, '2026-11-11T13:00:00Z'::timestamptz,
      '2026-11-11T10:40:00Z'::timestamptz, 2_400_000, 60, false,
      '{"verdict":"partial","message":"Deux modules restent à consolider."}'::jsonb
    )
    on conflict (activity_id, user_id, attempt_no) do update
    set status = excluded.status, submitted_at = excluded.submitted_at,
        duration_ms = excluded.duration_ms, score = excluded.score, passed = excluded.passed
    returning id::text as id
  `);
  const inProgress = await serviceDb().execute<{ id: string }>(sql`
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at, deadline_at
    ) values (
      ${alex}::uuid, ${activityId}::uuid, 2, 'in_progress'::public.attempt_status,
      '2026-11-11T11:30:00Z'::timestamptz, '2026-11-11T14:20:00Z'::timestamptz
    )
    on conflict (activity_id, user_id, attempt_no) do update
    set status = excluded.status, started_at = excluded.started_at,
        deadline_at = excluded.deadline_at, submitted_at = null, score = null, passed = null
    returning id::text as id
  `);
  return {
    gradedId: graded[0]?.id ?? '',
    inProgressId: inProgress[0]?.id ?? '',
  };
}

/**
 * Deletes the attempts a SPEC-802 file created, so the shared demo dataset is intact for the
 * next file of the campaign (the seed does not remove extra attempts).
 */
export async function deleteDemoAttempts(ids: readonly string[]): Promise<void> {
  const kept = ids.filter((id) => id !== '');
  if (kept.length === 0) return;
  const list = sql.join(
    kept.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  await serviceDb().execute(sql`delete from public.attempts where id in (${list})`);
}
