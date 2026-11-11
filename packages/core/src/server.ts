// Server-only entry point of @learny/core (SPEC-010).
// Kept apart from the package root so a browser bundle never pulls pino or AsyncLocalStorage.
export { baseLogger, createLogCapture, createLogger, levelFromEnv, logger } from './logger';
export type {
  LearnyLogger,
  LogCapture,
  LoggerConfig,
  LoggerContext,
  LogLevel,
  LogValue,
  SafeLogField,
  SafeLogFields,
} from './logger';
export type { DestinationStream } from 'pino';
export {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  currentRequestContext,
  requestContext,
  resolveRequestId,
  runWithRequestContext,
} from './request-context';
export type { RequestContext } from './request-context';
export { buildSafeSentryEvent, safeErrorType, sanitizeSentryEvent } from './sentry';
export type { ErrorContext, ErrorReporter, SafeSentryEvent } from './sentry';
export { REDACTED, isSensitiveKey, redactText } from './redaction';
