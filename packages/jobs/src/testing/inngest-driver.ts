// Controlled adapter of the test harness: plays the role of the Inngest executor over the real
// HTTP protocol of the SDK serve handler (POST ?fnId=…&stepId=step). Completed steps are sent back
// as memoized state, StepError ops are retried at most `retries` times, StepFailed stops the run.
// It never contacts Inngest Dev Server nor Inngest Cloud (CL-5).
export interface DrivenEvent {
  name: string;
  data: Record<string, unknown>;
}

export interface DriveOptions {
  handler: (request: Request) => Promise<Response>;
  fnId: string;
  event: DrivenEvent;
  retries: number;
  runId?: string;
  url?: string;
  /** Extra headers computed from the exact request body (e.g. X-Inngest-Signature). */
  headers?: (body: string) => Record<string, string>;
  maxRequests?: number;
}

export interface DrivenRun {
  status: 'completed' | 'failed';
  output: unknown;
  error: { name: string; message: string; noRetry: boolean } | null;
  httpStatuses: number[];
  /** Times the SDK reported a step body as run successfully. */
  stepRuns: Record<string, number>;
  /** Times the SDK reported a step body as failed (retriable or not). */
  stepErrors: Record<string, number>;
}

interface Op {
  id: string;
  op: string;
  name?: string;
  displayName?: string;
  data?: unknown;
  error?: { name?: string; message?: string };
}

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function safeError(error: Op['error'], noRetry: boolean): DrivenRun['error'] {
  return { name: error?.name ?? 'Error', message: error?.message ?? '', noRetry };
}

export async function driveInngestRun(options: DriveOptions): Promise<DrivenRun> {
  const url = new URL(options.url ?? 'http://localhost/api/inngest');
  url.searchParams.set('fnId', options.fnId);
  url.searchParams.set('stepId', 'step');
  const steps: Record<string, { type: 'data'; data: unknown }> = {};
  const stack: string[] = [];
  const run: DrivenRun = {
    status: 'failed',
    output: null,
    error: null,
    httpStatuses: [],
    stepRuns: {},
    stepErrors: {},
  };
  let attempt = 0;
  const maxRequests = options.maxRequests ?? 20;

  for (let i = 0; i < maxRequests; i += 1) {
    const body = JSON.stringify({
      event: options.event,
      events: [options.event],
      steps,
      ctx: {
        run_id: options.runId ?? 'run-driven',
        attempt,
        max_attempts: options.retries + 1,
        disable_immediate_execution: false,
        use_api: false,
        stack: { stack, current: stack.length },
      },
      version: 1,
    });
    const response = await options.handler(
      new Request(url, {
        method: 'POST',
        headers: {
          host: url.host,
          'content-type': 'application/json',
          ...options.headers?.(body),
        },
        body,
      }),
    );
    run.httpStatuses.push(response.status);
    const payload: unknown = await response.json().catch(() => null);

    if (response.status === 200) {
      return { ...run, status: 'completed', output: payload };
    }
    if (response.status !== 206) {
      const noRetry = response.headers.get('x-inngest-no-retry') !== 'false';
      if (noRetry || attempt >= options.retries) {
        return { ...run, error: safeError(payload as Op['error'], noRetry) };
      }
      attempt += 1;
      continue;
    }

    for (const op of payload as Op[]) {
      const name = op.displayName ?? op.name ?? op.id;
      if (op.op === 'StepRun') {
        inc(run.stepRuns, name);
        steps[op.id] = { type: 'data', data: op.data ?? null };
        stack.push(op.id);
        attempt = 0;
      } else if (op.op === 'StepError') {
        inc(run.stepErrors, name);
        if (attempt >= options.retries) return { ...run, error: safeError(op.error, false) };
        attempt += 1;
      } else if (op.op === 'StepFailed') {
        inc(run.stepErrors, name);
        return { ...run, error: safeError(op.error, true) };
      } else {
        throw new Error(`Opération Inngest non simulée : ${op.op}`);
      }
    }
  }
  throw new Error('Exécution simulée interrompue : trop de requêtes.');
}
