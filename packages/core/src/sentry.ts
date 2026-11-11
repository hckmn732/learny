// Safe Sentry projection shared by the web and worker hosts (SPEC-010, EF-3, ET-4, CA-2).
// The SDK is initialised by each host; this module only builds and filters the minimal event that
// may leave the process. No request body, header, query, cookie, prompt or exception message is
// ever part of it.
import { clock as systemClock, type Clock } from './clock';
import { redactText } from './redaction';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  route?: string;
  jobId?: string;
}

export interface SafeSentryEvent {
  level: 'error';
  platform: 'node' | 'javascript';
  timestamp: string;
  message: string;
  tags: Record<string, string>;
  user?: { id: string };
  exception: { values: Array<{ type: string }> };
}

export interface ErrorReporter {
  readonly enabled: boolean;
  /** Returns the event actually sent (useful for tests); `undefined` when disabled. */
  capture(error: unknown, context?: ErrorContext): SafeSentryEvent | undefined;
}

const SAFE_TAG = /^[/A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** Exception class name only: an arbitrary `name` falls back to `Error`. */
export function safeErrorType(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  return SAFE_ERROR_NAME.test(name) ? name : 'Error';
}

function safeTag(value: string | undefined): string | undefined {
  return value !== undefined && SAFE_TAG.test(value) ? value : undefined;
}

function safeUserId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = redactText(value);
  return SAFE_TAG.test(cleaned) ? cleaned : undefined;
}

/** Minimal event: fixed message, safe tags, user identifier only, exception type only. */
export function buildSafeSentryEvent(
  error: unknown,
  context: ErrorContext = {},
  clock: Clock = systemClock,
): SafeSentryEvent {
  const tags: Record<string, string> = {};
  const requestId = safeTag(context.requestId);
  const route = safeTag(context.route);
  const jobId = safeTag(context.jobId);
  if (requestId !== undefined) tags.requestId = requestId;
  if (route !== undefined) tags.route = route;
  if (jobId !== undefined) tags.jobId = jobId;
  const userId = safeUserId(context.userId);
  return {
    level: 'error',
    platform: 'node',
    timestamp: clock.now().toISOString(),
    message: 'unhandled error',
    tags,
    ...(userId === undefined ? {} : { user: { id: userId } }),
    exception: { values: [{ type: safeErrorType(error) }] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * `beforeSend` filter of both SDKs: rebuilds the event from safe pieces only. Authorization,
 * cookies, query strings, request bodies, extra data, breadcrumbs and stack traces disappear
 * (ET-4, CA-2). The redaction constant is imported so a scrubbed value is explicit.
 */
export function sanitizeSentryEvent(event: unknown, clock: Clock = systemClock): SafeSentryEvent {
  if (!isRecord(event)) return buildSafeSentryEvent(undefined, {}, clock);
  const rawTags = isRecord(event.tags) ? event.tags : {};
  const tags: Record<string, string> = {};
  for (const key of ['requestId', 'route', 'jobId'] as const) {
    const value = rawTags[key];
    if (typeof value === 'string' && SAFE_TAG.test(value)) tags[key] = value;
  }
  const rawUser = isRecord(event.user) ? event.user : {};
  const userId = safeUserId(typeof rawUser.id === 'string' ? rawUser.id : undefined);
  const rawException = isRecord(event.exception) ? event.exception : {};
  const values = Array.isArray(rawException.values) ? rawException.values : [];
  const first = values.length > 0 && isRecord(values[0]) ? values[0] : {};
  const type =
    typeof first.type === 'string' && SAFE_ERROR_NAME.test(first.type) ? first.type : 'Error';
  return {
    level: 'error',
    platform: event.platform === 'javascript' ? 'javascript' : 'node',
    timestamp: clock.now().toISOString(),
    // Any message or value from the caller is dropped: a sentinel can never survive (CA-2).
    message: 'unhandled error',
    tags,
    ...(userId === undefined ? {} : { user: { id: userId } }),
    exception: { values: [{ type }] },
  };
}
