// Answers of the session (SPEC-3305 ET-3, BR-MEM-10, BR-MEM-02).
//
// The native brick views speak the response shape of `@learny/bricks` (a map of ids); the review
// contract of the API speaks lists. `toReviewResponse` is the only bridge, and the local grading of
// the offline path keeps using the brick shape with `localGrade`.
import type { CorrectionView } from '@learny/bricks';
import type { ReviewAnswerInput, ReviewItemDto } from '@learny/contracts';

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Text of a value read from an untrusted correction, or the empty string. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function entriesOf(value: unknown): [string, string][] {
  const record = recordOf(value);
  return Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
  );
}

/**
 * Response sent to `POST /review-sessions/:sid/answers` (SPEC-702 ET-1).
 * Matching and categorization are maps on the device and lists in the contract; ordering and cloze
 * are already in the contract shape. Any other type (choice question, recall card) is sent as is.
 */
export function toReviewResponse(response: unknown): unknown {
  const value = recordOf(response);
  const pairs = value['pairs'];
  if (pairs !== null && typeof pairs === 'object' && !Array.isArray(pairs)) {
    return { pairs: entriesOf(pairs).map(([leftId, rightId]) => ({ leftId, rightId })) };
  }
  const assignments = value['assignments'];
  if (assignments !== null && typeof assignments === 'object' && !Array.isArray(assignments)) {
    return {
      assignments: entriesOf(assignments).map(([itemId, categoryId]) => ({ itemId, categoryId })),
    };
  }
  const gaps = value['gaps'];
  if (gaps !== null && typeof gaps === 'object' && !Array.isArray(gaps)) {
    return { gaps: entriesOf(gaps).map(([gapId, gapValue]) => ({ gapId, value: gapValue })) };
  }
  return response;
}

/** Body of one answered game (ET-3): one `clientAnswerId` per intention, kept until the 200. */
export function reviewAnswerInput(
  item: ReviewItemDto,
  response: unknown,
  clientAnswerId: string,
  timeMs: number,
): ReviewAnswerInput {
  return {
    position: item.position,
    clientAnswerId,
    timeMs: Math.min(Math.max(Math.round(timeMs), 0), 3_600_000),
    response: toReviewResponse(response),
  };
}

/** Body of a skipped game (BR-MEM-09): `skipped` and `response` are mutually exclusive. */
export function skipAnswerInput(
  item: ReviewItemDto,
  clientAnswerId: string,
  timeMs: number,
): ReviewAnswerInput {
  return {
    position: item.position,
    clientAnswerId,
    timeMs: Math.min(Math.max(Math.round(timeMs), 0), 3_600_000),
    skipped: true,
  };
}

/** Self-assessment read from a recall-card response, tolerant of a missing value. */
export function selfGradeOf(response: unknown): 'again' | 'hard' | 'good' | 'easy' | null {
  const value = recordOf(response)['selfGrade'];
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy'
    ? value
    : null;
}

/** Correction of a game, converted to the shape the native brick views render (SPEC-702 ET-2). */
export function toBrickCorrection(type: string, correction: unknown): CorrectionView | undefined {
  const value = recordOf(correction);
  const kind = value['kind'];
  const explanation = typeof value['explanation'] === 'string' ? value['explanation'] : '';
  if (kind === 'matching') {
    const pairs = Array.isArray(value['pairs']) ? value['pairs'] : [];
    return {
      kind: 'matching',
      explanation,
      pairs: pairs.map((pair) => {
        const row = recordOf(pair);
        return {
          pairId: textOf(row['leftId']),
          left: textOf(row['expectedLeftLabel']),
          expectedRight: '',
          givenRight: typeof row['rightId'] === 'string' ? row['rightId'] : null,
          correct: row['ok'] === true,
        };
      }),
    };
  }
  if (kind === 'ordering') {
    const rows = Array.isArray(value['rows']) ? value['rows'] : [];
    return {
      kind: 'ordering',
      explanation,
      positions: rows.map((row) => {
        const step = recordOf(row);
        return {
          id: textOf(step['stepId']),
          text: '',
          expectedIndex: Number(step['expectedPosition'] ?? 1) - 1,
          givenIndex: Number(step['position'] ?? 1) - 1,
          correct: step['ok'] === true,
        };
      }),
    };
  }
  if (kind === 'categorization') {
    const rows = Array.isArray(value['rows']) ? value['rows'] : [];
    return {
      kind: 'categorization',
      explanation,
      items: rows.map((row) => {
        const item = recordOf(row);
        return {
          id: textOf(item['itemId']),
          text: '',
          expectedCategoryId: textOf(item['expectedCategoryId']),
          expectedCategoryLabel: textOf(item['expectedCategoryLabel']),
          givenCategoryId: typeof item['categoryId'] === 'string' ? item['categoryId'] : null,
          givenCategoryLabel: null,
          correct: item['ok'] === true,
        };
      }),
    };
  }
  if (kind === 'cloze') {
    const gaps = Array.isArray(value['gaps']) ? value['gaps'] : [];
    return {
      kind: 'cloze',
      explanation,
      gaps: gaps.map((gap) => {
        const row = recordOf(gap);
        return {
          id: Number(row['gapId'] ?? 0),
          given: typeof row['given'] === 'string' ? row['given'] : '',
          expected: textOf(row['expected']),
          correct: row['ok'] === true,
        };
      }),
    };
  }
  return correction as CorrectionView | undefined;
}
