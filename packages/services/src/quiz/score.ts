// Pure score of a validation attempt (SPEC-611 EF-9, ET-3, ADR-0014, ADR-0170). No I/O, no clock:
// services pass the corrected answers and the question points. A question is worth `maxScore`
// points; the global score is the earned share of the 100-point scale, rounded to two decimals.
// `perNotion` averages the success ratio of the questions attached to each notion.

export interface ScoredAnswer {
  position: number;
  notionId: string;
  /** Earned points on the question scale (0..maxScore). */
  score: number;
  /** Question scale, `100 / N` by default. */
  maxScore: number;
  isCorrect: boolean | null;
}

export interface NotionScore {
  correct: number;
  total: number;
  score: number;
}

export interface AttemptScore {
  score: number;
  perNotion: Record<string, NotionScore>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounded(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(Math.max(value, 0), max);
}

/**
 * EF-9 — 100 points spread equally over N questions. `total` is the number of questions of the
 * attempt (12 by default); the sum of the max scores is the denominator, so a partial cloze or
 * matching counts proportionally. CA-5: 8/9 auto + 1 + 0.5 + 0 open gives 79.17.
 */
export function computeScore(answers: readonly ScoredAnswer[]): AttemptScore {
  const ordered = [...answers].sort((left, right) => left.position - right.position);
  let earned = 0;
  let possible = 0;
  const byNotion = new Map<string, { correct: number; total: number; ratio: number }>();

  for (const answer of ordered) {
    const maxScore = answer.maxScore > 0 ? answer.maxScore : 0;
    const score = bounded(answer.score, maxScore);
    earned += score;
    possible += maxScore;
    const entry = byNotion.get(answer.notionId) ?? { correct: 0, total: 0, ratio: 0 };
    entry.total += 1;
    if (answer.isCorrect === true) entry.correct += 1;
    entry.ratio += maxScore > 0 ? score / maxScore : 0;
    byNotion.set(answer.notionId, entry);
  }

  const score = possible > 0 ? round2((earned / possible) * 100) : 0;
  const perNotion: Record<string, NotionScore> = {};
  for (const [notionId, entry] of byNotion) {
    perNotion[notionId] = {
      correct: entry.correct,
      total: entry.total,
      score: entry.total > 0 ? round2((entry.ratio / entry.total) * 100) : 0,
    };
  }
  return { score, perNotion };
}

/** ADR-0170 §5 — the unrounded score is compared with the module threshold. */
export function isPassed(score: number, threshold: number): boolean {
  return Number.isFinite(score) && score >= threshold;
}
