// Internal rules of a categorization (ET-4): every category receives at least one item, every item
// points to a known category, and ids never repeat.
import { brickIssue, type BrickIssue } from '../../issues';
import { duplicateIds } from '../checks-helpers';

import type { CategorizationPayload } from './schema';

export function categorizationChecks(payload: CategorizationPayload): BrickIssue[] {
  const issues: BrickIssue[] = [];
  const categoryIds = new Set(payload.categories.map((category) => category.id));

  payload.categories.forEach((category, index) => {
    if (!payload.items.some((item) => item.categoryId === category.id)) {
      issues.push(
        brickIssue(
          'CATEGORY_EMPTY',
          `payload.categories.${String(index)}`,
          `Category "${category.label}" has no item.`,
        ),
      );
    }
  });

  payload.items.forEach((item, index) => {
    if (!categoryIds.has(item.categoryId)) {
      issues.push(
        brickIssue(
          'CATEGORY_UNKNOWN',
          `payload.items.${String(index)}.categoryId`,
          `Unknown category "${item.categoryId}".`,
        ),
      );
    }
  });

  issues.push(
    ...duplicateIds([
      ...payload.categories.map((category, index) => ({
        id: category.id,
        path: `payload.categories.${String(index)}.id`,
      })),
      ...payload.items.map((item, index) => ({
        id: item.id,
        path: `payload.items.${String(index)}.id`,
      })),
    ]),
  );

  return issues;
}
