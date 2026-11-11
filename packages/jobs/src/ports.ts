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
