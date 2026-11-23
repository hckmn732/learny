// Vitest [SPEC-3305] — état de la session de révision (EF-1, EF-2, EF-4, ET-2).
import { describe, expect, it } from 'vitest';

import type { GlobalQuizSessionDto, ReviewItemDto } from '@learny/contracts';

import {
  canAnswer,
  indexOfPosition,
  isEnded,
  isLastItem,
  itemAt,
  nextPositionOf,
  progressOf,
  railOf,
  startPositionOf,
  streakCells,
  summaryOf,
} from './session-state';

function item(position: number, state: ReviewItemDto['state'] = 'todo'): ReviewItemDto {
  return {
    position,
    brickId: `brick-${String(position)}`,
    brickVersionId: `version-${String(position)}`,
    type: position === 0 ? 'recall_card' : 'matching',
    name: position === 0 ? 'Carte de rappel' : 'Association',
    tech: 'active recall',
    displayLabel: `Notion ${String(position + 1)}`,
    scopeLabel: 'Module 2',
    reason: null,
    notionIds: ['00000000-0000-4000-8000-000000000000'],
    payload: {},
    intervals: null,
    state,
    result: null,
  };
}

const items = [item(0), item(1), item(2)];

function session(overrides: Partial<GlobalQuizSessionDto> = {}): GlobalQuizSessionDto {
  return {
    sessionId: '00000000-0000-4000-8000-000000000001',
    attemptId: '00000000-0000-4000-8000-000000000002',
    formationId: '00000000-0000-4000-8000-000000000003',
    forDate: '2026-11-11',
    mode: 'full',
    status: 'in_progress',
    header: {
      notionCount: 14,
      modulesLabel: 'Modules 1 et 2 mêlés',
      estimatedMinutes: 10,
      subtitle: 'SAP S/4HANA Finance',
    },
    modeOptions: { fullMinutes: 10, microMinutes: 5 },
    note: '',
    rationale: [],
    tuned: [],
    smoothing: null,
    items,
    currentPosition: 0,
    summary: null,
    ...overrides,
  };
}

describe('[SPEC-3305] session de révision (EF-1, EF-2, EF-4)', () => {
  it('marque le rail : fait, en cours, à venir (BR-MEM-08)', () => {
    const rail = railOf([item(0, 'answered'), item(1), item(2)], 1);
    expect(rail.map((entry) => entry.status)).toEqual(['done', 'current', 'upcoming']);
    expect(rail.map((entry) => entry.position)).toEqual([0, 1, 2]);
    expect(rail[1]?.label).toBe('Notion 2');
  });

  it('calcule la progression « Notion 1 sur 14 » et la durée (EF-1)', () => {
    const progress = progressOf(session(), items, 0);
    expect(progress).toEqual({ current: 1, total: 14, minutes: 10, ratio: 1 / 14 });
    expect(progressOf(session(), items, 2).current).toBe(3);
  });

  it('retrouve le jeu courant, le suivant et la fin de session', () => {
    expect(itemAt(items, 1)?.position).toBe(1);
    expect(indexOfPosition(items, 9)).toBe(0);
    expect(itemAt(items, 9)?.position).toBe(0);
    expect(nextPositionOf(items, 1)).toBe(2);
    expect(nextPositionOf(items, 2)).toBeNull();
    expect(isLastItem(items, 2)).toBe(true);
    expect(isLastItem(items, 0)).toBe(false);
    expect(startPositionOf([item(0, 'answered'), item(1), item(2)])).toBe(1);
    expect(canAnswer(item(1))).toBe(true);
    expect(canAnswer(item(1, 'answered'))).toBe(false);
  });

  it('reconnaît l’écran de fin au résumé du serveur (EF-4)', () => {
    const summary = {
      reviewedCount: 12,
      minutes: 9,
      okCount: 9,
      soonCount: 3,
      streakDays: 13,
      nextSessionAt: '2026-11-12T17:00:00.000Z',
    };
    expect(isEnded(session())).toBe(false);
    expect(isEnded(session({ status: 'completed' }))).toBe(true);
    expect(summaryOf(session({ summary }))).toEqual(summary);
    expect(isEnded(session({ summary }))).toBe(true);
    expect(summaryOf(session({ summary: { broken: true } }))).toBeNull();
  });

  it('allume les quatorze cellules de la série (BR-GAM-02)', () => {
    expect(streakCells(12)).toHaveLength(14);
    expect(streakCells(12).slice(12)).toEqual([true, true]);
    expect(streakCells(12).slice(0, 2)).toEqual([false, false]);
    expect(streakCells(0).some(Boolean)).toBe(false);
    expect(streakCells(40).every(Boolean)).toBe(true);
  });
});
