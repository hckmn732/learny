// Unit tests of the memory/gap schema and FSRS persistence (SPEC-107 §12, CA-1, CL-1, CL-2).
// They are pure: no database connection. Column names and enumeration values follow
// docs/architecture/data-model.md §6; the serialised card is checked against ts-fsrs itself.
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createEmptyCard, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  FSRS_GRADES_VALUES,
  GAP_EVENT_KINDS_VALUES,
  GAP_NATURES_VALUES,
  REVIEW_SOURCES_VALUES,
  gapEvents,
  notionStates,
  reviewLogs,
} from './memory';
import {
  FSRS_GRADES,
  FSRS_STATES,
  GAP_EVENT_KINDS,
  GAP_NATURES,
  REVIEW_SOURCES,
  fsrsCardSchema,
  gapEvidenceSchema,
  masterySchema,
  parseFsrsCard,
  successCountSchema,
  timeMsSchema,
  toFsrsCardJson,
  toUtcIso,
} from './memory-json';

const FIXED = new Date('2026-11-11T12:20:00Z');
const LATER = new Date('2026-11-18T08:00:00Z');

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

/** Index columns are either a column or an SQL expression; only columns have a name. */
function indexColumnNames(index: unknown): string[] {
  if (typeof index !== 'object' || index === null) return [];
  const config = (index as { config?: unknown }).config;
  if (typeof config !== 'object' || config === null) return [];
  const columns = (config as { columns?: unknown }).columns;
  if (!Array.isArray(columns)) return [];
  return columns.map((column) => {
    if (typeof column === 'object' && column !== null && 'name' in column) {
      const name: unknown = (column as { name?: unknown }).name;
      return typeof name === 'string' ? name : '';
    }
    return '';
  });
}

function emptyCard() {
  const card = createEmptyCard(FIXED);
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ET-2 names elapsed_days; ts-fsrs 6 removes it (ADR-0242).
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    last_review: card.last_review?.toISOString() ?? null,
    learning_steps: card.learning_steps,
  };
}

describe('[SPEC-107] memory schema', () => {
  it('CA-1 — expose les quatre énumérations de data-model §6', () => {
    expect(GAP_NATURES_VALUES).toEqual([
      'forgetting',
      'confusion',
      'misunderstanding',
      'application',
    ]);
    expect(FSRS_GRADES_VALUES).toEqual(['again', 'hard', 'good', 'easy']);
    expect(REVIEW_SOURCES_VALUES).toEqual([
      'validation',
      'global_quiz',
      'warmup',
      'exercise',
      'exam',
      'self_test',
      'micro_session',
      'sprint',
      'offline',
    ]);
    expect(GAP_EVENT_KINDS_VALUES).toEqual(['detected', 'nature_changed', 'cleared']);
    // The exported value lists are the same tuples used by the Zod schemas.
    expect(GAP_NATURES).toEqual(GAP_NATURES_VALUES);
    expect(FSRS_GRADES).toEqual(FSRS_GRADES_VALUES);
    expect(REVIEW_SOURCES).toEqual(REVIEW_SOURCES_VALUES);
    expect(GAP_EVENT_KINDS).toEqual(GAP_EVENT_KINDS_VALUES);
  });

  it('CA-1 — les trois tables portent les colonnes du modèle de données', () => {
    expect(columns(notionStates)).toEqual(
      [
        'created_at',
        'due_at',
        'first_seen_at',
        'fsrs',
        'gap_cleared_at',
        'gap_confused_with',
        'gap_detected_at',
        'gap_evidence',
        'gap_nature',
        'in_review',
        'last_seen_at',
        'mastery',
        'notion_id',
        'revision',
        'success_count',
        'suspended',
        'updated_at',
        'user_id',
      ].sort(),
    );
    expect(columns(reviewLogs)).toEqual(
      [
        'answer_id',
        'correct',
        'fsrs_after',
        'fsrs_before',
        'grade',
        'id',
        'notion_id',
        'reviewed_at',
        'source',
        'time_ms',
        'user_id',
      ].sort(),
    );
    expect(columns(gapEvents)).toEqual(
      ['created_at', 'evidence', 'id', 'kind', 'nature', 'notion_id', 'user_id'].sort(),
    );
  });

  it('CA-1 — pk(user_id, notion_id), index partiel des notions dues et index chronologique', () => {
    const stateConfig = getTableConfig(notionStates);
    expect(stateConfig.primaryKeys).toHaveLength(1);
    expect(stateConfig.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'notion_id',
    ]);
    const dueIndex = stateConfig.indexes.find(
      (index) => index.config.name === 'notion_states_due_idx',
    );
    expect(indexColumnNames(dueIndex)).toEqual(['user_id', 'due_at']);
    expect(dueIndex?.config.where).toBeDefined();

    const logConfig = getTableConfig(reviewLogs);
    const historyIndex = logConfig.indexes.find(
      (index) => index.config.name === 'review_logs_user_id_notion_id_reviewed_at_idx',
    );
    expect(indexColumnNames(historyIndex)).toEqual(['user_id', 'notion_id', 'reviewed_at']);
  });

  it('ET-2 / CL-1 — une carte FSRS complète est acceptée, une carte invalide est refusée', () => {
    const card = emptyCard();
    expect(fsrsCardSchema.safeParse(card).success).toBe(true);
    expect(parseFsrsCard(card)).toMatchObject({
      due: '2026-11-11T12:20:00.000Z',
      state: 0,
      last_review: null,
      reps: 0,
      lapses: 0,
    });
    expect(FSRS_STATES).toEqual([0, 1, 2, 3]);
    expect(card.state).toBe(State.New);

    // Missing field, wrong JSON type, unknown state, invalid instant.
    const withoutDue: Record<string, unknown> = { ...card };
    delete withoutDue.due;
    expect(fsrsCardSchema.safeParse(withoutDue).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, stability: '1' }).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, state: 4 }).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, due: '2026-11-11' }).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, last_review: 'hier' }).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, reps: -1 }).success).toBe(false);
    expect(fsrsCardSchema.safeParse({ ...card, elapsed_days: 1.5 }).success).toBe(false);
  });

  it('ET-2 / CL-1 — NaN et Infinity sont refusés avant écriture', () => {
    const card = emptyCard();
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(fsrsCardSchema.safeParse({ ...card, stability: value }).success, String(value)).toBe(
        false,
      );
      expect(fsrsCardSchema.safeParse({ ...card, difficulty: value }).success, String(value)).toBe(
        false,
      );
      expect(() => toFsrsCardJson({ ...card, stability: value })).toThrow();
    }
  });

  it('ET-2 — l’adaptateur convertit les dates en ISO UTC et accepte une carte ts-fsrs réelle', () => {
    const parsed = toFsrsCardJson(emptyCard());
    expect(parsed.due).toBe('2026-11-11T12:20:00.000Z');
    expect(parsed.last_review).toBeNull();

    const reviewed = toFsrsCardJson({
      ...emptyCard(),
      due: LATER,
      last_review: FIXED,
      reps: 1,
      state: 2,
    });
    expect(reviewed).toMatchObject({
      due: '2026-11-18T08:00:00.000Z',
      last_review: '2026-11-11T12:20:00.000Z',
      reps: 1,
      state: 2,
    });

    // An offset date is normalised to the canonical UTC form.
    expect(toUtcIso('2026-11-11T13:20:00+01:00')).toBe('2026-11-11T12:20:00.000Z');
    expect(toUtcIso('pas une date')).toBeNull();
    expect(() => toFsrsCardJson({ ...emptyCard(), due: 'pas une date' })).toThrow(/due/);
    expect(() => toFsrsCardJson({ ...emptyCard(), last_review: 'pas une date' })).toThrow(
      /last_review/,
    );
  });

  it('CL-2 — la maîtrise reste dans [0 ; 100] avec deux décimales', () => {
    for (const value of [0, 0.5, 42.25, 80, 100]) {
      expect(masterySchema.safeParse(value).success, String(value)).toBe(true);
    }
    for (const value of [-0.01, 100.01, 42.123, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(masterySchema.safeParse(value).success, String(value)).toBe(false);
    }
    expect(successCountSchema.safeParse(0).success).toBe(true);
    expect(successCountSchema.safeParse(3).success).toBe(true);
    expect(successCountSchema.safeParse(-1).success).toBe(false);
    expect(timeMsSchema.safeParse(0).success).toBe(true);
    expect(timeMsSchema.safeParse(-1).success).toBe(false);
  });

  it('EF-2 / EF-4 — la preuve de lacune est un objet JSON, jamais un tableau', () => {
    expect(gapEvidenceSchema.safeParse({}).success).toBe(true);
    expect(
      gapEvidenceSchema.safeParse({ answerId: 'a', expected: '401', chosen: '512' }).success,
    ).toBe(true);
    expect(gapEvidenceSchema.safeParse([]).success).toBe(false);
    expect(gapEvidenceSchema.safeParse('texte').success).toBe(false);
  });
});
