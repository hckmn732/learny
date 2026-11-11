// Commit conventions (docs/engineering/git.md §2, ADR-0103).
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'test',
  'docs',
  'refactor',
  'perf',
  'build',
  'ci',
  'chore',
  'style',
  'revert',
  'evidence',
  'merge',
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number];

export const COMMIT_SCOPE_PATTERN = /^(SPEC-\d{3}|CP-\d|sdd)$/;
export const SUBJECT_MAX = 72;
export const MERGE_SUBJECT_MAX = 100;
export const HEADER_MAX = 100;

type RuleLevel = 0 | 1 | 2;
type RuleConfig = readonly [RuleLevel] | readonly [RuleLevel, 'always' | 'never', unknown?];

export const commitlintRules = {
  'type-enum': [2, 'always', COMMIT_TYPES],
  'scope-empty': [2, 'never'],
  'learny/scope-pattern': [2, 'always'],
  'learny/subject-max-length': [2, 'always'],
  'subject-empty': [2, 'never'],
  'subject-full-stop': [2, 'never', '.'],
  'subject-case': [0],
  'header-max-length': [2, 'always', HEADER_MAX],
  'body-leading-blank': [2, 'always'],
  'footer-leading-blank': [2, 'always'],
  'body-max-line-length': [2, 'always', 100],
} as const satisfies Record<string, RuleConfig>;

export interface ParsedCommit {
  type?: string | null;
  scope?: string | null;
  subject?: string | null;
}

type RuleOutcome = [boolean, string];

export const commitlintPlugin = {
  rules: {
    'learny/scope-pattern': (parsed: ParsedCommit): RuleOutcome => {
      const scope = parsed.scope ?? '';
      // An empty scope is reported by scope-empty.
      const ok = scope === '' || COMMIT_SCOPE_PATTERN.test(scope);
      return [ok, 'la portée doit être SPEC-xxx, CP-n ou sdd'];
    },
    'learny/subject-max-length': (parsed: ParsedCommit): RuleOutcome => {
      const max = parsed.type === 'merge' ? MERGE_SUBJECT_MAX : SUBJECT_MAX;
      const ok = (parsed.subject ?? '').length <= max;
      return [ok, 'la description dépasse 72 caractères (100 pour merge)'];
    },
  },
};
