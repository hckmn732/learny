import { ENGINE, GAP_NATURE_LABELS } from '@learny/config/product';
import type { FinalReviewDto, FinalReviewMode, FinalReviewNotion } from '@learny/contracts';
import { AppError, userLocalDay } from '@learny/core';
import { formationMonogram } from '@learny/db';
import { calculateProgress } from '@learny/learning-engine';

import { trainingTarget } from '../gaps/links';
import { completedSummary } from '../home/derive';
import { evidenceOf } from '../quiz/result';
import { milestoneLabel } from '../serie-regularite-et-jalons-interface';

// Pure projection of the final review (SPEC-617 EF-1 to EF-3, ET-5; BR-FOR-12, BR-PRO-03).
//
// Every value is derived from rows the service already read under RLS; the function never reads a
// clock, a database or a provider. A formation is complete only when every module is validated,
// and retention stays null until a horizon is measurable (CA-1, CA-3, CL-5).

const MS_PER_MINUTE = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FinalReviewFormationRow {
  id: string;
  title: string;
  monogram: string;
  accent: string;
  status: string;
  default_threshold: number;
  start_date: string | null;
  completed_at: Date | string | null;
  maintenance_mode: FinalReviewMode | null;
  updated_at: Date | string;
  owner_id: string;
  [key: string]: unknown;
}

export interface FinalReviewModuleRow {
  id: string;
  position: number;
  title: string;
  threshold: number;
  status: string;
  validated_at: Date | string | null;
  best_score: number | null;
  [key: string]: unknown;
}

export interface FinalReviewNotionRow {
  id: string;
  label: string;
  module_id: string;
  module_position: number;
  module_title: string;
  mastery: number;
  gap_nature: string | null;
  gap_evidence: string | null;
  confused_with_label: string | null;
  [key: string]: unknown;
}

export interface FinalReviewSlotRow {
  id: string;
  kind: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  moved_from_id: string | null;
  [key: string]: unknown;
}

/** SPEC-723 EF-3 — one milestone of the learner, with its local achievement date. */
export interface FinalReviewMilestoneRow {
  id: string;
  key: string;
  ref_id: string | null;
  formation_id: string | null;
  formation_title: string | null;
  module_title: string | null;
  achieved_at: Date | string;
  [key: string]: unknown;
}

export interface FinalReviewSource {
  formation: FinalReviewFormationRow;
  modules: readonly FinalReviewModuleRow[];
  notions: readonly FinalReviewNotionRow[];
  slots: readonly FinalReviewSlotRow[];
  milestones: readonly FinalReviewMilestoneRow[];
  retention: { oneMonth: number | null; twoMonths: number | null };
  programVersion: number | null;
  dueCount: number;
  now: Date;
  timezone: string;
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** CA-1 — no module or at least one unvalidated module means the bilan cannot open. */
export function isFormationComplete(modules: readonly { status: string }[]): boolean {
  return modules.length > 0 && modules.every((module) => module.status === 'validated');
}

/** ET-5 — a formation that is not finished answers 409 instead of showing an anticipated bilan. */
export function assertFormationComplete(modules: readonly { status: string }[]): void {
  if (!isFormationComplete(modules)) {
    throw new AppError(
      'CONFLICT',
      'Le bilan final n’est disponible qu’une fois tous les modules validés.',
      { status: 409 },
    );
  }
}

/** CA-3, CL-5 — an unmeasured horizon is never printed as 0 %. */
export function retentionDisplay(rate: number | null): string {
  return rate === null ? 'Pas encore disponible' : `${String(Math.round(rate))} %`;
}

/** EF-2 — effects of one mode; the caller never guesses the five-minute bound. */
export function maintenanceEffects(mode: FinalReviewMode | null): FinalReviewDto['maintenance'] {
  return {
    mode,
    dailyMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
    dueOnly: true,
    reminders: mode === 'light',
  };
}

/** CA-2 — a stopped interview has no due notion left to schedule. */
export function dueCountFor(mode: FinalReviewMode | null, lightDueCount: number): number {
  return mode === 'light' ? Math.max(0, lightDueCount) : 0;
}

/** CA-3 — only a `done` slot counts; a moved slot never doubles its predecessor. */
export function completedMinutesOf(slots: readonly FinalReviewSlotRow[]): number {
  const progress = calculateProgress({
    modules: [],
    slots: slots.map((slot) => ({
      slotId: slot.id,
      kind: slot.kind as never,
      status: slot.status as never,
      startsAt: toIso(slot.starts_at),
      endsAt: toIso(slot.ends_at),
      movedFromId: slot.moved_from_id,
    })),
    notionStates: [],
  });
  return Math.max(0, Math.round(progress.completedMinutes));
}

function resultPercentOf(modules: readonly FinalReviewModuleRow[]): number | null {
  const scores = modules
    .map((module) => module.best_score)
    .filter((score): score is number => score !== null && Number.isFinite(score));
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function natureLabel(nature: string | null): string {
  return (GAP_NATURE_LABELS as Record<string, string | undefined>)[nature ?? ''] ?? 'Lacune';
}

function gapNatureOf(row: FinalReviewNotionRow): FinalReviewDto['gaps'][number]['nature'] | null {
  if (row.gap_nature === null) return null;
  if (
    row.gap_nature === 'forgetting' ||
    row.gap_nature === 'confusion' ||
    row.gap_nature === 'misunderstanding' ||
    row.gap_nature === 'application'
  ) {
    return row.gap_nature;
  }
  return null;
}

/**
 * EF-1 to EF-3 — one deterministic view model from the read rows. Modules and notions keep the
 * programme order; fragile notions are ordered by ascending mastery then label so two loads show
 * the same cards.
 */
export function buildFinalReview(source: FinalReviewSource): FinalReviewDto {
  const { formation, modules, notions, slots } = source;
  assertFormationComplete(modules);

  const thresholds = new Map(modules.map((module) => [module.id, module.threshold]));
  const mastered = notions.filter(
    (notion) =>
      notion.gap_nature === null &&
      notion.mastery >= (thresholds.get(notion.module_id) ?? formation.default_threshold),
  );
  const fragile = notions
    .filter((notion) => notion.gap_nature !== null)
    .sort((left, right) => left.mastery - right.mastery || left.label.localeCompare(right.label));

  const gaps = fragile.map((notion) => {
    const nature = gapNatureOf(notion) ?? 'forgetting';
    return {
      notionId: notion.id,
      label: notion.label,
      nature,
      natureLabel: natureLabel(nature),
      evidence: evidenceOf(nature, notion.gap_evidence),
      mastery: notion.mastery,
      moduleId: notion.module_id,
      modulePosition: notion.module_position,
      moduleTitle: notion.module_title,
      trainingHref: trainingTarget({
        formationId: formation.id,
        moduleId: notion.module_id,
        notionId: notion.id,
        nature,
      }).href,
    };
  });

  const notionMap = new Map<string, FinalReviewNotion[]>();
  for (const notion of notions) {
    const list = notionMap.get(notion.module_id) ?? [];
    list.push({
      notionId: notion.id,
      label: notion.label,
      modulePosition: notion.module_position,
      mastery: notion.mastery,
      gapNature: gapNatureOf(notion),
    });
    notionMap.set(notion.module_id, list);
  }

  const completedAt = toIso(formation.completed_at ?? source.now);
  const summary = completedSummary({
    startDate: formation.start_date,
    completedAt,
    volumeHours: null,
    timeZone: source.timezone,
  });
  const mode = formation.maintenance_mode;

  return {
    formationId: formation.id,
    formationTitle: formation.title,
    monogram: formationMonogram(formation.title, formation.monogram),
    accent: ['indigo', 'green', 'orange', 'violet', 'teal'].includes(formation.accent)
      ? (formation.accent as FinalReviewDto['accent'])
      : 'indigo',
    status: 'completed',
    programVersion: source.programVersion,
    completedAt,
    completedOn: summary.completedOn ?? source.now.toISOString().slice(0, 10),
    weeks: summary.weeks,
    timezone: source.timezone,
    stats: {
      masteredNotions: mastered.length,
      fragileNotions: fragile.length,
      totalNotions: notions.length,
      completedMinutes: completedMinutesOf(slots),
      resultPercent: resultPercentOf(modules),
    },
    retention: source.retention,
    gaps,
    modules: modules.map((module) => ({
      moduleId: module.id,
      position: module.position,
      title: module.title,
      threshold: module.threshold,
      masteredCount: mastered.filter((notion) => notion.module_id === module.id).length,
      notions: notionMap.get(module.id) ?? [],
    })),
    dueCount: dueCountFor(mode, source.dueCount),
    maintenance: maintenanceEffects(mode),
    milestones: source.milestones.map((milestone) => {
      const key =
        milestone.key === 'module_validated' && milestone.ref_id !== null
          ? `module_validated:${milestone.ref_id}`
          : milestone.key;
      return {
        id: milestone.id,
        key,
        kind: milestone.key as FinalReviewDto['milestones'][number]['kind'],
        label: milestoneLabel(key, milestone.module_title),
        formationId: milestone.formation_id,
        formationTitle: milestone.formation_title,
        achievedAt: toIso(milestone.achieved_at),
        achievedOn: userLocalDay(toIso(milestone.achieved_at), source.timezone),
      };
    }),
    mapHref: `/formations/${encodeURIComponent(formation.id)}/carte`,
    updatedAt: toIso(formation.updated_at),
    generatedAt: source.now.toISOString(),
  };
}

/** ET-3 — malformed identifier never reaches SQL. */
export function isUuid(value: string): boolean {
  return UUID.test(value) && value.length === 36;
}

/** Kept for cards that need the exact minute count without reformatting the DTO. */
export function minutesToHoursLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

export { MS_PER_MINUTE };
