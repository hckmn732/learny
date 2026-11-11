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
  error: unknown;
}

export type JobErrorReporter = (report: JobErrorReport) => void;
