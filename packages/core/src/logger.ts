// Structured logger of Learny (SPEC-010, EF-2, ET-1, CL-2).
// Every line is JSON with `timestamp`, `level`, `message` and the correlation fields of the
// request or job. Only allow-listed primitive fields are kept: an arbitrary object is never
// serialised, even when a caller casts it to the field type.
import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';

import { clock as systemClock, type Clock } from './clock';
import { REDACTED, redactText } from './redaction';
import { currentRequestContext } from './request-context';

type Env = Readonly<Record<string, string | undefined>>;

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** Primitive values accepted in a structured event. */
export type LogValue = string | number | boolean;

/** Exactly the event fields the application may attach to a line (allow-list, ET-1). */
export const SAFE_LOG_FIELDS = [
  'requestId',
  'userId',
  'route',
  'jobId',
  'spec',
  'code',
  'status',
  'method',
  'path',
  'durationMs',
  'component',
  'probe',
  'job',
  'step',
  'attempt',
  'runId',
  'operation',
  'outcome',
  'queryLength',
  'resultCount',
] as const;

export type SafeLogField = (typeof SAFE_LOG_FIELDS)[number];
export type SafeLogFields = Readonly<Partial<Record<SafeLogField, LogValue>>>;

/** Known sensitive paths removed by pino before serialisation (defence in depth, ET-1). */
export const REDACT_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  '*.*.*.password',
  'passwordHash',
  '*.passwordHash',
  'secret',
  '*.secret',
  '*.*.secret',
  'apiKey',
  '*.apiKey',
  '*.*.apiKey',
  'api_key',
  '*.api_key',
  'token',
  '*.token',
  '*.*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  '*.authorization',
  '*.*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  'request.headers.authorization',
  'cookie',
  '*.cookie',
  'set-cookie',
  '*.set-cookie',
  'headers.cookie',
  'headers["set-cookie"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'email',
  '*.email',
  '*.*.email',
  'user.email',
  'prompt',
  '*.prompt',
  '*.*.prompt',
  'response',
  '*.response',
  '*.*.response',
  'completion',
  '*.completion',
  'contribution',
  '*.contribution',
  '*.*.contribution',
  'apport',
  '*.apport',
  'body',
  '*.body',
  'req.body',
  'request.body',
] as const;

export interface LoggerContext {
  requestId?: string;
  userId?: string;
  route?: string;
  jobId?: string;
  spec?: string;
}

export interface LoggerConfig extends LoggerContext {
  level?: LogLevel;
  clock?: Clock;
  destination?: DestinationStream;
  env?: Env;
}

export interface LearnyLogger {
  debug(message: string, fields?: SafeLogFields, error?: unknown): void;
  info(message: string, fields?: SafeLogFields, error?: unknown): void;
  warn(message: string, fields?: SafeLogFields, error?: unknown): void;
  error(message: string, fields?: SafeLogFields, error?: unknown): void;
  fatal(message: string, fields?: SafeLogFields, error?: unknown): void;
  /** A derived logger sharing the destination and clock, with additional context. */
  child(context: LoggerContext): LearnyLogger;
}

export interface LogCapture {
  destination: DestinationStream;
  /** Raw bytes written by pino. */
  text(): string;
  /** Parsed JSON lines, in emission order. */
  records(): Record<string, unknown>[];
  clear(): void;
}

/** Collects pino output in memory: assertions run on the produced bytes (ET-6). */
export function createLogCapture(): LogCapture {
  let chunks: string[] = [];
  return {
    destination: {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    },
    text: () => chunks.join(''),
    records: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    clear: () => {
      chunks = [];
    },
  };
}

/** Level from `LOG_LEVEL`; anything unexpected falls back to `info` (production default). */
export function levelFromEnv(env: Env = process.env): LogLevel {
  const value = env.LOG_LEVEL;
  return value !== undefined && (LOG_LEVELS as readonly string[]).includes(value)
    ? (value as LogLevel)
    : DEFAULT_LOG_LEVEL;
}

/** Safe projection of an exception: type and business code only, never message nor stack. */
export function serializeError(error: unknown): Record<string, LogValue> {
  if (error instanceof Error) {
    const name = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : 'Error';
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
      ? { error: name, code }
      : { error: name };
  }
  // Already-safe projection produced by the wrapper; pino's serializer must keep it as is.
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const name = record.error;
    const code = record.code;
    const out: Record<string, LogValue> = {};
    if (typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) out.error = name;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)) out.code = code;
    return out;
  }
  return {};
}

/**
 * Keeps only allow-listed primitive fields. Unknown keys and every nested object are dropped;
 * strings are scrubbed for e-mail addresses, tokens and `key=value` secrets.
 */
export function sanitizeLogFields(input: unknown): Partial<Record<SafeLogField, LogValue>> {
  const out: Partial<Record<SafeLogField, LogValue>> = {};
  if (input === null || typeof input !== 'object') return out;
  const record = input as Record<string, unknown>;
  for (const key of SAFE_LOG_FIELDS) {
    const value = record[key];
    if (typeof value === 'string') out[key] = redactText(value);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

function pinoOptions(level: LogLevel, clock: Clock) {
  return {
    level,
    base: null,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${clock.now().toISOString()}"`,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    serializers: {
      err: (value: unknown) => serializeError(value),
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };
}

/** The base pino instance, configured with the safe serialisers (ET-1). */
export const baseLogger: PinoLogger = pino(pinoOptions(DEFAULT_LOG_LEVEL, systemClock));

/**
 * Creates a contextual logger. `requestId` and `userId` come from the explicit configuration or,
 * when absent, from the request context carried by AsyncLocalStorage (ET-2, CL-6).
 */
export function createLogger(config: LoggerConfig = {}): LearnyLogger {
  const ambient = currentRequestContext();
  const resolved: LoggerContext = {};
  const requestId = config.requestId ?? ambient?.requestId;
  const userId = config.userId ?? ambient?.userId;
  if (requestId !== undefined) resolved.requestId = requestId;
  if (userId !== undefined) resolved.userId = userId;
  if (config.route !== undefined) resolved.route = config.route;
  if (config.jobId !== undefined) resolved.jobId = config.jobId;
  if (config.spec !== undefined) resolved.spec = config.spec;

  const clock = config.clock ?? systemClock;
  const level = config.level ?? levelFromEnv(config.env);
  const instance =
    config.destination === undefined
      ? pino(pinoOptions(level, clock))
      : pino(pinoOptions(level, clock), config.destination);

  const emit = (
    method: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: string,
    fields?: SafeLogFields,
    error?: unknown,
  ): void => {
    const record: Record<string, unknown> = {
      ...sanitizeLogFields(resolved),
      ...sanitizeLogFields(fields),
    };
    if (error !== undefined) {
      const safe = serializeError(error);
      if (Object.keys(safe).length > 0) record.err = safe;
    }
    instance[method](record, redactText(message));
  };

  return {
    debug: (message, fields, error) => {
      emit('debug', message, fields, error);
    },
    info: (message, fields, error) => {
      emit('info', message, fields, error);
    },
    warn: (message, fields, error) => {
      emit('warn', message, fields, error);
    },
    error: (message, fields, error) => {
      emit('error', message, fields, error);
    },
    fatal: (message, fields, error) => {
      emit('fatal', message, fields, error);
    },
    child: (context) =>
      createLogger({
        ...config,
        ...resolved,
        ...context,
      }),
  };
}

/** Base logger of the process (advanced usage; services should use `createLogger`). */
export const logger = createLogger();
