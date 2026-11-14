// Per-notion split of one game correction (SPEC-702 ET-4, ET-5, ADR-0181). Pure: no clock, no
// database, no model call. The service feeds each entry to `applyReviewResult` so a matching or a
// categorization covering several notions receives one FSRS grade per notion, and a mistake that
// crosses two notions becomes a confusion (BR-MEM-05, BR-LAC-03).

import type { BrickPayload, Confusion } from '@learny/bricks';
import type { ReviewGameCorrection, ReviewGameFormat } from '@learny/contracts';

/** One notion outcome of a game: overall correctness and, when relevant, the confused notion. */
export interface PerNotionResult {
  notionId: string;
  /** Every element attached to this notion is correct (ADR-0181 §3). */
  correct: boolean;
  /** Notion B when an element of notion A was attached to the definition/category of B. */
  confusedWithNotionId?: string;
}

export interface SplitContext {
  /** Notions attached to the brick (`bricks.notion_ids`), in their stored order. */
  notionIds: readonly string[];
  /** Overall outcome of the game, used for notions without a mapped element. */
  isCorrect: boolean;
  /** Confusions already computed by `gradeBrick` (matching, categorization). */
  confusions?: readonly Confusion[];
}

function orderedNotions(primary: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const notionId of [...primary, ...extra]) {
    if (seen.has(notionId)) continue;
    seen.add(notionId);
    result.push(notionId);
  }
  return result;
}

function confusionOf(
  confusions: readonly Confusion[] | undefined,
  notionId: string,
): string | undefined {
  return confusions?.find((confusion) => confusion.notionId === notionId)?.confusedWithNotionId;
}

function splitMatching(
  payload: BrickPayload<'matching'>,
  correction: ReviewGameCorrection,
  context: SplitContext,
): PerNotionResult[] {
  if (correction.kind !== 'matching') return splitWholeItem(context);
  const okByPair = new Map(correction.pairs.map((pair) => [pair.leftId, pair.ok]));
  const pairNotions = payload.pairs.map((pair) => pair.notionId);
  return orderedNotions(context.notionIds, pairNotions).map((notionId) => {
    const pairs = payload.pairs.filter((pair) => pair.notionId === notionId);
    const correct =
      pairs.length === 0
        ? context.isCorrect
        : pairs.every((pair) => okByPair.get(pair.id) === true);
    const confusedWithNotionId = confusionOf(context.confusions, notionId);
    return {
      notionId,
      correct,
      ...(confusedWithNotionId === undefined ? {} : { confusedWithNotionId }),
    };
  });
}

/**
 * Categorization: an item belongs to the notion of its expected category. Items of a category
 * without `notionId` (CL-6) cannot be attributed, so the notions left without any element fall
 * back to the overall outcome. A wrong element crossing two notion-bearing categories is a
 * confusion A↔B; when the given category is notion-less, it is only an error.
 */
function splitCategorization(
  payload: BrickPayload<'categorization'>,
  correction: ReviewGameCorrection,
  context: SplitContext,
): PerNotionResult[] {
  if (correction.kind !== 'categorization') return splitWholeItem(context);
  const categoryNotion = new Map(
    payload.categories.map((category) => [category.id, category.notionId]),
  );
  const okByItem = new Map(correction.rows.map((row) => [row.itemId, row.ok]));
  const derived: Confusion[] = [];
  for (const row of correction.rows) {
    if (row.ok || row.categoryId === null) continue;
    const expected = categoryNotion.get(row.expectedCategoryId) ?? null;
    const given = categoryNotion.get(row.categoryId) ?? null;
    if (expected !== null && given !== null && expected !== given) {
      derived.push({ notionId: expected, confusedWithNotionId: given });
    }
  }
  const confusions = context.confusions ?? derived;
  const categoryNotions = payload.categories
    .map((category) => category.notionId)
    .filter((notionId): notionId is string => notionId !== null);
  return orderedNotions(context.notionIds, categoryNotions).map((notionId) => {
    const items = payload.items.filter((item) => categoryNotion.get(item.categoryId) === notionId);
    const correct =
      items.length === 0
        ? context.isCorrect
        : items.every((item) => okByItem.get(item.id) === true);
    const confusedWithNotionId = confusionOf(confusions, notionId);
    return {
      notionId,
      correct,
      ...(confusedWithNotionId === undefined ? {} : { confusedWithNotionId }),
    };
  });
}

/** Ordering and cloze are attached to the whole item: no per-element notion mapping exists. */
function splitWholeItem(context: SplitContext): PerNotionResult[] {
  return context.notionIds.map((notionId) => ({ notionId, correct: context.isCorrect }));
}

/**
 * ET-4, ET-5 — splits one game into the FSRS outcomes of its notions. The order follows the
 * brick notion ids first, then the notions only seen in the payload (defensive).
 */
export function splitResultByNotion(
  type: ReviewGameFormat,
  payload: unknown,
  correction: ReviewGameCorrection,
  context: SplitContext,
): PerNotionResult[] {
  switch (type) {
    case 'matching':
      return splitMatching(payload as BrickPayload<'matching'>, correction, context);
    case 'categorization':
      return splitCategorization(payload as BrickPayload<'categorization'>, correction, context);
    case 'ordering':
    case 'cloze':
      return splitWholeItem(context);
    default:
      return splitWholeItem(context);
  }
}
