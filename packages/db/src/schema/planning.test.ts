// Unit tests of the planning schema (SPEC-108 §12, CA-1, CA-2). They are pure: no database
// connection. Enumerations, columns and constraints follow docs/architecture/data-model.md §7 and
// BR-AGE-04.
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { AUTOMATION_KEYS } from './identity';
import {
  ACTIVE_SLOT_STATUSES,
  AUTOMATION_STATUSES,
  MILESTONE_KEYS,
  MOVABLE_SLOT_STATUSES,
  SLOT_CREATORS,
  SLOT_KINDS,
  SLOT_STATUSES,
  activityMinutesSchema,
  activitySourcesSchema,
  automationActions,
  automationPayloadSchema,
  automationStatus,
  automationSummarySchema,
  dailyActivity,
  milestoneKey,
  milestones,
  planningDaySchema,
  planningInstantSchema,
  scheduleSlots,
  slotCreator,
  slotKind,
  slotStatus,
  slotWindowSchema,
} from './planning';

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

/** Index columns are either a column or an SQL expression (e.g. `created_at desc`). */
function indexColumnNames(index: unknown): string[] {
  if (typeof index !== 'object' || index === null) return [];
  const config = (index as { config?: unknown }).config;
  if (typeof config !== 'object' || config === null) return [];
  const values = (config as { columns?: unknown }).columns;
  if (!Array.isArray(values)) return [];
  return values.map((column) => {
    if (typeof column === 'object' && column !== null && 'name' in column) {
      const name: unknown = (column as { name?: unknown }).name;
      return typeof name === 'string' ? name : '';
    }
    return '';
  });
}

describe('[SPEC-108] planning schema', () => {
  it('CA-1 — expose les six énumérations de data-model §7', () => {
    expect(SLOT_KINDS).toEqual([
      'contributions',
      'course',
      'exercise',
      'validation_quiz',
      'global_quiz',
      'revision',
      'buffer',
      'sprint',
      'mock_exam',
      'warmup',
      'micro_session',
      'weekly_review',
    ]);
    // BR-AGE-04 — exactly the five statuses of a slot.
    expect(SLOT_STATUSES).toEqual(['planned', 'done', 'missed', 'moved', 'cancelled']);
    expect(SLOT_CREATORS).toEqual(['planner', 'automation', 'learner']);
    expect(AUTOMATION_KEYS).toEqual([
      'reprise',
      'micro_seance',
      'echauffement',
      'remediation',
      'jeu_lacune',
      'questions_cartes',
      'plafond_quiz',
      'sprint',
      'bilan',
      'pause',
    ]);
    expect(AUTOMATION_STATUSES).toEqual([
      'pending_consent',
      'applied',
      'declined',
      'undone',
      'expired',
      'consumed',
    ]);
    expect(MILESTONE_KEYS).toEqual(['module_validated', 'notions_100', 'streak_30']);
    // The exported value lists are the same tuples carried by the Postgres enumerations.
    expect(SLOT_KINDS).toEqual(slotKind.enumValues);
    expect(SLOT_STATUSES).toEqual(slotStatus.enumValues);
    expect(SLOT_CREATORS).toEqual(slotCreator.enumValues);
    expect(AUTOMATION_STATUSES).toEqual(automationStatus.enumValues);
    expect(MILESTONE_KEYS).toEqual(milestoneKey.enumValues);
  });

  it('CA-1 — les quatre tables portent les colonnes du modèle de données', () => {
    expect(columns(scheduleSlots)).toEqual(
      [
        'activity_id',
        'created_at',
        'created_by',
        'ends_at',
        'formation_id',
        'group_milestone',
        'id',
        'kind',
        'meta',
        'module_id',
        'moved_from_id',
        'planner_key',
        'starts_at',
        'status',
        'title',
        'updated_at',
        'user_id',
      ].sort(),
    );
    expect(columns(automationActions)).toEqual(
      [
        'automation',
        'created_at',
        'decided_at',
        'formation_id',
        'id',
        'kind',
        'payload',
        'requires_consent',
        'status',
        'summary',
        'undo_payload',
        'user_id',
      ].sort(),
    );
    expect(columns(dailyActivity)).toEqual(
      ['day', 'minutes', 'qualifying', 'sources', 'user_id'].sort(),
    );
    expect(columns(milestones)).toEqual(
      ['achieved_at', 'formation_id', 'id', 'key', 'ref_id', 'user_id'].sort(),
    );
  });

  it('CA-1 / CA-2 — contraintes, clés primaires et index du modèle', () => {
    const slotConfig = getTableConfig(scheduleSlots);
    const slotChecks = slotConfig.checks.map((constraint) => constraint.name);
    for (const name of [
      'schedule_slots_window_check',
      'schedule_slots_moved_from_not_self_check',
      'schedule_slots_title_length_check',
      'schedule_slots_meta_length_check',
    ]) {
      expect(slotChecks, name).toContain(name);
    }
    const slotIndex = slotConfig.indexes.find(
      (index) => index.config.name === 'schedule_slots_user_id_starts_at_idx',
    );
    expect(indexColumnNames(slotIndex)).toEqual(['user_id', 'starts_at']);

    // CL-2 — at most one active successor per moved slot.
    const successor = slotConfig.indexes.find(
      (index) => index.config.name === 'schedule_slots_moved_from_active_unique',
    );
    expect(successor).toBeDefined();
    expect(successor?.config.unique).toBe(true);
    expect(successor?.config.where).toBeDefined();
    expect(indexColumnNames(successor)).toEqual(['moved_from_id']);

    const actionConfig = getTableConfig(automationActions);
    const actionChecks = actionConfig.checks.map((constraint) => constraint.name);
    for (const name of [
      'automation_actions_kind_length_check',
      'automation_actions_summary_check',
      'automation_actions_payload_check',
      'automation_actions_undo_payload_check',
      'automation_actions_pending_consent_check',
      'automation_actions_pending_decided_at_check',
      'automation_actions_declined_decided_at_check',
    ]) {
      expect(actionChecks, name).toContain(name);
    }
    const journalIndex = actionConfig.indexes.find(
      (index) => index.config.name === 'automation_actions_user_id_created_at_idx',
    );
    expect(journalIndex).toBeDefined();
    expect(journalIndex?.config.columns).toHaveLength(2);

    const dailyConfig = getTableConfig(dailyActivity);
    expect(dailyConfig.primaryKeys).toHaveLength(1);
    expect(dailyConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'day',
    ]);

    const milestoneConfig = getTableConfig(milestones);
    // CL-6 — nulls not distinct so `streak_30` (ref_id null) is unique too.
    expect(milestoneConfig.uniqueConstraints).toHaveLength(1);
    const unique = milestoneConfig.uniqueConstraints[0];
    expect(unique?.nullsNotDistinct).toBe(true);
    expect(unique?.columns.map((column) => column.name)).toEqual(['user_id', 'key', 'ref_id']);
    const milestoneIndex = milestoneConfig.indexes.find(
      (index) => index.config.name === 'milestones_user_id_achieved_at_idx',
    );
    expect(milestoneIndex).toBeDefined();
    expect(indexColumnNames(milestoneIndex)).toEqual(['user_id', 'achieved_at']);
  });

  it('CA-2 — seuls planned et missed sont déplaçables ; trois statuts restent actifs', () => {
    expect(MOVABLE_SLOT_STATUSES).toEqual(['planned', 'missed']);
    expect(ACTIVE_SLOT_STATUSES).toEqual(['planned', 'done', 'missed']);
    for (const status of ['done', 'moved', 'cancelled'] as const) {
      expect(MOVABLE_SLOT_STATUSES).not.toContain(status);
    }
  });

  it('CL-1 — une fenêtre valide exige une fin strictement postérieure au début', () => {
    const window = {
      startsAt: '2026-11-11T17:00:00.000Z',
      endsAt: '2026-11-11T18:00:00.000Z',
    };
    expect(slotWindowSchema.safeParse(window).success).toBe(true);
    expect(
      slotWindowSchema.safeParse({ ...window, endsAt: window.startsAt }).success,
      'fin égale au début',
    ).toBe(false);
    expect(
      slotWindowSchema.safeParse({ ...window, endsAt: '2026-11-11T16:59:59.000Z' }).success,
    ).toBe(false);
    expect(slotWindowSchema.safeParse({ ...window, startsAt: '2026-11-11' }).success).toBe(false);
    expect(planningInstantSchema.safeParse('2026-11-11T13:20:00+01:00').success).toBe(false);
    expect(planningInstantSchema.safeParse('2026-11-11T12:20:00.000Z').success).toBe(true);
  });

  it('EF-4 / CL-8 — le jour est une date civile sans conversion implicite', () => {
    expect(planningDaySchema.safeParse('2026-11-11').success).toBe(true);
    expect(planningDaySchema.safeParse('2026-02-29').success).toBe(false);
    expect(planningDaySchema.safeParse('2026-02-30').success).toBe(false);
    expect(planningDaySchema.safeParse('11/11/2026').success).toBe(false);
    expect(planningDaySchema.safeParse('2026-11-11T00:00:00.000Z').success).toBe(false);
  });

  it('EF-3 / ET-5 — résumé sur une ligne et charges JSON objets', () => {
    expect(automationSummarySchema.safeParse('Séance du soir déplacée à 19 h.').success).toBe(true);
    expect(automationSummarySchema.safeParse('').success).toBe(false);
    expect(automationSummarySchema.safeParse('deux\nlignes').success).toBe(false);
    expect(automationSummarySchema.safeParse('x'.repeat(301)).success).toBe(false);
    expect(automationPayloadSchema.safeParse({ slotId: 'a' }).success).toBe(true);
    expect(automationPayloadSchema.safeParse([]).success).toBe(false);
    expect(automationPayloadSchema.safeParse('texte').success).toBe(false);

    expect(activitySourcesSchema.safeParse(['attempt:1', 'slot:2']).success).toBe(true);
    expect(activitySourcesSchema.safeParse(['']).success).toBe(false);
    expect(activitySourcesSchema.safeParse(Array.from({ length: 51 }, () => 'x')).success).toBe(
      false,
    );
    expect(activityMinutesSchema.safeParse(0).success).toBe(true);
    expect(activityMinutesSchema.safeParse(-1).success).toBe(false);
    expect(activityMinutesSchema.safeParse(1.5).success).toBe(false);
  });
});
