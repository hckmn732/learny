// Read side of the daily warm-up (SPEC-714 EF-7, ET-2). One call returns the warm-ups of the day
// of the connected learner, one per formation, sorted by the hour of their upcoming session. All
// reads go through the learner's RLS transaction; a foreign activity never appears (CA-7).
import { sql } from 'drizzle-orm';

import {
  WarmupSessionKind,
  type WarmupDto,
  type WarmupItem,
  type WarmupNextSession,
  type WarmupTodayDto,
} from '@learny/contracts';
import { userDayBounds, userLocalDay, type Result } from '@learny/core';
import type { DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import {
  nextSessionHref,
  offsetIso,
  parseWarmupConfig,
  questionOfBrick,
  warmupScopeOf,
  warmupStatus,
  type WarmupConfig,
  type WarmupScope,
} from './derive';

export interface WarmupActivityRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  module_id: string | null;
  module_position: number | null;
  config: unknown;
  items: unknown;
  status: string;
  for_date: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_submitted_at: Date | string | null;
  slot_starts_at: Date | string | null;
  review_remaining: boolean | null;
}

export interface WarmupSessionRow {
  [key: string]: unknown;
  id: string;
  kind: string;
  starts_at: Date | string;
  module_id: string | null;
  activity_id: string | null;
}

interface AnswerRow {
  [key: string]: unknown;
  position: number;
  is_correct: boolean | null;
  response: unknown;
}

interface VersionRow {
  [key: string]: unknown;
  version_id: string;
  brick_id: string;
  type: string;
  notion_ids: string[];
  payload: unknown;
}

interface NotionRow {
  [key: string]: unknown;
  id: string;
  label: string;
  module_position: number;
}

interface ProfileRow {
  [key: string]: unknown;
  timezone: string;
}

const SESSION_KINDS = "('course', 'exercise', 'validation_quiz', 'contributions', 'mock_exam')";

export function dbInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function loadTimezone(tx: DbTx, userId: string): Promise<string> {
  const rows = await tx.execute<ProfileRow>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.timezone ?? 'Europe/Paris';
}

/** EF-2 — every scheduled session of the day, ordered, so the next one is chosen in memory. */
export async function loadDaySessions(
  tx: DbTx,
  userId: string,
  formationId: string,
  today: string,
  timeZone: string,
): Promise<WarmupSessionRow[]> {
  const bounds = userDayBounds(today, timeZone);
  return tx.execute<WarmupSessionRow>(sql`
    select ss.id::text as id,
           ss.kind::text as kind,
           ss.starts_at,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.formation_id = ${formationId}::uuid
      and ss.status = 'planned'
      and ss.kind::text in ${sql.raw(SESSION_KINDS)}
      and ss.starts_at >= ${bounds.start.toISOString()}::timestamptz
      and ss.starts_at < ${bounds.end.toISOString()}::timestamptz
    order by ss.starts_at asc
  `);
}

/** EF-2 — the upcoming session, then the session the warm-up slot precedes (finished card). */
export function pickNextSession(
  sessions: readonly WarmupSessionRow[],
  now: Date,
  slotStartsAt: Date | string | null,
  config: WarmupConfig,
  timeZone: string,
  formationId: string,
): WarmupNextSession {
  const upcoming = sessions.find((row) => dbInstant(row.starts_at) > now.toISOString());
  const afterSlot =
    slotStartsAt === null
      ? undefined
      : sessions.find((row) => dbInstant(row.starts_at) >= dbInstant(slotStartsAt));
  const chosen = upcoming ?? afterSlot ?? sessions[0];
  if (chosen !== undefined) {
    const kind = WarmupSessionKind.safeParse(chosen.kind);
    const sessionKind = kind.success ? kind.data : 'course';
    return {
      kind: sessionKind,
      startsAt: offsetIso(chosen.starts_at, timeZone),
      href: nextSessionHref({
        kind: sessionKind,
        formationId,
        moduleId: chosen.module_id,
        activityId: chosen.activity_id,
      }),
    };
  }
  const snapshotKind = WarmupSessionKind.safeParse(config.nextSession?.kind);
  const kind = snapshotKind.success ? snapshotKind.data : 'course';
  const startsAt =
    config.nextSession?.startsAt === undefined
      ? offsetIso(now, timeZone)
      : offsetIso(config.nextSession.startsAt, timeZone);
  return {
    kind,
    startsAt,
    href: '/agenda',
  };
}

function tagOf(
  config: WarmupConfig,
  position: number,
  notionId: string,
  notionModule: number,
  activityModule: number | null,
): { tag: 'yesterday' | 'prerequisite'; moduleNumber: number | null } {
  const meta = config.items?.find(
    (item) => item.position === position || item.notionId === notionId,
  );
  const fallback: 'yesterday' | 'prerequisite' =
    activityModule !== null && notionModule < activityModule ? 'prerequisite' : 'yesterday';
  const tag = meta?.tag ?? fallback;
  const moduleNumber = tag === 'prerequisite' ? (meta?.moduleNumber ?? notionModule) : null;
  return { tag, moduleNumber };
}

/** EF-7 — the DTO of one activity, built from the exact brick versions it stores. */
export async function loadWarmupDto(
  tx: DbTx,
  activity: WarmupActivityRow,
  formationId: string,
  timeZone: string,
  now: Date,
  sessions: readonly WarmupSessionRow[],
): Promise<WarmupDto> {
  const config = parseWarmupConfig(activity.config);
  const scope: WarmupScope = warmupScopeOf(config);
  const items = (Array.isArray(activity.items) ? activity.items : []) as {
    brickId?: string;
    brickVersionId?: string;
  }[];
  const versionIds = items.map((item) => item.brickVersionId ?? '').filter((value) => value !== '');
  const versions =
    versionIds.length === 0
      ? []
      : await tx.execute<VersionRow>(sql`
          select bv.id::text as version_id,
                 b.id::text as brick_id,
                 b.type::text as type,
                 b.notion_ids::text[] as notion_ids,
                 bv.payload
          from public.brick_versions bv
          join public.bricks b on b.id = bv.brick_id
          where bv.id = any(
            array(select jsonb_array_elements_text(${JSON.stringify(versionIds)}::jsonb)::uuid)
          )
        `);
  const versionById = new Map(versions.map((row) => [row.version_id, row]));
  const notionIds = [...new Set(versions.flatMap((row) => row.notion_ids))];
  const notions =
    notionIds.length === 0
      ? []
      : await tx.execute<NotionRow>(sql`
          select n.id::text as id, n.label, m.position as module_position
          from public.notions n
          join public.modules m on m.id = n.module_id
          where n.id = any(
            array(select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid)
          )
        `);
  const notionById = new Map(notions.map((row) => [row.id, row]));
  const answers =
    activity.attempt_id === null
      ? []
      : await tx.execute<AnswerRow>(sql`
          select position, is_correct, response
          from public.answers
          where attempt_id = ${activity.attempt_id}::uuid
          order by position asc
        `);
  const dtoAnswers = answers.map((row) => ({
    position: row.position - 1,
    knew:
      (typeof row.response === 'object' &&
        row.response !== null &&
        (row.response as { knew?: unknown }).knew === true) ||
      row.is_correct === true,
  }));
  const dtoItems: WarmupItem[] = [];
  for (const [position, item] of items.entries()) {
    const version = versionById.get(item.brickVersionId ?? '');
    if (version === undefined) continue;
    const question = questionOfBrick(version.type, version.payload);
    if (question === null) continue;
    const notionId = version.notion_ids[0] ?? '';
    const notion = notionById.get(notionId);
    if (notion === undefined) continue;
    const { tag, moduleNumber } = tagOf(
      config,
      position,
      notionId,
      notion.module_position,
      activity.module_position,
    );
    dtoItems.push({
      position,
      notionId,
      notionLabel: notion.label,
      tag,
      moduleNumber,
      question: question.question,
      answer: question.answer,
    });
  }
  const submitted =
    activity.attempt_submitted_at !== null ||
    activity.attempt_status === 'submitted' ||
    activity.attempt_status === 'graded';
  const nextSession = pickNextSession(
    sessions,
    now,
    activity.slot_starts_at,
    config,
    timeZone,
    formationId,
  );
  return {
    activityId: activity.id,
    formationId,
    nextSession,
    scope,
    items: dtoItems,
    answers: dtoAnswers,
    status: warmupStatus({
      itemCount: dtoItems.length,
      answerCount: dtoAnswers.length,
      attemptStatus: activity.attempt_status,
      submitted,
    }),
    reviewRemaining: activity.review_remaining === true,
  };
}

/** EF-7, ET-2 — the warm-ups of the day, one per formation, sorted by session hour. */
export function getTodayWarmups(ctx: ServiceContext): Promise<Result<WarmupTodayDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const timeZone = await loadTimezone(tx, userId);
      const today = userLocalDay(now, timeZone);
      const activities = await tx.execute<WarmupActivityRow>(sql`
        select a.id::text as id,
               a.formation_id::text as formation_id,
               a.module_id::text as module_id,
               m.position as module_position,
               a.config,
               a.items,
               a.status::text as status,
               a.for_date::text as for_date,
               t.id::text as attempt_id,
               t.status::text as attempt_status,
               t.submitted_at as attempt_submitted_at,
               (
                 select ss.starts_at
                 from public.schedule_slots ss
                 where ss.activity_id = a.id
                   and ss.status in ('planned', 'done', 'moved')
                 order by ss.starts_at desc
                 limit 1
               ) as slot_starts_at,
               (
                 select (aa.payload ->> 'reviewRemaining')::boolean
                 from public.automation_actions aa
                 where aa.user_id = a.owner_id
                   and aa.automation = 'echauffement'
                   and (aa.payload ->> 'activityId') = a.id::text
                 order by aa.created_at desc
                 limit 1
               ) as review_remaining
        from public.activities a
        left join public.modules m on m.id = a.module_id
        left join public.attempts t
          on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
        where a.owner_id = ${userId}::uuid
          and a.kind = 'warmup'
          and a.for_date = ${today}::date
          and a.status = 'ready'
        order by a.created_at asc
      `);
      const sessionsByFormation = new Map<string, WarmupSessionRow[]>();
      const items: WarmupDto[] = [];
      for (const activity of activities) {
        let sessions = sessionsByFormation.get(activity.formation_id);
        if (sessions === undefined) {
          sessions = await loadDaySessions(tx, userId, activity.formation_id, today, timeZone);
          sessionsByFormation.set(activity.formation_id, sessions);
        }
        const dto = await loadWarmupDto(
          tx,
          activity,
          activity.formation_id,
          timeZone,
          now,
          sessions,
        );
        if (dto.items.length > 0) items.push(dto);
      }
      items.sort(
        (left, right) =>
          Date.parse(left.nextSession.startsAt) - Date.parse(right.nextSession.startsAt),
      );
      return { items };
    });
  });
}
