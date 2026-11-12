// The single registry of Inngest functions, served by apps/web and apps/worker (EF-1).
import type { Inngest } from 'inngest';

import { inngest } from '../client';
import { createMemoryDemoStore, type DemoResultStore } from '../demo-store';
import { setInlineRegistry } from '../inline';
import type { JobErrorReporter } from '../ports';

import { cronHourlyTick } from './cron-hourly-tick';
import { cronNightly } from './cron-nightly';
import { createDemoJob } from './demo-job';
import { nightlyOutboxCleanup } from './nightly-outbox-cleanup';
import { sddDemoPipeline } from './sdd-demo-pipeline';

export interface JobDeps {
  demoStore: DemoResultStore;
  reportError?: JobErrorReporter;
}

// Functions of SPEC-203 are created with the shared `inngest` client (see `defineFunction`).
export const learnyFunctions = [
  cronHourlyTick,
  cronNightly,
  nightlyOutboxCleanup,
  sddDemoPipeline,
] as const;

export function createFunctions(client: Inngest, deps: JobDeps) {
  return [
    createDemoJob(client, {
      store: deps.demoStore,
      ...(deps.reportError === undefined ? {} : { reportError: deps.reportError }),
    }),
    ...learnyFunctions,
  ];
}

// Demonstration store shared by both hosts and the SDD page (test/demo adapter only).
export const sddDemoStore = createMemoryDemoStore();

export const functions = createFunctions(inngest, { demoStore: sddDemoStore });

// The in-process dispatcher (JOBS_MODE=inline) runs the same registry.
setInlineRegistry(functions);
