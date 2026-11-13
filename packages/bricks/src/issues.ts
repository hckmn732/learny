// Every issue code of ET-4 and ET-5, plus SCHEMA_INVALID (28 codes). Messages are English and carry
// a JSON path, so that the tutor loop (SPEC-508) can send them back to a model (BR-IA-11).
export const BRICK_ISSUE_CODES = [
  'SCHEMA_INVALID',
  'CHOICE_NO_CORRECT',
  'CHOICE_SINGLE_NEEDS_ONE',
  'CHOICE_ALL_CORRECT',
  'DISTRACTOR_NOTION_MISSING',
  'DUPLICATE_OPTION',
  'DUPLICATE_ID',
  'CLOZE_GAP_MISMATCH',
  'CLOZE_ANSWER_LEAK',
  'MATCHING_DUPLICATE',
  'ORDERING_DUPLICATE',
  'CATEGORY_EMPTY',
  'CATEGORY_UNKNOWN',
  'CRITERIA_POINTS_MISMATCH',
  'TABLE_CHECK_COLUMN_UNKNOWN',
  'TABLE_OPTIONS_INVALID',
  'SCORING_SUM_MISMATCH',
  'TIMER_SCOPE_INVALID',
  'HTML_NOT_ALLOWED',
  'NOTION_REQUIRED',
  'ORIGIN_INVALID',
  'SOURCES_REQUIRED',
  'NOTION_NOT_FOUND',
  'SOURCE_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'CHUNK_RESOURCE_MISMATCH',
  'LOCATION_INVALID',
  'BRICK_REF_NOT_FOUND',
] as const;

export type BrickIssueCode = (typeof BRICK_ISSUE_CODES)[number];

/** One readable validation issue: stable code, JSON path and English message. */
export interface BrickIssue {
  code: BrickIssueCode;
  path: string;
  message: string;
}

export function brickIssue(code: BrickIssueCode, path: string, message: string): BrickIssue {
  return { code, path, message };
}

/** Removes exact duplicates while keeping the first occurrence order. */
export function uniqueIssues(issues: readonly BrickIssue[]): BrickIssue[] {
  const seen = new Set<string>();
  const result: BrickIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}\u0000${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}
