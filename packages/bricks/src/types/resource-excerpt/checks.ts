// `resource_excerpt` has no internal rule beyond its schema; resource and location references are
// verified by `validateBrick` with the resolver (ET-5).
import type { BrickIssue } from '../../issues';

export function resourceExcerptChecks(): BrickIssue[] {
  return [];
}
