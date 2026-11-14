// Shared fixtures of the SPEC-702 component tests. Not imported by the application.
import {
  ReviewAnswerResultDtoSchema,
  ReviewItemDtoSchema,
  type ReviewItemDto,
} from '@learny/contracts';

export const NOTION_A = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
export const NOTION_B = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a02';
export const NOTION_C = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a03';

export function gameItem(
  type: ReviewItemDto['type'],
  payload: unknown,
  overrides: Partial<ReviewItemDto> = {},
): ReviewItemDto {
  return ReviewItemDtoSchema.parse({
    position: 1,
    brickId: '3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02',
    brickVersionId: '7c3f1a9e-2b4d-4c6e-9f10-1a2b3c4d5e6f',
    type,
    name: 'Jeu',
    tech: 'Rappel actif',
    displayLabel: 'Notions de base SAP',
    scopeLabel: 'Modules 1 et 2',
    reason: null,
    notionIds: [NOTION_A],
    payload,
    intervals: null,
    state: 'todo',
    result: null,
    ...overrides,
  });
}

/** Result of a recorded game, as stored in `ReviewItemDto.result`. */
export function gameResult(input: {
  isCorrect: boolean;
  correction: unknown;
  explanation?: string | null;
}): unknown {
  return ReviewAnswerResultDtoSchema.parse({
    position: 1,
    skipped: false,
    isCorrect: input.isCorrect,
    correction: input.correction,
    explanation: input.explanation ?? null,
    notions: [],
  });
}
