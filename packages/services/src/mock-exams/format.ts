// Format and introduction of the mock exam (SPEC-614 EF-1, EF-5, ET-3, BR-PRA-02, BR-PRA-05,
// ADR-0028). The official format comes from a guide (`resources.kind = 'exam_guide'`) and is
// inactive until the learner confirms it; without a guide the normative default applies: 20
// questions, 2 minutes each (40 minutes) and a 70 % threshold.
import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import {
  ExamFormatSchema,
  type ExamFormatSchema as ExamFormat,
  type ExamIntroDto,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { schema, sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { ensureMockExamSlots } from '../planning';
import { requireUser, toResult } from '../resources/result';

const UUID = z.uuid();

interface FormationRow extends Record<string, unknown> {
  id: string;
  title: string;
  objectives: string[];
  exam_format: unknown;
}

interface GuideRow extends Record<string, unknown> {
  id: string;
  metadata: unknown;
  content_text: string | null;
}

interface ModuleRow extends Record<string, unknown> {
  module_id: string;
  position: number;
  label: string;
  status: string;
  notion_count: number;
  seen_count: number;
}

interface SlotRow extends Record<string, unknown> {
  starts_at: Date | string;
  title: string;
}

interface LastAttemptRow extends Record<string, unknown> {
  id: string;
  status: string;
  score: string | null;
}

const guideFormatSchema = z.looseObject({
  questions: z.number().int().min(1).max(200).optional(),
  questionCount: z.number().int().min(1).max(200).optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  secondsPerQuestion: z.number().int().min(1).max(3_600).optional(),
  threshold: z.number().int().min(1).max(100),
});

const attemptStatusSchema = z.enum([
  'in_progress',
  'submitted',
  'graded',
  'timed_out',
  'abandoned',
]);

/** BR-PRA-02 — 20 questions × 2 minutes, threshold 70 %, from the product configuration. */
export function defaultExamFormat(): ExamFormat {
  const questions = ENGINE.planner.mockExam.questions;
  const minutesPerQuestion = ENGINE.planner.mockExam.minutesPerQuestion;
  return {
    questionCount: questions,
    secondsPerQuestion: minutesPerQuestion * 60,
    durationMin: questions * minutesPerQuestion,
    threshold: ENGINE.planner.mockExam.threshold,
    source: 'default',
    confirmed: true,
  };
}

function secondsFromDuration(questionCount: number, durationMin: number): number {
  return Math.max(1, Math.round((durationMin * 60) / questionCount));
}

function formatFromGuide(guide: {
  id: string;
  format: z.infer<typeof guideFormatSchema>;
}): ExamFormat {
  const questions = guide.format.questions ?? guide.format.questionCount ?? 20;
  const durationMin =
    guide.format.durationMin ??
    Math.max(1, Math.round((questions * (guide.format.secondsPerQuestion ?? 120)) / 60));
  return {
    questionCount: questions,
    secondsPerQuestion:
      guide.format.secondsPerQuestion ?? secondsFromDuration(questions, durationMin),
    durationMin,
    threshold: guide.format.threshold,
    source: 'guide',
    confirmed: false,
    sourceResourceId: guide.id,
  };
}

/**
 * ET-3 — a stored confirmed format wins; an extracted guide format stays proposed until the
 * learner confirms it; otherwise the normative default applies (CA-1).
 */
export function proposeExamFormat(input: {
  stored: unknown;
  guide: { id: string; metadata: unknown } | null;
}): ExamFormat {
  const stored = schema.examFormatSchema.safeParse(input.stored);
  if (stored.success) {
    return {
      questionCount: stored.data.questions,
      secondsPerQuestion: secondsFromDuration(stored.data.questions, stored.data.durationMin),
      durationMin: stored.data.durationMin,
      threshold: stored.data.threshold,
      source: stored.data.sourceResourceId === undefined ? 'default' : 'guide',
      confirmed: stored.data.confirmed,
      ...(stored.data.sourceResourceId === undefined
        ? {}
        : { sourceResourceId: stored.data.sourceResourceId }),
    };
  }
  if (input.guide !== null) {
    const metadata = asObject(input.guide.metadata);
    const extracted = guideFormatSchema.safeParse(metadata?.examFormat ?? metadata?.format);
    if (extracted.success) {
      return formatFromGuide({ id: input.guide.id, format: extracted.data });
    }
  }
  return defaultExamFormat();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Owner or active group member, as every read of the formation domain (SPEC-113 RLS). */
async function readFormation(tx: DbTx, userId: string, formationId: string): Promise<FormationRow> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           f.objectives::text[] as objectives,
           f.exam_format
    from public.formations f
    where f.id = ${formationId}::uuid
      and (f.owner_id = ${userId}::uuid or exists (
        select 1
        from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.formation_id = f.id
          and gm.user_id = ${userId}::uuid
          and gm.member_status = 'active'
      ))
    limit 1
  `);
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return formation;
}

async function readGuide(tx: DbTx, formationId: string): Promise<GuideRow | null> {
  const rows = await tx.execute<GuideRow>(sql`
    select id::text as id, metadata, content_text
    from public.resources
    where formation_id = ${formationId}::uuid
      and kind = 'exam_guide'
      and deleted_at is null
      and status in ('ready', 'processing')
    order by created_at asc, id asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function readModules(tx: DbTx, userId: string, formationId: string): Promise<ModuleRow[]> {
  return tx.execute<ModuleRow>(sql`
    select m.id::text as module_id,
           m.position,
           m.title as label,
           coalesce(mp.status, m.status)::text as status,
           count(distinct n.id)::int as notion_count,
           count(distinct ns.notion_id) filter (where ns.first_seen_at is not null)::int as seen_count
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    left join public.chapters c on c.module_id = m.id
    left join public.notions n on n.chapter_id = c.id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where m.formation_id = ${formationId}::uuid
    group by m.id, m.position, m.title, m.status, mp.status
    order by m.position asc
  `);
}

/** A module is studied when it is open/validated or when one of its notions was already seen. */
export function isStudiedModule(module: { status: string; seenCount: number }): boolean {
  return module.status !== 'locked' || module.seenCount > 0;
}

/**
 * Shares `questionCount` over modules in proportion to their notions, then distributes the
 * remainder by the largest fractional share (stable module order). The sum is exactly the
 * requested count when the bank allows it; the attempt service caps it on the available bricks.
 */
export function allocateQuestionCounts(
  questionCount: number,
  modules: readonly { moduleId: string; notionCount: number }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const totalNotions = modules.reduce((sum, module) => sum + Math.max(0, module.notionCount), 0);
  if (modules.length === 0 || questionCount <= 0) return counts;
  if (totalNotions === 0) {
    const each = Math.floor(questionCount / modules.length);
    let remainder = questionCount - each * modules.length;
    for (const module of modules) {
      counts.set(module.moduleId, each + (remainder > 0 ? 1 : 0));
      remainder -= 1;
    }
    return counts;
  }
  const shares = modules.map((module) => {
    const exact = (questionCount * Math.max(0, module.notionCount)) / totalNotions;
    return {
      moduleId: module.moduleId,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  let assigned = shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of shares) counts.set(share.moduleId, share.floor);
  const byFraction = [...shares].sort(
    (left, right) => right.fraction - left.fraction || left.moduleId.localeCompare(right.moduleId),
  );
  let index = 0;
  while (assigned < questionCount && byFraction.length > 0) {
    const share = byFraction[index % byFraction.length];
    if (share !== undefined) {
      counts.set(share.moduleId, (counts.get(share.moduleId) ?? 0) + 1);
      assigned += 1;
    }
    index += 1;
  }
  return counts;
}

function moduleDto(module: ModuleRow): { moduleId: string; position: number; label: string } {
  return { moduleId: module.module_id, position: module.position, label: module.label };
}

async function readNextExams(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<{ startsAt: string; label: string }[]> {
  const rows = await tx.execute<SlotRow>(sql`
    select starts_at, title
    from public.schedule_slots
    where user_id = ${userId}::uuid
      and formation_id = ${formationId}::uuid
      and kind = 'mock_exam'
      and status = 'planned'
      and starts_at >= ${now.toISOString()}::timestamptz
    order by starts_at asc
    limit 2
  `);
  return rows.map((row) => ({
    startsAt: (row.starts_at instanceof Date
      ? row.starts_at
      : new Date(row.starts_at)
    ).toISOString(),
    label: row.title,
  }));
}

/**
 * EF-1, EF-5 — the introduction: proposed/confirmed format, studied and diagnostic modules,
 * estimated diagnostic share and the two planned exams of a formation with the `exam` objective.
 */
export function getExamIntro(
  ctx: ServiceContext,
  formationIdValue: string,
): Promise<Result<ExamIntroDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(formationIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const formationId = formationIdValue;
    // BR-PRA-05 — a formation with the `exam` objective always carries its two exams.
    const planned = await ensureMockExamSlots(ctx, formationId);
    if (!planned.ok) throw planned.error;
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      const guide = await readGuide(tx, formationId);
      const format = proposeExamFormat({
        stored: formation.exam_format,
        guide: guide === null ? null : { id: guide.id, metadata: guide.metadata },
      });
      const modules = await readModules(tx, userId, formationId);
      const studiedModules: ExamIntroDto['studiedModules'] = [];
      const diagnosticModules: ExamIntroDto['diagnosticModules'] = [];
      for (const module of modules) {
        const studied = isStudiedModule({
          status: module.status,
          seenCount: module.seen_count,
        });
        (studied ? studiedModules : diagnosticModules).push(moduleDto(module));
      }
      const quotas = allocateQuestionCounts(
        format.questionCount,
        modules.map((module) => ({
          moduleId: module.module_id,
          notionCount: module.notion_count,
        })),
      );
      const diagnosticQuestionCount = diagnosticModules.reduce(
        (sum, module) => sum + (quotas.get(module.moduleId) ?? 0),
        0,
      );
      const nextExams = await readNextExams(tx, userId, formationId, ctx.clock.now());
      const lastRows = await tx.execute<LastAttemptRow>(sql`
        select at.id::text as id, at.status::text as status, at.score::text as score
        from public.attempts at
        join public.activities act on act.id = at.activity_id
        where at.user_id = ${userId}::uuid
          and act.formation_id = ${formationId}::uuid
          and act.kind = 'mock_exam'
        order by at.created_at desc, at.id desc
        limit 1
      `);
      const last = lastRows[0];
      return {
        formationId,
        title: formation.title,
        format,
        hasGuide: guide !== null,
        studiedModules,
        diagnosticModules,
        diagnosticQuestionCount,
        nextExams,
        lastAttempt:
          last === undefined
            ? null
            : {
                attemptId: last.id,
                status: attemptStatusSchema.parse(last.status),
                score: last.score === null ? null : Number(last.score),
              },
      };
    });
  });
}

/**
 * ET-3 — records the learner's explicit confirmation. An extracted format is never applied
 * before this call; confirming an already stored format is idempotent.
 */
export function confirmExamFormat(
  ctx: ServiceContext,
  formationIdValue: string,
): Promise<Result<ExamFormat>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(formationIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const formationId = formationIdValue;
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      const guide = await readGuide(tx, formationId);
      const format = proposeExamFormat({
        stored: formation.exam_format,
        guide: guide === null ? null : { id: guide.id, metadata: guide.metadata },
      });
      const stored = {
        questions: format.questionCount,
        durationMin: format.durationMin,
        threshold: format.threshold,
        confirmed: true,
        ...(format.sourceResourceId === undefined
          ? {}
          : { sourceResourceId: format.sourceResourceId }),
      };
      await tx.execute(sql`
        update public.formations
        set exam_format = ${JSON.stringify(stored)}::jsonb,
            updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${formationId}::uuid
      `);
      return ExamFormatSchema.parse({ ...format, confirmed: true });
    });
  });
}
