// Unit tests of the formation schema (SPEC-103 §12: JSON schemas, enumerations, defaults).
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  CADRAGE_KEYS,
  CONTRIB_STATUSES,
  FORMATION_OBJECTIVES,
  FORMATION_STATUSES,
  IMPORT_KINDS,
  LINK_KINDS,
  MAINTENANCE_MODES,
  MESSAGE_ROLES,
  MODULE_STATUSES,
  formations,
  modules,
  notions,
} from './formations';
import {
  cadrageProfileSchema,
  cadrageSuggestionsSchema,
  examFormatSchema,
  studyOverrideSchema,
} from './formations.json-schemas';

interface TableConfig {
  name: string;
  columns: PgColumn[];
  checks: { name: string }[];
  indexes: { config: { name: string; unique?: boolean } }[];
}

function config(table: unknown): TableConfig {
  return getTableConfig(table as never) as unknown as TableConfig;
}

function column(table: unknown, name: string): PgColumn {
  const found = config(table).columns.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`colonne absente : ${name}`);
  return found;
}

const UUID = '2f1c7f8e-3a44-4f0a-9c2e-52f1a0f5b7d9';

describe('[SPEC-103] schémas JSON du programme', () => {
  it('declares the nine domain enumerations (ET-1)', () => {
    expect(FORMATION_OBJECTIVES).toEqual(['operational', 'exam', 'dialogue', 'project']);
    expect(FORMATION_STATUSES).toEqual([
      'cadrage',
      'programme_proposed',
      'active',
      'paused',
      'completed',
      'archived',
    ]);
    expect(MAINTENANCE_MODES).toEqual(['light', 'stopped']);
    expect(MESSAGE_ROLES).toEqual(['tutor', 'learner']);
    expect(CADRAGE_KEYS).toEqual([
      'scope',
      'starting_point',
      'target_level',
      'volume',
      'dates',
      'other',
    ]);
    expect(IMPORT_KINDS).toEqual(['file', 'text']);
    expect(MODULE_STATUSES).toEqual(['locked', 'open', 'validated']);
    expect(CONTRIB_STATUSES).toEqual(['in_progress', 'done']);
    expect(LINK_KINDS).toEqual(['prerequisite', 'confusion', 'tutor']);
  });

  it('validates a cadrage profile (BR-FOR-02)', () => {
    expect(cadrageProfileSchema.safeParse({}).success).toBe(true);
    expect(
      cadrageProfileSchema.safeParse({
        scope: { value: 'Finance d’entreprise', state: 'done' },
        starting_point: { value: null, state: 'waiting' },
        target_level: { value: 'DSCG', state: 'todo' },
        volume: { value: '60 h', state: 'todo' },
        dates: { value: null, state: 'todo' },
      }).success,
    ).toBe(true);
    expect(cadrageProfileSchema.safeParse({ scope: { value: null, state: 'later' } }).success).toBe(
      false,
    );
    expect(cadrageProfileSchema.safeParse({ scope: { value: 12, state: 'todo' } }).success).toBe(
      false,
    );
    expect(cadrageProfileSchema.safeParse({ scope: { state: 'todo' } }).success).toBe(false);
    expect(
      cadrageProfileSchema.safeParse({ unknown: { value: null, state: 'todo' } }).success,
    ).toBe(false);
  });

  it('validates a study override (BR-ACC-08, bounds included)', () => {
    expect(
      studyOverrideSchema.safeParse({
        hoursPerDay: 1,
        studyDays: [1],
        preferredSlots: ['matin'],
      }).success,
    ).toBe(true);
    expect(
      studyOverrideSchema.safeParse({
        hoursPerDay: 6,
        studyDays: [1, 2, 3, 4, 5, 6, 7],
        preferredSlots: ['matin', 'apres_midi', 'soir'],
      }).success,
    ).toBe(true);
    for (const hoursPerDay of [0, 7, 2.5]) {
      expect(
        studyOverrideSchema.safeParse({
          hoursPerDay,
          studyDays: [1],
          preferredSlots: ['soir'],
        }).success,
        `heures ${String(hoursPerDay)}`,
      ).toBe(false);
    }
    for (const studyDays of [[], [0], [8]]) {
      expect(
        studyOverrideSchema.safeParse({ hoursPerDay: 2, studyDays, preferredSlots: ['soir'] })
          .success,
        `jours ${JSON.stringify(studyDays)}`,
      ).toBe(false);
    }
    expect(
      studyOverrideSchema.safeParse({ hoursPerDay: 2, studyDays: [1], preferredSlots: [] }).success,
    ).toBe(false);
    expect(
      studyOverrideSchema.safeParse({
        hoursPerDay: 2,
        studyDays: [1],
        preferredSlots: ['nuit'],
      }).success,
    ).toBe(false);
  });

  it('validates an exam format (ET-5, bounds included)', () => {
    expect(
      examFormatSchema.safeParse({
        questions: 1,
        durationMin: 1,
        threshold: 1,
        confirmed: false,
      }).success,
    ).toBe(true);
    expect(
      examFormatSchema.safeParse({
        questions: 200,
        durationMin: 600,
        threshold: 100,
        sourceResourceId: UUID,
        confirmed: true,
      }).success,
    ).toBe(true);
    for (const questions of [0, 201, 3.5]) {
      expect(
        examFormatSchema.safeParse({ questions, durationMin: 60, threshold: 80, confirmed: true })
          .success,
        `questions ${String(questions)}`,
      ).toBe(false);
    }
    for (const durationMin of [0, 601]) {
      expect(
        examFormatSchema.safeParse({ questions: 10, durationMin, threshold: 80, confirmed: true })
          .success,
        `durée ${String(durationMin)}`,
      ).toBe(false);
    }
    for (const threshold of [0, 101]) {
      expect(
        examFormatSchema.safeParse({ questions: 10, durationMin: 60, threshold, confirmed: true })
          .success,
        `seuil ${String(threshold)}`,
      ).toBe(false);
    }
    expect(
      examFormatSchema.safeParse({
        questions: 10,
        durationMin: 60,
        threshold: 80,
        sourceResourceId: 'pas-un-uuid',
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      examFormatSchema.safeParse({ questions: 10, durationMin: 60, threshold: 80 }).success,
    ).toBe(false);
  });

  it('validates cadrage suggestions, at most eight (ET-5)', () => {
    expect(cadrageSuggestionsSchema.safeParse([]).success).toBe(true);
    expect(cadrageSuggestionsSchema.safeParse([{ label: 'Examen', value: 'exam' }]).success).toBe(
      true,
    );
    expect(
      cadrageSuggestionsSchema.safeParse([{ label: 'Examen', value: 'exam', multi: true }]).success,
    ).toBe(true);
    expect(
      cadrageSuggestionsSchema.safeParse(
        Array.from({ length: 8 }, (_, index) => ({
          label: `Choix ${String(index)}`,
          value: `choix-${String(index)}`,
        })),
      ).success,
    ).toBe(true);
    expect(
      cadrageSuggestionsSchema.safeParse(
        Array.from({ length: 9 }, (_, index) => ({
          label: `Choix ${String(index)}`,
          value: `choix-${String(index)}`,
        })),
      ).success,
    ).toBe(false);
    expect(
      cadrageSuggestionsSchema.safeParse([{ label: 'a'.repeat(81), value: 'v' }]).success,
    ).toBe(false);
    expect(
      cadrageSuggestionsSchema.safeParse([{ label: 'a', value: 'v'.repeat(201) }]).success,
    ).toBe(false);
    expect(
      cadrageSuggestionsSchema.safeParse([{ label: 'a', value: 'v', unknown: true }]).success,
    ).toBe(false);
  });

  it('declares the EF-1 and EF-2 defaults', () => {
    expect(column(formations, 'status').default).toBe('cadrage');
    expect(column(formations, 'default_threshold').default).toBe(80);
    expect(column(formations, 'course_language').default).toBe('fr');
    expect(column(modules, 'threshold').default).toBe(80);
    expect(column(modules, 'status').default).toBe('locked');
    expect(column(notions, 'position').default).toBe(1);
    expect(column(notions, 'created_by').default).toBe('tutor');
    expect(column(formations, 'objectives').notNull).toBe(true);
    expect(column(formations, 'cadrage_profile').notNull).toBe(true);
  });

  it('declares the ten tables with their guarantee constraints (ET-2)', () => {
    expect(config(formations).name).toBe('formations');
    expect(config(modules).name).toBe('modules');
    expect(config(notions).name).toBe('notions');

    const formationChecks = config(formations).checks.map((check) => check.name);
    expect(formationChecks).toEqual(
      expect.arrayContaining([
        'formations_dates_order',
        'formations_objectives_required',
        'formations_objectives_unique',
        'formations_maintenance_only_completed',
      ]),
    );
    expect(config(modules).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(['modules_threshold_check', 'modules_position_check']),
    );
    expect(config(notions).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'notions_label_length_check',
        'notions_short_definition_length_check',
      ]),
    );
  });
});
