import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { EngineError, assertValid } from './errors';
import {
  arbAnswer,
  arbAvailability,
  arbCard,
  arbNotionState,
  arbReviewEvent,
  buildAnswer,
  buildNotionState,
} from './fixtures/builders';
import { SAP_AVAILABILITY } from './fixtures/sap-reference';
import {
  AnswerRecordSchema,
  AvailabilitySchema,
  DateRangeSchema,
  IdSchema,
  NotionLinkRefSchema,
  NotionRefSchema,
  NotionStateSchema,
  ReviewEventSchema,
  SerializedFsrsCardSchema,
  assertAvailability,
} from './types';

const FAST_CHECK = { seed: 20261111, numRuns: 200 } as const;

function roundTrip<T>(schema: z.ZodType<T>, arbitrary: fc.Arbitrary<T>): void {
  fc.assert(
    fc.property(arbitrary, (value) => {
      const json = JSON.parse(JSON.stringify(value)) as unknown;
      expect(schema.parse(json)).toEqual(value);
    }),
    FAST_CHECK,
  );
}

function availabilityError(value: unknown): EngineError {
  try {
    assertAvailability(value);
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe('INVALID_AVAILABILITY');
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

describe('[SPEC-401] types et schémas', () => {
  it('aller-retour JSON de AnswerRecord sur 200 objets générés (CA-2)', () => {
    roundTrip(AnswerRecordSchema, arbAnswer());
  });

  it('aller-retour JSON de NotionState sur 200 objets générés (CA-2)', () => {
    roundTrip(NotionStateSchema, arbNotionState());
  });

  it('aller-retour JSON de SerializedFsrsCard sur 200 objets générés (CA-2)', () => {
    roundTrip(SerializedFsrsCardSchema, arbCard());
  });

  it('aller-retour JSON de Availability sur 200 objets générés (CA-2)', () => {
    roundTrip(AvailabilitySchema, arbAvailability());
  });

  it('aller-retour JSON de ReviewEvent sur 200 objets générés (CA-2)', () => {
    roundTrip(ReviewEventSchema, arbReviewEvent());
  });

  it('accepte les fabriques et le jeu de référence', () => {
    expect(AnswerRecordSchema.parse(buildAnswer())).toEqual(buildAnswer());
    expect(NotionStateSchema.parse(buildNotionState())).toEqual(buildNotionState());
    expect(AvailabilitySchema.parse(SAP_AVAILABILITY)).toEqual(SAP_AVAILABILITY);
    expect(
      NotionRefSchema.parse({
        notionId: 'n-s4',
        moduleId: 'sap-m1',
        chapterId: 'sap-m1-c1',
        modulePosition: 1,
        position: 0,
        label: 'SAP S/4HANA',
      }),
    ).toBeDefined();
  });

  it('refuse une disponibilité invalide avec INVALID_AVAILABILITY (CL-6)', () => {
    expect(
      availabilityError({ hoursPerDay: 5, studyDays: [], preferredSlots: ['matin'] }).details?.path,
    ).toBe('studyDays');
    expect(
      availabilityError({ hoursPerDay: 7, studyDays: [1, 2], preferredSlots: ['matin'] }).details
        ?.path,
    ).toBe('hoursPerDay');
    expect(
      availabilityError({
        hoursPerDay: 5,
        studyDays: [1, 2],
        preferredSlots: ['matin', 'matin'],
      }).details?.path,
    ).toBe('preferredSlots');
    expect(
      availabilityError({
        hoursPerDay: 5,
        studyDays: [2, 1],
        preferredSlots: ['matin'],
      }).details?.path,
    ).toBe('studyDays');
    expect(
      availabilityError({
        hoursPerDay: 5,
        studyDays: [1, 2],
        preferredSlots: ['soir', 'matin'],
      }).details?.path,
    ).toBe('preferredSlots');
    expect(
      availabilityError({ hoursPerDay: 1.5, studyDays: [1], preferredSlots: ['matin'] }).details
        ?.path,
    ).toBe('hoursPerDay');
    expect(() => assertAvailability(SAP_AVAILABILITY)).not.toThrow();
  });

  it('valide les objets imbriqués et les erreurs de contrat', () => {
    expect(assertValid(IdSchema, 'n-s4')).toBe('n-s4');
    try {
      assertValid(IdSchema, '');
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe('INVALID_INPUT');
    }
    expect(
      DateRangeSchema.safeParse({ startsOn: '2026-11-22', endsOn: '2026-11-11' }).success,
    ).toBe(false);
    expect(
      DateRangeSchema.safeParse({ startsOn: '2026-11-11', endsOn: '2026-11-12' }).success,
    ).toBe(true);
    expect(
      NotionLinkRefSchema.safeParse({
        fromNotionId: 'n-s4',
        toNotionId: 'n-s4',
        kind: 'prerequisite',
      }).success,
    ).toBe(false);
    expect(
      NotionLinkRefSchema.safeParse({
        fromNotionId: 'n-s4',
        toNotionId: 'n-fiori',
        kind: 'tutor',
      }).success,
    ).toBe(true);
  });

  it('refuse -0, NaN, Infinity, undefined et les champs inconnus (CL-9)', () => {
    expect(AnswerRecordSchema.safeParse({ ...buildAnswer(), timeMs: -0 }).success).toBe(false);
    expect(AnswerRecordSchema.safeParse({ ...buildAnswer(), timeMs: Number.NaN }).success).toBe(
      false,
    );
    expect(
      AnswerRecordSchema.safeParse({ ...buildAnswer(), timeMs: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    const missing: Record<string, unknown> = { ...buildAnswer() };
    delete missing.timeMs;
    expect(AnswerRecordSchema.safeParse(missing).success).toBe(false);
    expect(AnswerRecordSchema.safeParse({ ...buildAnswer(), extra: true }).success).toBe(false);
    expect(NotionStateSchema.safeParse({ ...buildNotionState(), mastery: 33.333 }).success).toBe(
      false,
    );
    expect(
      NotionStateSchema.safeParse({ ...buildNotionState(), dueAt: '2026-02-30T00:00:00.000Z' })
        .success,
    ).toBe(false);
    expect(SerializedFsrsCardSchema.safeParse({ ...arbCardSample(), stability: -0 }).success).toBe(
      false,
    );
  });
});

function arbCardSample() {
  return {
    due: '2026-11-11T12:20:00.000Z',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 'review' as const,
    last_review: null,
  };
}
