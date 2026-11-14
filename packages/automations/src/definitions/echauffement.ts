// « Échauffement » (SPEC-714, BR-AUT-03, ADR-0190). At 06 h, every active formation with a session
// of the day receives an activity of two, three or five recall questions selected by the engine of
// SPEC-410 (previous study day and prerequisites of the upcoming chapter). The activity is placed
// ten minutes before the upcoming session; the hourly follow-up moves it to the next session when
// the first one starts, then marks it missed once the day has no session left (EF-5). The effect
// is applied without consent; the learner may undo it until the first answer (EF-11).
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { EchauffementParams, type WarmupSessionKind } from '@learny/contracts';
import {
  AppError,
  endOfUserDay,
  ok,
  startOfUserDay,
  toInstant,
  userLocalDay,
  type Result,
} from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import {
  selectWarmup,
  type SelectWarmupInput,
  type WarmupNotionState,
} from '@learny/learning-engine';
import {
  formatWarmupDay,
  offsetIso,
  questionOfBrick,
  sessionKindLabel,
  warmupConsumedSummary,
  warmupDurationMin,
  warmupMeta,
  warmupSlotWindow,
  warmupWhen,
  type WarmupScope,
} from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationTone,
} from '../moteur-d-automatismes';
import { formatHour } from '../reprise';

const MS_PER_DAY = 86_400_000;
const SUMMARY_MAX = 160;
const SESSION_KINDS = "('course', 'exercise', 'validation_quiz', 'contributions', 'mock_exam')";
const WARMUP_LEVELS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] as const;

interface ProfileRow {
  [key: string]: unknown;
  timezone: string;
  tutor_tone: string | null;
  study_days: number[] | string[] | null;
}

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
}

interface SessionRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  kind: string;
  starts_at: Date | string;
  module_id: string | null;
  activity_id: string | null;
}

interface NotionRow {
  [key: string]: unknown;
  notion_id: string;
  formation_id: string;
  chapter_id: string;
  module_position: number;
  last_seen_at: Date | string | null;
  suspended: boolean | null;
  mastery: string | number | null;
}

interface LinkRow {
  [key: string]: unknown;
  from_notion_id: string;
  to_notion_id: string;
}

interface BrickRow {
  [key: string]: unknown;
  brick_id: string;
  version_id: string;
  type: string;
  notion_ids: string[];
  fingerprint: string | null;
  payload: unknown;
  module_id: string;
}

interface ActionRow {
  [key: string]: unknown;
  id: string;
  formation_id: string | null;
  status: string;
  payload: Record<string, unknown>;
}

interface SlotRow {
  [key: string]: unknown;
  id: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
}

interface PlannedWarmupItem {
  position: number;
  notionId: string;
  notionLabel: string;
  tag: 'yesterday' | 'prerequisite';
  moduleNumber: number | null;
  question: string;
  answer: string;
  brickId: string;
  brickVersionId: string;
}

interface WarmupPayload {
  [key: string]: unknown;
  dedupeKey: string;
  date: string;
  activityId: string;
  slotId: string;
  formationId: string;
  formationTitle: string;
  count: number;
  scope: WarmupScope;
  notionIds: string[];
  notionLabels: string[];
  reviewNotionIds: string[];
  items: PlannedWarmupItem[];
  nextSession: {
    slotId: string;
    kind: WarmupSessionKind;
    startsAt: string;
    moduleId: string | null;
    activityId: string | null;
  };
}

function clip(value: string): string {
  if (value.length <= SUMMARY_MAX) return value;
  return `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function dbInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sessionKindOf(value: unknown): WarmupSessionKind {
  switch (value) {
    case 'exercise':
    case 'validation_quiz':
    case 'contributions':
    case 'mock_exam':
    case 'course':
      return value;
    default:
      return 'course';
  }
}

function nextSessionOf(payload: Record<string, unknown>) {
  const raw =
    typeof payload.nextSession === 'object' && payload.nextSession !== null
      ? (payload.nextSession as Record<string, unknown>)
      : {};
  return {
    slotId: stringOf(raw.slotId),
    kind: sessionKindOf(raw.kind),
    startsAt: stringOf(raw.startsAt, new Date(0).toISOString()),
    moduleId: typeof raw.moduleId === 'string' ? raw.moduleId : null,
    activityId: typeof raw.activityId === 'string' ? raw.activityId : null,
  };
}

/** EF-10 — the applied line of the journal (two tones). */
function appliedSummary(
  payload: Record<string, unknown>,
  tone: AutomationTone,
  timeZone: string,
): string {
  const next = nextSessionOf(payload);
  const labels = Array.isArray(payload.notionLabels)
    ? (payload.notionLabels as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const hour = formatHour(next.startsAt, timeZone);
  const noun = sessionKindLabel(next.kind);
  const count = typeof payload.count === 'number' ? payload.count : labels.length;
  const possession = tone === 'tu' ? 'ton' : 'votre';
  return `Échauffement ajouté avant ${possession} ${noun} de ${hour} : ${String(count)} question${count === 1 ? '' : 's'} sur ${labels.join(', ')}.`;
}

/** EF-10 (SPEC-710) — the one-line « dernière action » text of the home feed. */
export function explainWarmupLastAction(
  action: AutomationActionView,
  tone: AutomationTone,
  timeZone: string,
  now: Date | string,
): string {
  const labels = Array.isArray(action.payload.notionLabels)
    ? (action.payload.notionLabels as unknown[]).filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const count = typeof action.payload.count === 'number' ? action.payload.count : labels.length;
  const when = warmupWhen(action.createdAt === '' ? now : action.createdAt, now, timeZone);
  return clip(`${when}, ${String(count)} questions : ${labels.join(', ')}.`);
}

/** EF-10 — one line, ≤ 160 characters, for every status of the journal. */
export function explainEchauffement(
  action: AutomationActionView,
  tone: AutomationTone,
  timeZone: string,
): string {
  const payload = action.payload;
  const day = formatWarmupDay(stringOf(payload.date, action.createdAt.slice(0, 10)));
  switch (action.status) {
    case 'consumed': {
      const labels = Array.isArray(payload.reviewNotionLabels)
        ? (payload.reviewNotionLabels as unknown[]).filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const count = typeof payload.count === 'number' ? payload.count : 0;
      const knewCount = typeof payload.knewCount === 'number' ? payload.knewCount : 0;
      return clip(
        warmupConsumedSummary({
          knewCount,
          count,
          reviewLabels: labels,
          nextQuiz: payload.reviewRemaining === true,
        }),
      );
    }
    case 'expired':
      return clip(`Échauffement du ${day} non fait.`);
    case 'undone':
      return clip(`Annulé : échauffement du ${day}.`);
    default:
      if (payload.lastAction === true)
        return explainWarmupLastAction(action, tone, timeZone, action.createdAt);
      return clip(appliedSummary(payload, tone, timeZone));
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readProfile(db: Db | DbTx, userId: string): Promise<ProfileRow> {
  const rows = await db.execute<ProfileRow>(sql`
    select p.timezone, p.tutor_tone::text as tutor_tone, sp.study_days
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return row;
}

async function activeFormations(db: Db | DbTx, userId: string): Promise<FormationRow[]> {
  return db.execute<FormationRow>(sql`
    select id::text as id, title
    from public.formations
    where owner_id = ${userId}::uuid and status = 'active'
    order by coalesce(end_date, '9999-12-31') asc, created_at asc
  `);
}

async function upcomingSession(
  db: Db | DbTx,
  userId: string,
  formationId: string,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
): Promise<SessionRow | null> {
  const rows = await db.execute<SessionRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.kind::text as kind,
           ss.starts_at,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.formation_id = ${formationId}::uuid
      and ss.status = 'planned'
      and ss.kind::text in ${sql.raw(SESSION_KINDS)}
      and ss.starts_at >= ${dayStart.toISOString()}::timestamptz
      and ss.starts_at < ${dayEnd.toISOString()}::timestamptz
      and ss.starts_at > ${now.toISOString()}::timestamptz
    order by ss.starts_at asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function nextSessionAfter(
  db: Db | DbTx,
  userId: string,
  formationId: string,
  after: Date,
  dayEnd: Date,
): Promise<SessionRow | null> {
  const rows = await db.execute<SessionRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.kind::text as kind,
           ss.starts_at,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.formation_id = ${formationId}::uuid
      and ss.status = 'planned'
      and ss.kind::text in ${sql.raw(SESSION_KINDS)}
      and ss.starts_at > ${after.toISOString()}::timestamptz
      and ss.starts_at < ${dayEnd.toISOString()}::timestamptz
    order by ss.starts_at asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function accessibleChapters(
  db: Db | DbTx,
  userId: string,
  formationId: string,
): Promise<{ chapterIds: string[]; chaptersByModule: Map<string, string[]> }> {
  const rows = await db.execute<{ [key: string]: unknown; id: string; module_id: string }>(sql`
    select ch.id::text as id, ch.module_id::text as module_id
    from public.chapters ch
    join public.modules m on m.id = ch.module_id
    join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where ch.formation_id = ${formationId}::uuid
      and mp.status in ('open', 'validated')
    order by m.position asc, ch.position asc
  `);
  const chaptersByModule = new Map<string, string[]>();
  for (const row of rows) {
    const list = chaptersByModule.get(row.module_id) ?? [];
    list.push(row.id);
    chaptersByModule.set(row.module_id, list);
  }
  return { chapterIds: rows.map((row) => row.id), chaptersByModule };
}

async function seenNotions(
  db: Db | DbTx,
  userId: string,
  formationId: string,
  timeZone: string,
): Promise<NotionRow[]> {
  return db
    .execute<NotionRow>(
      sql`
    select n.id::text as notion_id,
           n.formation_id::text as formation_id,
           n.chapter_id::text as chapter_id,
           m.position as module_position,
           ns.last_seen_at,
           ns.suspended,
           ns.mastery::text as mastery
    from public.notions n
    join public.modules m on m.id = n.module_id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.formation_id = ${formationId}::uuid
    order by m.position asc, n.position asc
  `,
    )
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        last_seen_at:
          row.last_seen_at === null ? null : userLocalDay(dbInstant(row.last_seen_at), timeZone),
      })),
    );
}

async function prerequisiteLinks(
  db: Db | DbTx,
  userId: string,
  formationId: string,
): Promise<LinkRow[]> {
  return db.execute<LinkRow>(sql`
    select from_notion_id::text as from_notion_id, to_notion_id::text as to_notion_id
    from public.notion_links
    where formation_id = ${formationId}::uuid
      and kind = 'prerequisite'
      and (owner_id is null or owner_id = ${userId}::uuid)
  `);
}

async function bricksFor(
  db: Db | DbTx,
  userId: string,
  formationId: string,
  notionIds: readonly string[],
): Promise<BrickRow[]> {
  if (notionIds.length === 0) return [];
  return db.execute<BrickRow>(sql`
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           bv.fingerprint,
           bv.payload,
           n.module_id::text as module_id
    from public.bricks b
    join public.brick_versions bv
      on bv.brick_id = b.id and bv.version = b.current_version
    join public.notions n on n.id = b.notion_ids[1]
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.status = 'active'
      and b.type::text in ('recall_card', 'choice_question')
      and b.notion_ids && array(
        select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid
      )
    order by (b.type = 'recall_card') desc, b.created_at asc
  `);
}

async function seenFingerprints(
  db: Db | DbTx,
  userId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<Set<string>> {
  const rows = await db.execute<{ [key: string]: unknown; fingerprint: string | null }>(sql`
    select distinct bv.fingerprint
    from public.answers a
    join public.attempts t on t.id = a.attempt_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    where t.user_id = ${userId}::uuid
      and bv.fingerprint is not null
      and a.answered_at >= ${dayStart.toISOString()}::timestamptz
      and a.answered_at < ${dayEnd.toISOString()}::timestamptz
  `);
  return new Set(rows.flatMap((row) => (row.fingerprint === null ? [] : [row.fingerprint])));
}

/* ------------------------------------------------------------------ */
/* Generation (EF-3, EF-4, CA-1, CA-5)                                 */
/* ------------------------------------------------------------------ */

function previousStudyDay(today: string, studyDays: readonly number[]): string {
  const [year = 0, month = 1, date = 1] = today.split('-').map(Number);
  for (let back = 1; back <= 7; back += 1) {
    const day = new Date(Date.UTC(year, month - 1, date) - back * MS_PER_DAY);
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    const civil = `${String(day.getUTCFullYear())}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
    if (studyDays.length === 0 || studyDays.includes(isoWeekday)) return civil;
  }
  return today;
}

async function buildDraft(
  ctx: AutomationDomainContext<z.infer<typeof EchauffementParams>>,
  profile: ProfileRow,
  formation: FormationRow,
  session: SessionRow,
  today: string,
): Promise<AutomationActionDraft | null> {
  const db = ctx.db as DbTx;
  const timeZone = profile.timezone;
  const { chapterIds, chaptersByModule } = await accessibleChapters(db, ctx.userId, formation.id);
  const sessionModuleId = session.module_id;
  const nextChapterId =
    (sessionModuleId === null ? undefined : chaptersByModule.get(sessionModuleId)?.[0]) ??
    chapterIds[0];
  if (nextChapterId === undefined) return null;

  const notions = await seenNotions(db, ctx.userId, formation.id, ctx.timeZone);
  const links = await prerequisiteLinks(db, ctx.userId, formation.id);
  const states: WarmupNotionState[] = notions.map((row) => ({
    notionId: row.notion_id,
    formationId: row.formation_id,
    chapterId: row.chapter_id,
    lastSeenOn: row.last_seen_at === null ? null : String(row.last_seen_at),
    suspended: row.suspended === true,
    mastery: Math.min(100, Math.max(0, Number(row.mastery ?? 0))),
    retrievability: null,
  }));
  const input: SelectWarmupInput = {
    formationId: formation.id,
    seenNotions: states,
    prerequisiteLinks: links.map((link) => ({
      fromNotionId: link.from_notion_id,
      toNotionId: link.to_notion_id,
      kind: 'prerequisite' as const,
    })),
    nextChapterId,
    accessibleChapterIds: chapterIds,
    localDate: today,
    scope: ctx.params.scope === 'yesterday' ? 'yesterday' : 'yesterday_and_prerequisites',
    count: ctx.params.count,
    seed: `warmup:${ctx.userId}:${formation.id}:${today}:${ctx.params.scope}`,
  };
  const selected = selectWarmup(input);
  if (selected.length === 0) return null;

  const referenceDay = previousStudyDay(
    today,
    (profile.study_days ?? []).map((day) => Number(day)),
  );
  const fingerprints = await seenFingerprints(
    db,
    ctx.userId,
    startOfUserDay(referenceDay, timeZone),
    startOfUserDay(today, timeZone),
  );
  const bricks = await bricksFor(
    db,
    ctx.userId,
    formation.id,
    selected.map((choice) => choice.notionId),
  );
  const notionById = new Map(notions.map((row) => [row.notion_id, row]));
  const items: PlannedWarmupItem[] = [];
  for (const choice of selected) {
    if (items.length >= ctx.params.count) break;
    const notion = notionById.get(choice.notionId);
    if (notion === undefined) continue;
    const brick = bricks.find(
      (candidate) =>
        candidate.notion_ids.includes(choice.notionId) &&
        (candidate.fingerprint === null || !fingerprints.has(candidate.fingerprint)),
    );
    if (brick === undefined) continue;
    const question = questionOfBrick(brick.type, brick.payload);
    if (question === null) continue;
    items.push({
      position: items.length,
      notionId: choice.notionId,
      notionLabel: '',
      tag: choice.reason,
      moduleNumber: choice.reason === 'prerequisite' ? notion.module_position : null,
      question: question.question,
      answer: question.answer,
      brickId: brick.brick_id,
      brickVersionId: brick.version_id,
    });
  }
  if (items.length === 0) return null;
  const labels = new Map(
    (
      await db.execute<{ [key: string]: unknown; id: string; label: string }>(sql`
      select id::text as id, label from public.notions
      where id = any(
        array(select jsonb_array_elements_text(${JSON.stringify(items.map((item) => item.notionId))}::jsonb)::uuid)
      )
    `)
    ).map((row) => [row.id, row.label]),
  );
  for (const item of items) item.notionLabel = labels.get(item.notionId) ?? 'Notion';

  const count = items.length;
  const payload: WarmupPayload = {
    dedupeKey: `warmup:${today}:${formation.id}`,
    date: today,
    activityId: '',
    slotId: '',
    formationId: formation.id,
    formationTitle: formation.title,
    count,
    scope: ctx.params.scope,
    notionIds: items.map((item) => item.notionId),
    notionLabels: items.map((item) => item.notionLabel),
    reviewNotionIds: [],
    items,
    nextSession: {
      slotId: session.id,
      kind: sessionKindOf(session.kind),
      startsAt: offsetIso(session.starts_at, timeZone),
      moduleId: session.module_id,
      activityId: session.activity_id,
    },
  };
  return {
    kind: 'warmup_added',
    formationId: formation.id,
    requiresConsent: false,
    payload: payload as unknown as Record<string, unknown>,
    dedupeKey: payload.dedupeKey,
  };
}

async function generationDrafts(
  ctx: AutomationDomainContext<z.infer<typeof EchauffementParams>>,
): Promise<AutomationActionDraft[]> {
  const db = ctx.db as DbTx;
  const profile = await readProfile(db, ctx.userId);
  const today = userLocalDay(ctx.now, profile.timezone);
  const dayStart = startOfUserDay(today, profile.timezone);
  const dayEnd = endOfUserDay(today, profile.timezone);
  const formations = await activeFormations(db, ctx.userId);
  const drafts: AutomationActionDraft[] = [];
  for (const formation of formations) {
    const existing = await db.execute<{ id: string }>(sql`
      select id::text as id from public.automation_actions
      where user_id = ${ctx.userId}::uuid
        and automation = 'echauffement'
        and (payload ->> 'dedupeKey') = ${`warmup:${today}:${formation.id}`}
      limit 1
    `);
    if (existing.length > 0) continue;
    const session = await upcomingSession(db, ctx.userId, formation.id, ctx.now, dayStart, dayEnd);
    if (session === null) continue;
    const draft = await buildDraft(ctx, profile, formation, session, today);
    if (draft !== null) drafts.push(draft);
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/* Follow-up of the upcoming session (EF-5, CA-2)                      */
/* ------------------------------------------------------------------ */

async function answersOfActivity(db: DbTx, userId: string, activityId: string): Promise<number> {
  const rows = await db.execute<{ [key: string]: unknown; n: number }>(sql`
    select count(*)::int as n
    from public.answers a
    join public.attempts t on t.id = a.attempt_id
    where t.user_id = ${userId}::uuid and t.activity_id = ${activityId}::uuid
  `);
  return rows[0]?.n ?? 0;
}

async function moveSlot(
  db: DbTx,
  userId: string,
  action: ActionRow,
  payload: WarmupPayload,
  now: Date,
): Promise<boolean> {
  const profile = await readProfile(db, userId);
  const timeZone = profile.timezone;
  const tone: AutomationTone = profile.tutor_tone === 'tu' ? 'tu' : 'vous';
  const today = payload.date;
  const dayEnd = endOfUserDay(today, timeZone);
  const target = toInstant(payload.nextSession.startsAt);
  if (now.getTime() < target.getTime()) return false;
  const formationId = action.formation_id;
  if (formationId === null) return false;
  const next = await nextSessionAfter(db, userId, formationId, target, dayEnd);
  if (next === null) {
    await db.execute(sql`
      update public.schedule_slots
      set status = 'missed', updated_at = ${now.toISOString()}::timestamptz
      where id = ${payload.slotId}::uuid and user_id = ${userId}::uuid and status = 'planned'
    `);
    await db.execute(sql`
      update public.automation_actions
      set status = 'expired', summary = ${`Échauffement du ${formatWarmupDay(today)} non fait.`}
      where id = ${action.id}::uuid and user_id = ${userId}::uuid
    `);
    return true;
  }
  const window = warmupSlotWindow(dbInstant(next.starts_at), payload.count);
  await db.execute(sql`
    update public.schedule_slots
    set status = 'moved', updated_at = ${now.toISOString()}::timestamptz
    where id = ${payload.slotId}::uuid and user_id = ${userId}::uuid and status = 'planned'
  `);
  const inserted = await db.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, activity_id, kind, title, meta,
      starts_at, ends_at, status, created_by, moved_from_id
    ) values (
      ${userId}::uuid, ${formationId}::uuid, ${next.module_id}::uuid,
      ${payload.activityId}::uuid, 'warmup', 'Échauffement',
      ${warmupMeta(payload.count, warmupDurationMin(payload.count))},
      ${window.startsAt.toISOString()}::timestamptz, ${window.endsAt.toISOString()}::timestamptz,
      'planned', 'automation', ${payload.slotId}::uuid
    )
    returning id::text as id
  `);
  const slotId = inserted[0]?.id;
  if (slotId === undefined) return false;
  const nextPayload: WarmupPayload = {
    ...payload,
    slotId,
    nextSession: {
      slotId: next.id,
      kind: sessionKindOf(next.kind),
      startsAt: offsetIso(next.starts_at, timeZone),
      moduleId: next.module_id,
      activityId: next.activity_id,
    },
  };
  await db.execute(sql`
    update public.automation_actions
    set payload = ${JSON.stringify(nextPayload)}::jsonb,
        summary = ${clip(appliedSummary(nextPayload as unknown as Record<string, unknown>, tone, timeZone))}
    where id = ${action.id}::uuid and user_id = ${userId}::uuid
  `);
  return true;
}

async function followUp(
  ctx: AutomationDomainContext<z.infer<typeof EchauffementParams>>,
): Promise<AutomationActionDraft[]> {
  const db = ctx.db as DbTx;
  const profile = await readProfile(db, ctx.userId);
  const today = userLocalDay(ctx.now, profile.timezone);
  const actions = await db.execute<ActionRow>(sql`
    select id::text as id,
           formation_id::text as formation_id,
           status::text as status,
           payload
    from public.automation_actions
    where user_id = ${ctx.userId}::uuid
      and automation = 'echauffement'
      and status = 'applied'
      and (payload ->> 'date') = ${today}
    order by created_at asc
  `);
  for (const action of actions) {
    const payload = action.payload as unknown as WarmupPayload;
    if (stringOf(payload.activityId) === '' || stringOf(payload.slotId) === '') continue;
    const answered = await answersOfActivity(db, ctx.userId, payload.activityId);
    if (answered > 0) continue;
    const slots = await db.execute<SlotRow>(sql`
      select id::text as id, status::text as status, starts_at, ends_at
      from public.schedule_slots
      where id = ${payload.slotId}::uuid and user_id = ${ctx.userId}::uuid
    `);
    if (slots[0]?.status !== 'planned') continue;
    await moveSlot(db, ctx.userId, action, payload, ctx.now);
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

async function insertWarmupSlot(
  tx: DbTx,
  userId: string,
  payload: WarmupPayload,
  activityId: string,
): Promise<string> {
  const start = toInstant(payload.nextSession.startsAt);
  const window = warmupSlotWindow(start, payload.count);
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, activity_id, kind, title, meta,
      starts_at, ends_at, status, created_by
    ) values (
      ${userId}::uuid, ${stringOf(payload.formationId)}::uuid, ${payload.nextSession.moduleId}::uuid,
      ${activityId}::uuid, 'warmup', 'Échauffement',
      ${warmupMeta(payload.count, warmupDurationMin(payload.count))},
      ${window.startsAt.toISOString()}::timestamptz, ${window.endsAt.toISOString()}::timestamptz,
      'planned', 'automation'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau d’échauffement non créé.');
  return id;
}

async function applyWarmup(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload as unknown as WarmupPayload;
  const formationId = stringOf(payload.formationId, action.formationId ?? '');
  if (formationId === '' || payload.items.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Échauffement incomplet.');
  }
  const activityId = randomUUID();
  const config = {
    durationSec: warmupDurationMin(payload.count) * 60,
    questionCount: payload.count,
    scope: payload.scope,
    slotId: '',
    nextSession: payload.nextSession,
    items: payload.items.map((item) => ({
      position: item.position,
      notionId: item.notionId,
      tag: item.tag,
      moduleNumber: item.moduleNumber,
    })),
  };
  await ctx.tx.execute(sql`
    insert into public.activities (
      id, owner_id, formation_id, module_id, kind, config, items, status, for_date, created_at
    ) values (
      ${activityId}::uuid, ${ctx.userId}::uuid, ${formationId}::uuid,
      ${payload.nextSession.moduleId}::uuid, 'warmup',
      ${JSON.stringify(config)}::jsonb,
      ${JSON.stringify(
        payload.items.map((item) => ({
          brickId: item.brickId,
          brickVersionId: item.brickVersionId,
        })),
      )}::jsonb,
      'ready', ${payload.date}::date, ${ctx.now.toISOString()}::timestamptz
    )
  `);
  const normalized: WarmupPayload = { ...payload, formationId };
  const slotId = await insertWarmupSlot(ctx.tx, ctx.userId, normalized, activityId);
  await ctx.tx.execute(sql`
    update public.activities
    set config = jsonb_set(config, '{slotId}', ${JSON.stringify(slotId)}::jsonb)
    where id = ${activityId}::uuid and owner_id = ${ctx.userId}::uuid
  `);
  return ok({
    payload: {
      ...action.payload,
      activityId,
      slotId,
      formationId,
      appliedAt: ctx.now.toISOString(),
    },
    undoPayload: { activityId, slotId },
  });
}

async function undoWarmup(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const activityId = stringOf(undo.activityId);
  const slotId = stringOf(undo.slotId);
  if (activityId !== '') {
    const answered = await answersOfActivity(ctx.tx, ctx.userId, activityId);
    if (answered > 0) {
      throw new AppError(
        'AUTOMATION_ACTION_CONSUMED',
        'Cet échauffement a commencé : il ne peut plus être annulé.',
      );
    }
    await ctx.tx.execute(sql`
      update public.activities
      set status = 'archived'
      where id = ${activityId}::uuid and owner_id = ${ctx.userId}::uuid and status = 'ready'
    `);
  }
  if (slotId !== '') {
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
      where id = ${slotId}::uuid and user_id = ${ctx.userId}::uuid and status = 'planned'
    `);
  }
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const echauffementAutomation: AutomationDefinition<typeof EchauffementParams> =
  defineAutomation({
    key: 'echauffement',
    triggers: [
      ...WARMUP_LEVELS.map((localHour) => ({ type: 'hourly' as const, localHour })),
      { type: 'direct' },
    ],
    params: EchauffementParams,
    run: async (ctx, trigger) => {
      const hour = trigger.type === 'hourly' ? trigger.localHour : null;
      if (trigger.type === 'direct' || hour === 6) return generationDrafts(ctx);
      if (typeof hour === 'number' && hour >= 7 && hour <= 22) return followUp(ctx);
      return [];
    },
    explain: explainEchauffement,
    apply: applyWarmup,
    undo: undoWarmup,
  });
