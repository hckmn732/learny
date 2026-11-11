// Controlled adapter of the test harness (docs/engineering/testing.md §1): executes a job handler
// directly, emulating Inngest's durable semantics without any server — completed steps are
// memoized by name and never re-executed, a failed step is retried at most `retries` times,
// and a NonRetriableError stops the run at once. It never contacts Inngest (CL-5).
import { errorCode, isPermanentError } from '../errors';
import { JOB_RETRIES } from '../functions/demo-job';
import type { StepTools } from '../ports';

export type DirectStepStatus = 'pending' | 'completed' | 'failed';

export interface DirectStepReport {
  name: string;
  status: DirectStepStatus;
  /** Number of times the step body ran (1 + retries). */
  attempts: number;
  /** Number of times a memoized result was replayed instead of running the body. */
  replays: number;
}

export interface DirectRunError {
  code: string;
  retriable: boolean;
  step: string | null;
}

export type DirectRun<T> =
  | { status: 'completed'; output: T; invocations: number; steps: DirectStepReport[] }
  | { status: 'failed'; error: DirectRunError; invocations: number; steps: DirectStepReport[] };

export interface DirectOptions {
  retries?: number;
  /** Declared step names, reported as `pending` until they run. */
  steps?: readonly string[];
}

class StepFailure extends Error {
  constructor(
    readonly step: string,
    override readonly cause: unknown,
  ) {
    super(`step ${step} failed`);
  }
}

function serialize<T>(value: T): T {
  // Inngest stores step results as JSON: replays return the serialized value.
  return (value === undefined ? null : JSON.parse(JSON.stringify(value))) as T;
}

export async function executeDirect<T>(
  handler: (step: StepTools) => Promise<T>,
  options: DirectOptions = {},
): Promise<DirectRun<T>> {
  const retries = options.retries ?? JOB_RETRIES;
  const memo = new Map<string, unknown>();
  const reports = new Map<string, DirectStepReport>();
  for (const name of options.steps ?? []) {
    reports.set(name, { name, status: 'pending', attempts: 0, replays: 0 });
  }
  const report = (name: string): DirectStepReport => {
    let r = reports.get(name);
    if (r === undefined) {
      r = { name, status: 'pending', attempts: 0, replays: 0 };
      reports.set(name, r);
    }
    return r;
  };

  const step: StepTools = {
    async run<R>(name: string, fn: () => Promise<R>): Promise<R> {
      const r = report(name);
      if (memo.has(name)) {
        r.replays += 1;
        return memo.get(name) as R;
      }
      r.attempts += 1;
      try {
        const value = serialize(await fn());
        memo.set(name, value);
        r.status = 'completed';
        return value;
      } catch (error) {
        throw new StepFailure(name, error);
      }
    },
  };

  let invocations = 0;
  let functionAttempts = 0;
  for (;;) {
    invocations += 1;
    try {
      const output = await handler(step);
      return { status: 'completed', output, invocations, steps: [...reports.values()] };
    } catch (thrown) {
      const failedStep = thrown instanceof StepFailure ? thrown.step : null;
      const cause = thrown instanceof StepFailure ? thrown.cause : thrown;
      const attempts = failedStep === null ? (functionAttempts += 1) : report(failedStep).attempts;
      const permanent = isPermanentError(cause);
      if (permanent || attempts > retries) {
        if (failedStep !== null) report(failedStep).status = 'failed';
        return {
          status: 'failed',
          error: { code: errorCode(cause), retriable: !permanent, step: failedStep },
          invocations,
          steps: [...reports.values()],
        };
      }
    }
  }
}
