import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { REFERENCE_NOW } from '@learny/testing/clock';

import {
  AnswerRecordSchema,
  AvailabilitySchema,
  NotionStateSchema,
  ReviewEventSchema,
  SerializedFsrsCardSchema,
} from '../types';

import {
  arbAvailability,
  arbIsoDate,
  atDaysBefore,
  buildAnswer,
  buildCard,
  buildGap,
  buildNotionState,
  buildReviewEvent,
} from './builders';

const FAST_CHECK = { seed: 20261111, numRuns: 200 } as const;

describe('[SPEC-401] fabriques du moteur', () => {
  it('fournit des valeurs par défaut documentées et valides', () => {
    expect(buildCard()).toMatchObject({ due: REFERENCE_NOW, state: 'new', last_review: null });
    expect(buildNotionState()).toMatchObject({
      userId: 'u-demo',
      notionId: 'n-s4',
      mastery: 0,
      gap: null,
    });
    expect(buildAnswer()).toMatchObject({
      attemptKind: 'validation_quiz',
      source: 'validation',
      notionIds: ['n-s4'],
      timeMs: 20_000,
      correct: true,
    });
    expect(buildGap()).toMatchObject({ nature: 'confusion', confusedWith: 'n-type' });
    expect(buildReviewEvent()).toMatchObject({ rating: 'good', applied: true });

    expect(SerializedFsrsCardSchema.parse(buildCard())).toEqual(buildCard());
    expect(NotionStateSchema.parse(buildNotionState())).toEqual(buildNotionState());
    expect(AnswerRecordSchema.parse(buildAnswer())).toEqual(buildAnswer());
    expect(ReviewEventSchema.parse(buildReviewEvent())).toEqual(buildReviewEvent());
  });

  it('calcule un instant à J-n à 09:00 UTC par défaut', () => {
    expect(atDaysBefore(REFERENCE_NOW, 1)).toBe('2026-11-10T09:00:00.000Z');
    expect(atDaysBefore(REFERENCE_NOW, 0, '18:30')).toBe('2026-11-11T18:30:00.000Z');
    expect(atDaysBefore(REFERENCE_NOW, 32)).toBe('2026-10-10T09:00:00.000Z');
  });

  it('génère des dates et disponibilités valides', () => {
    fc.assert(
      fc.property(
        arbIsoDate('2026-01-01', '2026-12-31'),
        arbAvailability(),
        (date, availability) => {
          expect(date).toMatch(/^2026-\d{2}-\d{2}$/);
          expect(AvailabilitySchema.safeParse(availability).success).toBe(true);
        },
      ),
      FAST_CHECK,
    );
  });
});
