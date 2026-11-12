// `scoring` brick (SPEC-501 ET-3): the points total of an activity, equal or weighted per brick.
import { z } from 'zod';

import { integer, positiveNumber, sourcesSchema, uuid } from '../../common';

export const scoringWeightSchema = z
  .object({
    brickId: uuid,
    points: positiveNumber(),
  })
  .strict();

export type ScoringWeight = z.infer<typeof scoringWeightSchema>;

export const scoringSchema = z
  .object({
    total: integer(1, 100),
    threshold: z.number().min(0),
    mode: z.enum(['equal', 'weighted']),
    weights: z.array(scoringWeightSchema).max(100).default([]),
    display: z.enum(['percent', 'points']),
    sources: sourcesSchema,
  })
  .strict()
  .refine((scoring) => scoring.threshold <= scoring.total, {
    message: 'threshold must not exceed total.',
    path: ['threshold'],
  });

export type ScoringPayload = z.infer<typeof scoringSchema>;
