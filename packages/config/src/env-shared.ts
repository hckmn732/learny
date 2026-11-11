// Vocabulary shared by the public and server environment schemas (SPEC-009, ET-1, ET-2).
// This module never holds a value: only names, modes and safe error shapes.

export type EnvInput = Readonly<Record<string, string | undefined>>;

/** Application environments (EF-3). */
export const APP_ENVS = ['local', 'test', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Service modes (EF-3). A simulated mode is refused where the specification forbids it. */
export const LLM_MODES = ['mock', 'live'] as const;
export const STRIPE_MODES = ['mock', 'test', 'live'] as const;
export const EMAIL_MODES = ['memory', 'smtp', 'resend'] as const;
export const PUSH_MODES = ['mock', 'live'] as const;

export type LlmMode = (typeof LLM_MODES)[number];
export type StripeMode = (typeof STRIPE_MODES)[number];
export type EmailMode = (typeof EMAIL_MODES)[number];
export type PushMode = (typeof PUSH_MODES)[number];

export type EnvIssueCode = 'missing' | 'invalid' | 'incompatible' | 'forbidden';

export interface EnvIssue {
  readonly name: string;
  readonly code: EnvIssueCode;
}

const ISSUE_CODES: readonly string[] = [
  'missing',
  'invalid',
  'incompatible',
  'forbidden',
] satisfies readonly EnvIssueCode[];

function isEnvIssueCode(value: string): value is EnvIssueCode {
  return ISSUE_CODES.includes(value);
}

/**
 * Safe configuration error: it names the variables to fix and never carries a value (EF-1, CL-1,
 * CL-7). One error lists every offending variable, so a truncated startup fails once.
 */
export class EnvConfigError extends Error {
  readonly code = 'INVALID_ENVIRONMENT';
  readonly scope: string;
  readonly issues: readonly EnvIssue[];
  readonly names: readonly string[];

  constructor(scope: string, issues: readonly EnvIssue[]) {
    const unique = new Map<string, EnvIssue>();
    for (const issue of issues) if (!unique.has(issue.name)) unique.set(issue.name, issue);
    const names = [...unique.keys()].sort();
    super(`Configuration ${scope} invalide : variables à corriger : ${names.join(', ')}.`);
    this.name = 'EnvConfigError';
    this.scope = scope;
    this.issues = [...unique.values()];
    this.names = names;
  }
}

/**
 * Empty strings mean "not configured"; every other variable is kept byte for byte so that an API
 * key is never altered (CL-7). Whitespace trimming is limited to documented enumerations.
 */
export function normalizeEnv(raw: EnvInput): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return normalized;
}

/** Local host names admitted over plain HTTP (CL-5). Everything else needs HTTPS. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

export function isServiceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return LOCAL_HOSTNAMES.has(url.hostname) || LOCAL_HOSTNAMES.has(url.host);
}

export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Discards Zod messages (they may contain an input value) and keeps names plus safe codes. */
export function toEnvIssues(
  error: { issues: readonly { path: readonly PropertyKey[]; code: string; message: string }[] },
  extra: readonly EnvIssue[] = [],
): EnvIssue[] {
  const issues: EnvIssue[] = [...extra];
  for (const issue of error.issues) {
    const key = issue.path[0];
    const name = typeof key === 'string' ? key : 'ENV';
    const code =
      issue.code === 'custom' && isEnvIssueCode(issue.message) ? issue.message : 'invalid';
    issues.push({ name, code });
  }
  return issues;
}
