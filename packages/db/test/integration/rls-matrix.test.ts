// Integration tests of the RLS matrix (SPEC-113 §12) — CA-1 to CA-4.
//
// Every fixture is created by the service role, then every permission is proved with a real
// `authenticated` role and JWT through `asUser` (ET-5): the service role is never used for the
// operation under test. All writes happen inside `withRollback`, so the shared local database is
// left unchanged. The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, type DbTx } from '../../src/client';
import { createGroup, joinGroup } from '../../src/repositories/groups';
import { RLS_MATRIX, type RlsTableMatrix } from '../../src/rls/matrix';
import {
  asUser,
  createTestCourse,
  createTestProgramme,
  createTestUser,
  withRollback,
  type TestProgramme,
  type TestUser,
} from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

interface Failure {
  code: string;
  message: string;
}

const FIXED = new Date('2026-11-11T12:20:00Z');
const INVITE_CODE = 'LRN-RS34';
const EVIDENCE = fileURLToPath(new URL('../../../../evidence/SPEC-113', import.meta.url));

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 8 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

function deterministicCode(code: string) {
  const suffix = code.slice(4);
  let cursor = 0;
  return () => {
    const character = suffix[cursor] ?? 'A';
    cursor += 1;
    return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.indexOf(character);
  };
}

async function attemptUnderUser(
  tx: DbTx,
  userId: string,
  fn: (inner: DbTx) => Promise<unknown>,
): Promise<Failure> {
  try {
    await asUser(tx, userId, fn);
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

async function countAs(
  tx: DbTx,
  userId: string,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  return asUser(tx, userId, async (inner) => {
    const rows = await inner.execute<{ count: number }>(sql`
      select count(*)::int as count
      from ${sql.raw(`public.${table}`)}
      where ${sql.raw(column)} = ${value}::uuid
    `);
    return rows[0]?.count ?? -1;
  });
}

async function updateAs(tx: DbTx, userId: string, query: ReturnType<typeof sql>): Promise<number> {
  return asUser(tx, userId, async (inner) => {
    const rows = await inner.execute<{ id: string }>(query);
    return rows.length;
  });
}

interface Seed {
  a: TestUser;
  b: TestUser;
  c: TestUser;
  programme: TestProgramme;
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
  groupId: string;
  courseId: string;
  sectionId: string;
  resourceId: string;
  brickId: string;
  brickVersionId: string;
  activityId: string;
  attemptId: string;
  conversationId: string;
  notificationId: string;
  rows: Record<string, string>;
}

function idOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('identifiant absent');
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string') throw new Error('identifiant absent');
  return id;
}

async function insertId(tx: DbTx, query: ReturnType<typeof sql>): Promise<string> {
  const rows = await tx.execute<{ id: string }>(query);
  return idOf(rows[0]);
}

function fsrsCard(): string {
  return JSON.stringify({
    due: '2026-11-12T12:20:00.000Z',
    stability: 1.5,
    difficulty: 4.2,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: '2026-11-11T12:20:00.000Z',
  });
}

async function createSeed(tx: DbTx): Promise<Seed> {
  const a = await createTestUser(tx, { firstName: 'Alice' });
  const b = await createTestUser(tx, { firstName: 'Bob' });
  const c = await createTestUser(tx, { firstName: 'Carol' });
  const programme = await createTestProgramme(tx, a.id, {
    modules: 2,
    chaptersPerModule: 2,
    notionsPerChapter: 2,
    title: 'Programme partagé RLS',
  });
  const [module1, module2] = programme.moduleIds;
  const [chapter1, chapter2] = programme.chapterIds;
  const [notion1, notion2, notion3, notion4] = programme.notionIds;
  if (
    module1 === undefined ||
    module2 === undefined ||
    chapter1 === undefined ||
    chapter2 === undefined ||
    notion1 === undefined ||
    notion2 === undefined ||
    notion3 === undefined ||
    notion4 === undefined
  ) {
    throw new Error('programme incomplet');
  }

  const group = await createGroup(tx, {
    formationId: programme.formationId,
    ownerId: a.id,
    now: FIXED,
    random: deterministicCode(INVITE_CODE),
  });
  await joinGroup(tx, { inviteCode: group.inviteCode, userId: b.id, now: FIXED });

  const course = await createTestCourse(tx, {
    ownerId: a.id,
    moduleId: module1,
    sectionsPerChapter: 2,
  });
  const sectionId = course.sectionIds[0];
  if (sectionId === undefined) throw new Error('section incomplète');

  const rows: Record<string, string> = {
    profiles: a.id,
    study_preferences: a.id,
    notification_settings: a.id,
    automation_settings: a.id,
    chapter_progress: a.id,
    module_progress: a.id,
    daily_activity: a.id,
    notion_states: a.id,
    reading_progress: a.id,
    subscriptions: a.id,
    ai_task_models: a.id,
    group_members: b.id,
  };

  rows.push_subscriptions = await insertId(
    tx,
    sql`
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (${a.id}::uuid, 'https://push.test.learny.test/rls-a', 'p256dh', 'auth')
      returning id::text as id
    `,
  );
  rows.pauses = await insertId(
    tx,
    sql`
      insert into public.pauses (user_id, starts_on, ends_on)
      values (${a.id}::uuid, '2026-11-12', '2026-11-20')
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.chapter_progress (user_id, chapter_id)
    values (${a.id}::uuid, ${chapter1}::uuid)
  `);
  await tx.execute(sql`
    insert into public.module_progress (user_id, module_id, status)
    values (${a.id}::uuid, ${module1}::uuid, 'open')
  `);

  const resourceId = await insertId(
    tx,
    sql`
      insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${chapter1}::uuid,
        'note', 'Note privée d’Alice', 'secret'
      )
      returning id::text as id
    `,
  );
  rows.resources = resourceId;
  rows.resource_chunks = await insertId(
    tx,
    sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location
      )
      values (
        ${resourceId}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid,
        ${chapter1}::uuid, 1, 'Passage privé',
        '{"charStart":0,"charEnd":13}'::jsonb
      )
      returning id::text as id
    `,
  );
  rows.courses = course.courseId;
  rows.question_bank_jobs = await insertId(
    tx,
    sql`
      insert into public.question_bank_jobs (
        user_id, formation_id, notion_id, course_id, format, reason
      )
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${notion1}::uuid,
        ${course.courseId}::uuid, 'choice_question', 'manual'
      )
      returning id::text as id
    `,
  );
  rows.course_sections = sectionId;
  rows.course_section_revisions = await insertId(
    tx,
    sql`
      insert into public.course_section_revisions (
        section_id, owner_id, version, title, content_md, edited_by
      )
      values (
        ${sectionId}::uuid, ${a.id}::uuid, 1, 'Ancienne section', 'Ancien contenu', 'learner'
      )
      returning id::text as id
    `,
  );
  rows.course_section_reports = await insertId(
    tx,
    sql`
      insert into public.course_section_reports (owner_id, section_id, reason)
      values (${a.id}::uuid, ${sectionId}::uuid, 'Signalement de test')
      returning id::text as id
    `,
  );
  rows.citations = await insertId(
    tx,
    sql`
      insert into public.citations (section_id, owner_id, label, media_kind, quote)
      values (${sectionId}::uuid, ${a.id}::uuid, 'Guide, p. 1', 'pdf', 'citation privée')
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.reading_progress (user_id, course_id, chapter_id, percent)
    values (${a.id}::uuid, ${course.courseId}::uuid, ${chapter1}::uuid, 10)
  `);
  rows.chapter_summaries = await insertId(
    tx,
    sql`
      insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
      values (${a.id}::uuid, ${chapter1}::uuid, ${course.courseId}::uuid, 'Résumé privé')
      returning id::text as id
    `,
  );
  const conversationId = await insertId(
    tx,
    sql`
      insert into public.tutor_conversations (user_id, course_id, title)
      values (${a.id}::uuid, ${course.courseId}::uuid, 'Discussion privée')
      returning id::text as id
    `,
  );
  rows.tutor_conversations = conversationId;
  rows.tutor_messages = await insertId(
    tx,
    sql`
      insert into public.tutor_messages (conversation_id, user_id, role, content)
      values (${conversationId}::uuid, ${a.id}::uuid, 'learner', 'question privée')
      returning id::text as id
    `,
  );

  const brickId = await insertId(
    tx,
    sql`
      insert into public.bricks (owner_id, formation_id, type, purpose)
      values (${a.id}::uuid, ${programme.formationId}::uuid, 'text', 'course')
      returning id::text as id
    `,
  );
  rows.bricks = brickId;
  const brickVersionId = await insertId(
    tx,
    sql`
      insert into public.brick_versions (brick_id, version, payload, origin, created_by)
      values (${brickId}::uuid, 1, '{}'::jsonb, 'tutor', 'tutor')
      returning id::text as id
    `,
  );
  rows.brick_versions = brickVersionId;
  rows.brick_reports = await insertId(
    tx,
    sql`
      insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
      values (${a.id}::uuid, ${brickId}::uuid, ${brickVersionId}::uuid, 'signalement privé')
      returning id::text as id
    `,
  );
  const activityId = await insertId(
    tx,
    sql`
      insert into public.activities (owner_id, formation_id, kind, items)
      values (${a.id}::uuid, ${programme.formationId}::uuid, 'exercise', '[]'::jsonb)
      returning id::text as id
    `,
  );
  rows.activities = activityId;
  const attemptId = await insertId(
    tx,
    sql`
      insert into public.attempts (user_id, activity_id, attempt_no)
      values (${a.id}::uuid, ${activityId}::uuid, 1)
      returning id::text as id
    `,
  );
  rows.attempts = attemptId;
  rows.answers = await insertId(
    tx,
    sql`
      insert into public.answers (attempt_id, brick_version_id, position, response)
      values (${attemptId}::uuid, ${brickVersionId}::uuid, 1, '{}'::jsonb)
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.notion_states (user_id, notion_id, fsrs)
    values (${a.id}::uuid, ${notion1}::uuid, ${fsrsCard()}::jsonb)
  `);
  rows.review_logs = await insertId(
    tx,
    sql`
      insert into public.review_logs (user_id, notion_id, source, grade, reviewed_at)
      values (${a.id}::uuid, ${notion1}::uuid, 'validation', 'good', ${FIXED.toISOString()}::timestamptz)
      returning id::text as id
    `,
  );
  rows.gap_events = await insertId(
    tx,
    sql`
      insert into public.gap_events (user_id, notion_id, kind, nature)
      values (${a.id}::uuid, ${notion1}::uuid, 'detected', 'forgetting')
      returning id::text as id
    `,
  );
  rows.schedule_slots = await insertId(
    tx,
    sql`
      insert into public.schedule_slots (
        user_id, formation_id, kind, title, starts_at, ends_at, created_by
      )
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, 'course', 'Séance privée',
        '2026-11-11T17:00:00Z'::timestamptz, '2026-11-11T18:00:00Z'::timestamptz, 'planner'
      )
      returning id::text as id
    `,
  );
  rows.automation_actions = await insertId(
    tx,
    sql`
      insert into public.automation_actions (
        user_id, formation_id, automation, kind, summary, status, requires_consent
      )
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, 'reprise', 'reprise_proposed',
        'Reprendre la séance', 'pending_consent', true
      )
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.daily_activity (user_id, day, minutes, qualifying)
    values (${a.id}::uuid, '2026-11-11', 20, true)
  `);
  rows.milestones = await insertId(
    tx,
    sql`
      insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, 'module_validated',
        ${module1}::uuid, ${FIXED.toISOString()}::timestamptz
      )
      returning id::text as id
    `,
  );
  const notificationId = await insertId(
    tx,
    sql`
      insert into public.notifications (user_id, formation_id, type, title, body, href, icon)
      values (
        ${a.id}::uuid, ${programme.formationId}::uuid, 'course_ready',
        'Cours prêt', 'Votre cours est prêt.', '/formations', 'book'
      )
      returning id::text as id
    `,
  );
  rows.notifications = notificationId;
  rows.notification_deliveries = await insertId(
    tx,
    sql`
      insert into public.notification_deliveries (
        notification_id, channel, status, scheduled_for
      )
      values (${notificationId}::uuid, 'email', 'scheduled', ${FIXED.toISOString()}::timestamptz)
      returning id::text as id
    `,
  );
  rows.ai_credentials = await insertId(
    tx,
    sql`
      insert into public.ai_credentials (
        user_id, provider, label, model_ids, encrypted_key, key_last4
      )
      values (
        ${a.id}::uuid, 'anthropic', 'Clé privée', '{claude-sonnet}',
        decode(repeat('00', 32), 'hex'), 'abcd'
      )
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.ai_task_models (user_id, task, model_id)
    values (${a.id}::uuid, 'light', 'claude-haiku')
  `);
  rows.ai_calls = await insertId(
    tx,
    sql`
      insert into public.ai_calls (user_id, task, provider, model, status)
      values (${a.id}::uuid, 'light', 'anthropic', 'claude-haiku', 'ok')
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.subscriptions (user_id, status)
    values (${a.id}::uuid, 'none')
  `);
  rows.data_exports = await insertId(
    tx,
    sql`
      insert into public.data_exports (user_id, status)
      values (${a.id}::uuid, 'queued')
      returning id::text as id
    `,
  );
  rows.legal_acceptances = await insertId(
    tx,
    sql`
      insert into public.legal_acceptances (user_id, document, version)
      values (${a.id}::uuid, 'cgu', '1.0')
      returning id::text as id
    `,
  );
  rows.cadrage_messages = await insertId(
    tx,
    sql`
      insert into public.cadrage_messages (formation_id, user_id, role, content, position)
      values (
        ${programme.formationId}::uuid, ${a.id}::uuid, 'tutor', 'Message de cadrage', 1
      )
      returning id::text as id
    `,
  );
  rows.programme_imports = await insertId(
    tx,
    sql`
      insert into public.programme_imports (formation_id, user_id, source_kind, raw_text)
      values (${programme.formationId}::uuid, ${a.id}::uuid, 'text', 'programme importé')
      returning id::text as id
    `,
  );
  rows.programme_proposals = await insertId(
    tx,
    sql`
      insert into public.programme_proposals (formation_id, user_id, version, source, payload)
      values (${programme.formationId}::uuid, ${a.id}::uuid, 1, 'generated', '{}'::jsonb)
      returning id::text as id
    `,
  );
  rows.programme_change_requests = await insertId(
    tx,
    sql`
      insert into public.programme_change_requests (formation_id, user_id, message)
      values (${programme.formationId}::uuid, ${a.id}::uuid, 'Ajuster le programme')
      returning id::text as id
    `,
  );
  rows.notion_links = await insertId(
    tx,
    sql`
      insert into public.notion_links (
        formation_id, from_notion_id, to_notion_id, kind, owner_id
      )
      values (${programme.formationId}::uuid, ${notion1}::uuid, ${notion2}::uuid, 'prerequisite', null)
      returning id::text as id
    `,
  );
  await tx.execute(sql`
    insert into public.notion_links (
      formation_id, from_notion_id, to_notion_id, kind, owner_id
    )
    values (${programme.formationId}::uuid, ${notion3}::uuid, ${notion4}::uuid, 'tutor', ${a.id}::uuid)
  `);

  return {
    a,
    b,
    c,
    programme,
    formationId: programme.formationId,
    moduleIds: programme.moduleIds,
    chapterIds: programme.chapterIds,
    notionIds: programme.notionIds,
    groupId: group.id,
    courseId: course.courseId,
    sectionId,
    resourceId,
    brickId,
    brickVersionId,
    activityId,
    attemptId,
    conversationId,
    notificationId,
    rows,
  };
}

type Inserter = (tx: DbTx, seed: Seed) => Promise<unknown>;

/** A forged insert that keeps Alice as the owner: the policy must refuse it for Bob. */
const FOREIGN_INSERTS: Record<string, Inserter> = {
  profiles: (tx, s) =>
    tx.execute(sql`
      insert into public.profiles (id, email) values (${s.a.id}::uuid, 'forged@test.learny.test')
    `),
  study_preferences: (tx, s) =>
    tx.execute(sql`insert into public.study_preferences (user_id) values (${s.a.id}::uuid)`),
  notification_settings: (tx, s) =>
    tx.execute(sql`insert into public.notification_settings (user_id) values (${s.a.id}::uuid)`),
  push_subscriptions: (tx, s) =>
    tx.execute(sql`
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (${s.a.id}::uuid, 'https://push.test.learny.test/forged', 'p256dh', 'auth')
    `),
  automation_settings: (tx, s) =>
    tx.execute(sql`
      insert into public.automation_settings (user_id, key, params)
      values (${s.a.id}::uuid, 'reprise', '{}'::jsonb)
    `),
  pauses: (tx, s) =>
    tx.execute(sql`
      insert into public.pauses (user_id, starts_on, ends_on, status)
      values (${s.a.id}::uuid, '2026-12-01', '2026-12-02', 'cancelled')
    `),
  cadrage_messages: (tx, s) =>
    tx.execute(sql`
      insert into public.cadrage_messages (formation_id, user_id, role, content, position)
      values (${s.formationId}::uuid, ${s.a.id}::uuid, 'learner', 'forgé', 99)
    `),
  programme_imports: (tx, s) =>
    tx.execute(sql`
      insert into public.programme_imports (formation_id, user_id, source_kind, raw_text)
      values (${s.formationId}::uuid, ${s.a.id}::uuid, 'text', 'forgé')
    `),
  programme_proposals: (tx, s) =>
    tx.execute(sql`
      insert into public.programme_proposals (formation_id, user_id, version, source, payload)
      values (${s.formationId}::uuid, ${s.a.id}::uuid, 2, 'generated', '{}'::jsonb)
    `),
  programme_change_requests: (tx, s) =>
    tx.execute(sql`
      insert into public.programme_change_requests (formation_id, user_id, message)
      values (${s.formationId}::uuid, ${s.a.id}::uuid, 'forgé')
    `),
  chapter_progress: (tx, s) =>
    tx.execute(sql`
      insert into public.chapter_progress (user_id, chapter_id)
      values (${s.a.id}::uuid, ${s.chapterIds[1] ?? ''}::uuid)
    `),
  module_progress: (tx, s) =>
    tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${s.a.id}::uuid, ${s.moduleIds[1] ?? ''}::uuid, 'open')
    `),
  resources: (tx, s) =>
    tx.execute(sql`
      insert into public.resources (owner_id, formation_id, kind, title)
      values (${s.a.id}::uuid, ${s.formationId}::uuid, 'note', 'Ressource forgée')
    `),
  question_bank_jobs: (tx, s) =>
    tx.execute(sql`
      insert into public.question_bank_jobs (
        user_id, formation_id, notion_id, course_id, format, reason
      )
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, ${s.notionIds[0] ?? ''}::uuid,
        ${s.courseId}::uuid, 'choice_question', 'manual'
      )
    `),
  resource_chunks: (tx, s) =>
    tx.execute(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, position, text, location
      )
      values (
        ${s.resourceId}::uuid, ${s.a.id}::uuid, ${s.formationId}::uuid, 99,
        'forgé', '{"charStart":0,"charEnd":1}'::jsonb
      )
    `),
  courses: (tx, s) =>
    tx.execute(sql`
      insert into public.courses (owner_id, formation_id, module_id, version, is_current, status)
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, ${s.moduleIds[1] ?? ''}::uuid,
        99, false, 'generating'
      )
    `),
  course_sections: (tx, s) =>
    tx.execute(sql`
      insert into public.course_sections (
        course_id, owner_id, chapter_id, position, kind, anchor, title, origin
      )
      values (
        ${s.courseId}::uuid, ${s.a.id}::uuid, ${s.chapterIds[0] ?? ''}::uuid,
        99, 'text', 'forged', 'Section forgée', 'tutor'
      )
    `),
  course_section_revisions: (tx, s) =>
    tx.execute(sql`
      insert into public.course_section_revisions (
        section_id, owner_id, version, title, edited_by
      )
      values (${s.sectionId}::uuid, ${s.a.id}::uuid, 99, 'forgée', 'learner')
    `),
  course_section_reports: (tx, s) =>
    tx.execute(sql`
      insert into public.course_section_reports (owner_id, section_id, reason)
      values (${s.a.id}::uuid, ${s.sectionId}::uuid, 'Signalement forgé')
    `),
  citations: (tx, s) =>
    tx.execute(sql`
      insert into public.citations (section_id, owner_id, label, media_kind)
      values (${s.sectionId}::uuid, ${s.a.id}::uuid, 'forgée', 'pdf')
    `),
  reading_progress: (tx, s) =>
    tx.execute(sql`
      insert into public.reading_progress (user_id, course_id, chapter_id, percent)
      values (${s.a.id}::uuid, ${s.courseId}::uuid, ${s.chapterIds[1] ?? ''}::uuid, 5)
    `),
  chapter_summaries: (tx, s) =>
    tx.execute(sql`
      insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
      values (
        ${s.a.id}::uuid, ${s.chapterIds[1] ?? ''}::uuid, ${s.courseId}::uuid, 'forgé'
      )
    `),
  tutor_conversations: (tx, s) =>
    tx.execute(sql`
      insert into public.tutor_conversations (user_id, course_id, title)
      values (${s.a.id}::uuid, ${s.courseId}::uuid, 'Discussion forgée')
    `),
  tutor_messages: (tx, s) =>
    tx.execute(sql`
      insert into public.tutor_messages (conversation_id, user_id, role, content)
      values (${s.conversationId}::uuid, ${s.a.id}::uuid, 'learner', 'forgé')
    `),
  bricks: (tx, s) =>
    tx.execute(sql`
      insert into public.bricks (owner_id, formation_id, type, purpose)
      values (${s.a.id}::uuid, ${s.formationId}::uuid, 'text', 'course')
    `),
  brick_versions: (tx, s) =>
    tx.execute(sql`
      insert into public.brick_versions (brick_id, version, payload, origin, created_by)
      values (${s.brickId}::uuid, 99, '{}'::jsonb, 'tutor', 'tutor')
    `),
  brick_reports: (tx, s) =>
    tx.execute(sql`
      insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
      values (${s.a.id}::uuid, ${s.brickId}::uuid, ${s.brickVersionId}::uuid, 'forgé')
    `),
  activities: (tx, s) =>
    tx.execute(sql`
      insert into public.activities (owner_id, formation_id, kind, items)
      values (${s.a.id}::uuid, ${s.formationId}::uuid, 'exercise', '[]'::jsonb)
    `),
  attempts: (tx, s) =>
    tx.execute(sql`
      insert into public.attempts (user_id, activity_id, attempt_no)
      values (${s.a.id}::uuid, ${s.activityId}::uuid, 99)
    `),
  answers: (tx, s) =>
    tx.execute(sql`
      insert into public.answers (attempt_id, brick_version_id, position, response)
      values (${s.attemptId}::uuid, ${s.brickVersionId}::uuid, 99, '{}'::jsonb)
    `),
  notion_states: (tx, s) =>
    tx.execute(sql`
      insert into public.notion_states (user_id, notion_id, fsrs)
      values (${s.a.id}::uuid, ${s.notionIds[1] ?? ''}::uuid, ${fsrsCard()}::jsonb)
    `),
  review_logs: (tx, s) =>
    tx.execute(sql`
      insert into public.review_logs (user_id, notion_id, source, grade, reviewed_at)
      values (
        ${s.a.id}::uuid, ${s.notionIds[1] ?? ''}::uuid, 'validation', 'good',
        ${FIXED.toISOString()}::timestamptz
      )
    `),
  gap_events: (tx, s) =>
    tx.execute(sql`
      insert into public.gap_events (user_id, notion_id, kind, nature)
      values (${s.a.id}::uuid, ${s.notionIds[1] ?? ''}::uuid, 'detected', 'forgetting')
    `),
  schedule_slots: (tx, s) =>
    tx.execute(sql`
      insert into public.schedule_slots (
        user_id, formation_id, kind, title, starts_at, ends_at, created_by
      )
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, 'course', 'Créneau forgé',
        '2026-11-11T18:00:00Z'::timestamptz, '2026-11-11T19:00:00Z'::timestamptz, 'planner'
      )
    `),
  automation_actions: (tx, s) =>
    tx.execute(sql`
      insert into public.automation_actions (
        user_id, formation_id, automation, kind, summary, status, requires_consent
      )
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, 'reprise', 'forged',
        'Action forgée', 'pending_consent', true
      )
    `),
  daily_activity: (tx, s) =>
    tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes)
      values (${s.a.id}::uuid, '2026-11-12', 10)
    `),
  milestones: (tx, s) =>
    tx.execute(sql`
      insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, 'notions_100',
        ${s.notionIds[0] ?? ''}::uuid, ${FIXED.toISOString()}::timestamptz
      )
    `),
  notifications: (tx, s) =>
    tx.execute(sql`
      insert into public.notifications (user_id, formation_id, type, title, body, href, icon)
      values (
        ${s.a.id}::uuid, ${s.formationId}::uuid, 'relaunch',
        'Relance forgée', 'Corps', '/formations', 'bell'
      )
    `),
  notification_deliveries: (tx, s) =>
    tx.execute(sql`
      insert into public.notification_deliveries (notification_id, channel, status)
      values (${s.notificationId}::uuid, 'email', 'scheduled')
    `),
  ai_credentials: (tx, s) =>
    tx.execute(sql`
      insert into public.ai_credentials (
        user_id, provider, label, encrypted_key, key_last4
      )
      values (
        ${s.a.id}::uuid, 'anthropic', 'Clé forgée',
        decode(repeat('00', 32), 'hex'), 'abcd'
      )
    `),
  ai_task_models: (tx, s) =>
    tx.execute(sql`
      insert into public.ai_task_models (user_id, task, model_id)
      values (${s.a.id}::uuid, 'course', 'claude-sonnet')
    `),
  ai_calls: (tx, s) =>
    tx.execute(sql`
      insert into public.ai_calls (user_id, task, provider, model, status)
      values (${s.a.id}::uuid, 'light', 'anthropic', 'claude-haiku', 'ok')
    `),
  subscriptions: (tx, s) =>
    tx.execute(sql`
      insert into public.subscriptions (user_id, status) values (${s.a.id}::uuid, 'none')
    `),
  data_exports: (tx, s) =>
    tx.execute(sql`
      insert into public.data_exports (user_id, status) values (${s.a.id}::uuid, 'queued')
    `),
  legal_acceptances: (tx, s) =>
    tx.execute(sql`
      insert into public.legal_acceptances (user_id, document, version)
      values (${s.a.id}::uuid, 'privacy', '9.0')
    `),
};

const PERSONAL_TABLES = RLS_MATRIX.filter((entry) => entry.category === 'personal');

interface ResultRow {
  table: string;
  category: string;
  role: string;
  operation: string;
  expected: boolean;
  observed: boolean;
  detail: string;
}

const results: ResultRow[] = [];

function record(result: ResultRow): void {
  results.push(result);
}

function valueFor(seed: Seed, entry: RlsTableMatrix): string {
  const value = seed.rows[entry.table];
  if (value === undefined) throw new Error(`fixture absente pour ${entry.table}`);
  return value;
}

afterAll(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(
    path.join(EVIDENCE, 'rls-results.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  await closeDb();
});

describe('[SPEC-113] RLS isolation', () => {
  it('CA-1, CL-6 — pg_catalog contient exactement la matrice, avec RLS et FORCE RLS', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname
      `);
      const names = tables.map((row) => String(row.table));
      expect(names).toEqual(RLS_MATRIX.map((entry) => entry.table).sort());
      for (const row of tables) {
        expect(row.rls, String(row.table)).toBe(true);
        expect(row.forced, String(row.table)).toBe(true);
      }

      const policies = await tx.execute<Row>(sql`
        select tablename as table, policyname as name
        from pg_catalog.pg_policies
        where schemaname = 'public'
        order by tablename, policyname
      `);
      const actual = new Map<string, string[]>();
      for (const row of policies) {
        const table = String(row.table);
        const list = actual.get(table) ?? [];
        list.push(String(row.name));
        actual.set(table, list);
      }
      for (const entry of RLS_MATRIX) {
        expect((actual.get(entry.table) ?? []).sort(), entry.table).toEqual(
          [...entry.policies].sort(),
        );
      }

      const permissive = await tx.execute<Row>(sql`
        select c.relname as table, p.polname as name,
               pg_get_expr(p.polqual, p.polrelid) as using_expr,
               pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
        from pg_catalog.pg_policy p
        join pg_catalog.pg_class c on c.oid = p.polrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
      `);
      for (const row of permissive) {
        expect(
          (row.using_expr as string | null) ?? '',
          `${String(row.table)}.${String(row.name)}`,
        ).not.toBe('true');
        expect(
          (row.check_expr as string | null) ?? '',
          `${String(row.table)}.${String(row.name)}`,
        ).not.toBe('true');
      }

      fs.mkdirSync(EVIDENCE, { recursive: true });
      fs.writeFileSync(
        path.join(EVIDENCE, 'rls-inventory.json'),
        `${JSON.stringify(
          {
            measuredAt: FIXED.toISOString(),
            tableCount: tables.length,
            forcedCount: tables.filter((row) => row.forced === true).length,
            categories: RLS_MATRIX.reduce<Record<string, number>>((counts, entry) => {
              counts[entry.category] = (counts[entry.category] ?? 0) + 1;
              return counts;
            }, {}),
            tables: RLS_MATRIX.map((entry) => ({
              table: entry.table,
              category: entry.category,
              policies: entry.policies,
            })),
          },
          null,
          2,
        )}\n`,
      );
    });
  });

  it('CA-2, CL-1, CL-2 — chaque table personnelle refuse lecture, insertion, modification et suppression étrangères', async () => {
    await withRollback(async (tx) => {
      const seed = await createSeed(tx);

      for (const entry of PERSONAL_TABLES) {
        const value = valueFor(seed, entry);

        const ownerRead = await countAs(tx, seed.a.id, entry.table, entry.probeColumn, value);
        expect(ownerRead, `${entry.table} : lecture propriétaire`).toBeGreaterThanOrEqual(1);
        record({
          table: entry.table,
          category: entry.category,
          role: 'A/owner',
          operation: 'select',
          expected: true,
          observed: ownerRead >= 1,
          detail: `${String(ownerRead)} ligne(s)`,
        });

        const memberRead = await countAs(tx, seed.b.id, entry.table, entry.probeColumn, value);
        expect(memberRead, `${entry.table} : lecture membre B`).toBe(0);
        record({
          table: entry.table,
          category: entry.category,
          role: 'B/member',
          operation: 'select',
          expected: false,
          observed: memberRead === 0,
          detail: `${String(memberRead)} ligne(s)`,
        });

        const outsiderRead = await countAs(tx, seed.c.id, entry.table, entry.probeColumn, value);
        expect(outsiderRead, `${entry.table} : lecture non-membre C`).toBe(0);
        record({
          table: entry.table,
          category: entry.category,
          role: 'C/non-member',
          operation: 'select',
          expected: false,
          observed: outsiderRead === 0,
          detail: `${String(outsiderRead)} ligne(s)`,
        });

        const updateSql = sql`
          update ${sql.raw(`public.${entry.table}`)}
          set ${sql.raw(entry.probeColumn)} = ${sql.raw(entry.probeColumn)}
          where ${sql.raw(entry.probeColumn)} = ${value}::uuid
          returning 1 as id
        `;
        const memberUpdate = await updateAs(tx, seed.b.id, updateSql);
        expect(memberUpdate, `${entry.table} : mise à jour membre B`).toBe(0);
        record({
          table: entry.table,
          category: entry.category,
          role: 'B/member',
          operation: 'update',
          expected: false,
          observed: memberUpdate === 0,
          detail: `${String(memberUpdate)} ligne(s)`,
        });

        const deleteSql = sql`
          delete from ${sql.raw(`public.${entry.table}`)}
          where ${sql.raw(entry.probeColumn)} = ${value}::uuid
          returning 1 as id
        `;
        const memberDelete = await updateAs(tx, seed.b.id, deleteSql);
        expect(memberDelete, `${entry.table} : suppression membre B`).toBe(0);
        record({
          table: entry.table,
          category: entry.category,
          role: 'B/member',
          operation: 'delete',
          expected: false,
          observed: memberDelete === 0,
          detail: `${String(memberDelete)} ligne(s)`,
        });

        const inserter = FOREIGN_INSERTS[entry.table];
        expect(inserter, `insertion étrangère déclarée pour ${entry.table}`).toBeDefined();
        if (inserter === undefined) continue;
        const insert = await attemptUnderUser(tx, seed.b.id, (inner) => inserter(inner, seed));
        expect(
          ['42501', '23505', '23514'],
          `${entry.table} : insertion forgée refusée (${insert.code} ${insert.message})`,
        ).toContain(insert.code);
        record({
          table: entry.table,
          category: entry.category,
          role: 'B/member',
          operation: 'insert',
          expected: false,
          observed: insert.code !== '00000',
          detail: insert.code,
        });
      }
    });
  });

  it('CA-2, CL-3, ET-6 — le programme est lisible par les membres et modifiable par le propriétaire seulement', async () => {
    await withRollback(async (tx) => {
      const seed = await createSeed(tx);

      const sharedTables = ['formations', 'modules', 'chapters', 'notions'] as const;
      for (const table of sharedTables) {
        const column = table === 'formations' ? 'id' : 'formation_id';
        const value = table === 'formations' ? seed.formationId : seed.formationId;
        const ownerRead = await countAs(tx, seed.a.id, table, column, value);
        const memberRead = await countAs(tx, seed.b.id, table, column, value);
        const outsiderRead = await countAs(tx, seed.c.id, table, column, value);
        expect(ownerRead, `${table} : propriétaire`).toBeGreaterThanOrEqual(1);
        expect(memberRead, `${table} : membre`).toBeGreaterThanOrEqual(1);
        expect(outsiderRead, `${table} : non-membre`).toBe(0);
        record({
          table,
          category: 'shared-programme',
          role: 'A/owner',
          operation: 'select',
          expected: true,
          observed: ownerRead >= 1,
          detail: `${String(ownerRead)} ligne(s)`,
        });
        record({
          table,
          category: 'shared-programme',
          role: 'B/member',
          operation: 'select',
          expected: true,
          observed: memberRead >= 1,
          detail: `${String(memberRead)} ligne(s)`,
        });
        record({
          table,
          category: 'shared-programme',
          role: 'C/non-member',
          operation: 'select',
          expected: false,
          observed: outsiderRead === 0,
          detail: `${String(outsiderRead)} ligne(s)`,
        });
      }

      // ET-6 — programme link visible by the member, personal link private to Alice.
      const programmeLinks = await countAs(
        tx,
        seed.b.id,
        'notion_links',
        'formation_id',
        seed.formationId,
      );
      expect(programmeLinks).toBe(1);
      const aliceLinks = await countAs(
        tx,
        seed.a.id,
        'notion_links',
        'formation_id',
        seed.formationId,
      );
      expect(aliceLinks).toBe(2);
      const outsiderLinks = await countAs(
        tx,
        seed.c.id,
        'notion_links',
        'formation_id',
        seed.formationId,
      );
      expect(outsiderLinks).toBe(0);

      // CL-3 — the member reads the programme but cannot modify it.
      const memberUpdate = await updateAs(
        tx,
        seed.b.id,
        sql`
          update public.chapters set title = 'Chapitre piraté'
          where id = ${seed.chapterIds[0] ?? ''}::uuid
          returning 1 as id
        `,
      );
      expect(memberUpdate).toBe(0);
      const memberDelete = await updateAs(
        tx,
        seed.b.id,
        sql`delete from public.modules where id = ${seed.moduleIds[0] ?? ''}::uuid returning 1 as id`,
      );
      expect(memberDelete).toBe(0);
      const memberInsert = await attemptUnderUser(tx, seed.b.id, (inner) =>
        inner.execute(sql`
          insert into public.modules (formation_id, position, title)
          values (${seed.formationId}::uuid, 99, 'Module forgé')
        `),
      );
      expect(memberInsert.code).toBe('42501');

      const ownerUpdate = await updateAs(
        tx,
        seed.a.id,
        sql`
          update public.chapters set title = 'Chapitre corrigé'
          where id = ${seed.chapterIds[0] ?? ''}::uuid
          returning 1 as id
        `,
      );
      expect(ownerUpdate).toBe(1);
      record({
        table: 'chapters',
        category: 'shared-programme',
        role: 'A/owner',
        operation: 'update',
        expected: true,
        observed: ownerUpdate === 1,
        detail: `${String(ownerUpdate)} ligne(s)`,
      });

      // Groups and memberships: members read, only the owner writes.
      for (const table of ['groups', 'group_members'] as const) {
        const ownerRead = await countAs(tx, seed.a.id, 'groups', 'id', seed.groupId);
        const memberRead = await countAs(tx, seed.b.id, 'groups', 'id', seed.groupId);
        const outsiderRead = await countAs(tx, seed.c.id, 'groups', 'id', seed.groupId);
        expect(ownerRead, table).toBeGreaterThanOrEqual(1);
        expect(memberRead, table).toBeGreaterThanOrEqual(1);
        expect(outsiderRead, table).toBe(0);
      }
      const memberGroupUpdate = await updateAs(
        tx,
        seed.b.id,
        sql`
          update public.groups set invite_code = 'LRN-ZZZZ'
          where id = ${seed.groupId}::uuid returning 1 as id
        `,
      );
      expect(memberGroupUpdate).toBe(0);
      const probeFormation = await insertId(
        tx,
        sql`
          insert into public.formations (owner_id, title, objectives, status)
          values (${seed.a.id}::uuid, 'Sonde de groupe', '{operational}', 'active')
          returning id::text as id
        `,
      );
      const memberGroupInsert = await attemptUnderUser(tx, seed.b.id, (inner) =>
        inner.execute(sql`
          insert into public.groups (formation_id, owner_id, invite_code)
          values (${probeFormation}::uuid, ${seed.a.id}::uuid, 'LRN-ZZZZ')
        `),
      );
      expect(memberGroupInsert.code).toBe('42501');

      // CL-4 — leaving revokes the shared programme immediately.
      await tx.execute(sql`
        update public.group_members set left_at = ${FIXED.toISOString()}::timestamptz,
          member_status = 'completed'
        where group_id = ${seed.groupId}::uuid and user_id = ${seed.b.id}::uuid
      `);
      expect(await countAs(tx, seed.b.id, 'modules', 'formation_id', seed.formationId)).toBe(0);
      expect(await countAs(tx, seed.b.id, 'formations', 'id', seed.formationId)).toBe(0);
    });
  });

  it('CA-3, CL-5, CL-7 — la vue et les fonctions à droits élevés refusent un non-membre et projettent six colonnes', async () => {
    await withRollback(async (tx) => {
      const seed = await createSeed(tx);

      const columns = await tx.execute<Row>(sql`
        select column_name as name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'group_member_progress'
        order by ordinal_position
      `);
      expect(columns.map((row) => String(row.name))).toEqual([
        'group_id',
        'user_id',
        'first_name',
        'current_module_position',
        'validated_modules',
        'streak_days',
      ]);

      const ownerView = await asUser(tx, seed.a.id, async (inner) => {
        const rows = await inner.execute<Row>(sql`
          select * from public.group_member_progress where group_id = ${seed.groupId}::uuid
        `);
        return rows;
      });
      expect(ownerView).toHaveLength(2);
      expect(Object.keys(ownerView[0] ?? {}).sort()).toEqual([
        'current_module_position',
        'first_name',
        'group_id',
        'streak_days',
        'user_id',
        'validated_modules',
      ]);
      expect(ownerView.map((row) => row.first_name).sort()).toEqual(['Alice', 'Bob']);

      const memberView = await asUser(tx, seed.b.id, async (inner) => {
        const rows = await inner.execute<Row>(sql`
          select * from public.group_member_progress where group_id = ${seed.groupId}::uuid
        `);
        return rows;
      });
      expect(memberView).toHaveLength(2);

      const outsiderView = await asUser(tx, seed.c.id, async (inner) => {
        const rows = await inner.execute<Row>(sql`
          select * from public.group_member_progress where group_id = ${seed.groupId}::uuid
        `);
        return rows;
      });
      expect(outsiderView).toHaveLength(0);

      // CL-5 — e-mail and private rows never appear through the projection or a join.
      const leak = await asUser(tx, seed.b.id, async (inner) => {
        const rows = await inner.execute<Row>(sql`
          select
            (select count(*)::int from public.profiles where id = ${seed.a.id}::uuid) as email,
            (select count(*)::int from public.resources where owner_id = ${seed.a.id}::uuid) as notes,
            (select count(*)::int from public.notion_states where user_id = ${seed.a.id}::uuid) as gaps,
            (select count(*)::int from public.tutor_messages where user_id = ${seed.a.id}::uuid) as messages
        `);
        return rows[0];
      });
      expect(leak).toMatchObject({ email: 0, notes: 0, gaps: 0, messages: 0 });

      // ET-2, ET-3 — membership helpers are security definer, fixed search_path and not executable
      // by anonymous clients.
      const functions = await tx.execute<Row>(sql`
        select p.proname as name, p.prosecdef as definer, p.proconfig as config,
               has_function_privilege('anon', p.oid, 'execute') as anon
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'is_group_member', 'is_group_owner', 'is_formation_member',
            'is_formation_owner', 'count_active_formations'
          )
        order by p.proname
      `);
      expect(functions).toHaveLength(5);
      for (const row of functions) {
        expect(row.definer, String(row.name)).toBe(true);
        expect(row.anon, String(row.name)).toBe(false);
        expect(
          ((row.config as string[] | null) ?? []).some((value) => value.startsWith('search_path=')),
          String(row.name),
        ).toBe(true);
      }
    });
  });

  it('CA-4, CL-6 — retirer RLS, une politique ou introduire USING(true) fait échouer le harnais', async () => {
    await withRollback(async (tx) => {
      const state = async (table: string) => {
        const rows = await tx.execute<Row>(sql`
          select c.relrowsecurity as rls,
                 (select count(*)::int from pg_catalog.pg_policies p
                  where p.schemaname = 'public' and p.tablename = ${table}) as policies,
                 (select count(*)::int from pg_catalog.pg_policy p
                  join pg_catalog.pg_class c2 on c2.oid = p.polrelid
                  where c2.relname = ${table}
                    and pg_get_expr(p.polqual, p.polrelid) = 'true') as permissive
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = ${table}
        `);
        return rows[0] as { rls: boolean; policies: number; permissive: number };
      };

      expect(await state('resources')).toMatchObject({
        rls: true,
        policies: 1,
        permissive: 0,
      });

      await tx.execute(sql`alter table public.resources disable row level security`);
      expect(await state('resources')).toMatchObject({ rls: false });
      await tx.execute(sql`alter table public.resources enable row level security`);

      await tx.execute(sql`drop policy resources_owner_all on public.resources`);
      expect((await state('resources')).policies).toBe(0);
      await tx.execute(sql`
        create policy resources_owner_all on public.resources
          for all to authenticated
          using (owner_id = (select auth.uid()))
          with check (owner_id = (select auth.uid()))
      `);

      await tx.execute(sql`
        create policy resources_temporary_leak on public.resources
          for select to authenticated
          using (true)
      `);
      expect((await state('resources')).permissive).toBe(1);
      await tx.execute(sql`drop policy resources_temporary_leak on public.resources`);
    });
  });

  it('CA-1, CL-8 — les tables de service restent invisibles et non inscriptibles pour un utilisateur', async () => {
    await withRollback(async (tx) => {
      const seed = await createSeed(tx);
      for (const entry of RLS_MATRIX.filter((row) => row.category === 'service')) {
        expect(entry.policies).toEqual([]);
        const read = await asUser(tx, seed.a.id, async (inner) => {
          const rows = await inner.execute<{ count: number }>(
            sql`select count(*)::int as count from ${sql.raw(`public.${entry.table}`)}`,
          );
          return rows[0]?.count ?? -1;
        });
        expect(read, entry.table).toBe(0);
        const forgedInsert = {
          rate_limits: sql`
            insert into public.rate_limits (bucket, tokens)
            values (${`user:${seed.a.id}:/api/v1/rls`}, 1)
          `,
          event_outbox: sql`
            insert into public.event_outbox (event_id, name, data)
            values ('rls-forged-event', 'cron/nightly', '{}'::jsonb)
          `,
          sdd_demo_runs: sql`
            insert into public.sdd_demo_runs (run_id) values (gen_random_uuid())
          `,
          stripe_events: sql`
            insert into public.stripe_events (event_id, type, created_at)
            values ('evt_rls_forged', 'invoice.payment_failed', now())
          `,
        }[entry.table];
        const write = await attemptUnderUser(tx, seed.a.id, (inner) =>
          inner.execute(
            forgedInsert ??
              sql`
                insert into public.idempotency_keys (user_id, key, route, request_hash)
                values (
                  ${seed.a.id}::uuid, 'rls-forged-01', '/api/v1/rls', ${'a'.repeat(64)}
                )
              `,
          ),
        );
        expect(write.code, entry.table).toBe('42501');
      }
    });
  });
});
