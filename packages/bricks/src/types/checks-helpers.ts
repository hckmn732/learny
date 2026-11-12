// Shared helpers of the internal rules (ET-4). Every helper returns readable issues with the exact
// JSON path of the duplicate or invalid entry.
import { brickIssue, type BrickIssue } from '../issues';
import { normalizeText } from '../normalize';

export interface TextEntry {
  text: string;
  path: string;
}

export interface IdEntry {
  id: string;
  path: string;
}

/** Duplicate texts after ADR-0151 normalization (option, left/right, item). */
export function duplicateTexts(
  entries: readonly TextEntry[],
  code: 'DUPLICATE_OPTION' | 'MATCHING_DUPLICATE' | 'ORDERING_DUPLICATE',
  label: string,
): BrickIssue[] {
  const seen = new Map<string, string>();
  const issues: BrickIssue[] = [];
  for (const entry of entries) {
    const key = normalizeText(entry.text);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, entry.path);
      continue;
    }
    issues.push(
      brickIssue(code, entry.path, `Duplicate ${label} "${entry.text}" (same as ${first}).`),
    );
  }
  return issues;
}

/** Duplicate identifiers in one namespace. */
export function duplicateIds(entries: readonly IdEntry[]): BrickIssue[] {
  const seen = new Map<string, string>();
  const issues: BrickIssue[] = [];
  for (const entry of entries) {
    const first = seen.get(entry.id);
    if (first === undefined) {
      seen.set(entry.id, entry.path);
      continue;
    }
    issues.push(
      brickIssue('DUPLICATE_ID', entry.path, `Duplicate id "${entry.id}" (same as ${first}).`),
    );
  }
  return issues;
}

/** Sum of points of criteria. */
export function pointsSum(criteria: readonly { points: number }[]): number {
  return criteria.reduce((total, criterion) => total + criterion.points, 0);
}
