import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  assertFormationComplete,
  buildFinalReview,
  completedMinutesOf,
  dueCountFor,
  isFormationComplete,
  maintenanceEffects,
  retentionDisplay,
  type FinalReviewSource,
} from './final-review';

const FORMATION = '11111111-1111-4111-8111-111111111111';
const MODULE_1 = '22222222-2222-4222-8222-222222222222';
const MODULE_2 = '33333333-3333-4333-8333-333333333333';
const NOTION_1 = '44444444-4444-4444-8444-444444444444';
const NOTION_2 = '55555555-5555-4555-8555-555555555555';
const NOTION_3 = '66666666-6666-4666-8666-666666666666';
const NOTION_4 = '77777777-7777-4777-8777-777777777777';
const SLOT_DONE = '88888888-8888-4888-8888-888888888888';
const SLOT_PLANNED = '99999999-9999-4999-8999-999999999999';
const SLOT_CANCELLED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-11-11T12:20:00Z');

function moduleRow(partial: Partial<FinalReviewSource['modules'][number]> = {}) {
  return {
    id: MODULE_1,
    position: 1,
    title: 'Comptabilité générale',
    threshold: 80,
    status: 'validated',
    validated_at: '2026-10-01T10:00:00.000Z',
    best_score: 90,
    ...partial,
  };
}

function notionRow(partial: Partial<FinalReviewSource['notions'][number]> = {}) {
  return {
    id: NOTION_1,
    label: 'Clé de comptabilisation',
    module_id: MODULE_1,
    module_position: 1,
    module_title: 'Comptabilité générale',
    mastery: 90,
    gap_nature: null as string | null,
    gap_evidence: null as string | null,
    confused_with_label: null as string | null,
    ...partial,
  };
}

function source(overrides: Partial<FinalReviewSource> = {}): FinalReviewSource {
  return {
    formation: {
      id: FORMATION,
      owner_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'SAP S/4HANA Finance',
      monogram: 'SAP',
      accent: 'indigo',
      status: 'completed',
      default_threshold: 80,
      start_date: '2026-10-01',
      completed_at: '2026-11-11T10:00:00.000Z',
      maintenance_mode: null,
      updated_at: '2026-11-11T10:00:00.000Z',
    },
    modules: [
      moduleRow(),
      moduleRow({
        id: MODULE_2,
        position: 2,
        title: 'Immobilisations',
        best_score: 82,
        validated_at: '2026-10-15T10:00:00.000Z',
      }),
    ],
    notions: [
      notionRow(),
      notionRow({ id: NOTION_2, label: 'Partie double', mastery: 85 }),
      notionRow({
        id: NOTION_3,
        label: 'Amortissement',
        module_id: MODULE_2,
        module_position: 2,
        module_title: 'Immobilisations',
        mastery: 35,
        gap_nature: 'confusion',
        gap_evidence: 'Confondue avec la sortie d’immobilisation.',
        confused_with_label: 'Sortie d’immobilisation',
      }),
      notionRow({
        id: NOTION_4,
        label: 'Sortie d’immobilisation',
        module_id: MODULE_2,
        module_position: 2,
        module_title: 'Immobilisations',
        mastery: 80,
      }),
    ],
    slots: [
      {
        id: SLOT_DONE,
        kind: 'course',
        status: 'done',
        starts_at: '2026-11-10T09:00:00.000Z',
        ends_at: '2026-11-10T10:00:00.000Z',
        moved_from_id: null,
      },
      {
        id: SLOT_PLANNED,
        kind: 'global_quiz',
        status: 'planned',
        starts_at: '2026-11-12T09:00:00.000Z',
        ends_at: '2026-11-12T11:00:00.000Z',
        moved_from_id: null,
      },
      {
        id: SLOT_CANCELLED,
        kind: 'revision',
        status: 'cancelled',
        starts_at: '2026-11-09T09:00:00.000Z',
        ends_at: '2026-11-09T09:30:00.000Z',
        moved_from_id: null,
      },
    ],
    retention: { oneMonth: null, twoMonths: null },
    programVersion: 2,
    dueCount: 3,
    now: NOW,
    timezone: 'Europe/Paris',
    ...overrides,
  };
}

describe('[SPEC-617] bilan final', () => {
  it('CA-1 : ouvre le bilan seulement quand les 7 modules sont validés', () => {
    const sixValidated = [
      ...Array.from({ length: 6 }, (_value, index) =>
        moduleRow({ id: `0000000${String(index)}-0000-4000-8000-000000000000` }),
      ),
      moduleRow({ id: MODULE_2, status: 'open' }),
    ];
    expect(isFormationComplete(sixValidated)).toBe(false);
    expect(() => {
      assertFormationComplete(sixValidated);
    }).toThrow(AppError);
    try {
      assertFormationComplete(sixValidated);
    } catch (error) {
      expect((error as AppError).code).toBe('CONFLICT');
    }
    expect(isFormationComplete([])).toBe(false);
    expect(isFormationComplete(sixValidated.slice(0, 6))).toBe(true);
  });

  it('CA-1, CA-3 : agrège acquis, notions fragiles, heures et rétention mesurable', () => {
    const review = buildFinalReview(source());
    expect(review.status).toBe('completed');
    expect(review.programVersion).toBe(2);
    expect(review.completedOn).toBe('2026-11-11');
    expect(review.weeks).toBe(6);
    expect(review.stats).toMatchObject({
      masteredNotions: 3,
      fragileNotions: 1,
      totalNotions: 4,
      completedMinutes: 60,
      resultPercent: 86,
    });
    expect(review.gaps.map((gap) => gap.label)).toEqual(['Amortissement']);
    expect(review.gaps[0]?.natureLabel).toBe('Confusion');
    expect(review.gaps[0]?.trainingHref).toContain('/quiz-global?cible=');
    expect(review.modules).toHaveLength(2);
    expect(review.retention).toEqual({ oneMonth: null, twoMonths: null });
    expect(retentionDisplay(review.retention.oneMonth)).toBe('Pas encore disponible');
    expect(review.dueCount).toBe(0);
  });

  it('CA-3 : la rétention mesurée est arrondie, jamais affichée à 0 % par défaut', () => {
    expect(retentionDisplay(null)).toBe('Pas encore disponible');
    expect(retentionDisplay(84.4)).toBe('84 %');
    expect(retentionDisplay(0)).toBe('0 %');
  });

  it('CA-2 : light plafonne à cinq minutes et stopped ne laisse aucune notion due', () => {
    expect(maintenanceEffects('light')).toEqual({
      mode: 'light',
      dailyMinutes: 5,
      dueOnly: true,
      reminders: true,
    });
    expect(maintenanceEffects('stopped')).toMatchObject({ mode: 'stopped', reminders: false });
    expect(dueCountFor('light', 3)).toBe(3);
    expect(dueCountFor('stopped', 3)).toBe(0);
    expect(dueCountFor(null, 3)).toBe(0);
  });

  it('CA-3 : seuls les créneaux réalisés comptent dans les heures', () => {
    expect(completedMinutesOf(source().slots)).toBe(60);
    expect(completedMinutesOf([])).toBe(0);
    const moved = source().slots.map((slot) =>
      slot.id === SLOT_DONE ? { ...slot, status: 'moved' } : slot,
    );
    expect(completedMinutesOf(moved)).toBe(0);
  });
});
