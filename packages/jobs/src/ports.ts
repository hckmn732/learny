// Ports injected into job handlers (ET-4): storage, step tooling and safe logs.
export interface StepTools {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export type SafeLogFields = Readonly<Record<string, string | number | boolean>>;

export interface JobLogger {
  info(message: string, fields: SafeLogFields): void;
  warn(message: string, fields: SafeLogFields): void;
  error(message: string, fields: SafeLogFields): void;
}

export const silentLogger: JobLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Safe description of a job failure (SPEC-010, EF-4). The error object is only handed to the
 * telemetry reporter, which keeps its type; nothing of the payload is included.
 */
export interface JobErrorReport {
  job: string;
  jobId?: string;
  step?: string;
  attempt?: number;
  requestId?: string;
  /** Inngest event that triggered the function (SPEC-203 ET-4). */
  eventId?: string;
  /** Owner of the event, when it has one (SPEC-203 ET-4). */
  userId?: string;
  error: unknown;
}

export type JobErrorReporter = (report: JobErrorReport) => void;

let jobErrorReporter: JobErrorReporter | undefined;

/** Registers the telemetry hook of the final failures of `defineFunction` (SPEC-010). */
export function setJobErrorReporter(reporter: JobErrorReporter | undefined): void {
  jobErrorReporter = reporter;
}

export function reportJobError(report: JobErrorReport): void {
  try {
    jobErrorReporter?.(report);
  } catch {
    // A faulty reporter never breaks a job.
  }
}
