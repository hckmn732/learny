// The single registry of Inngest functions, served by apps/web and apps/worker (EF-1).
import type { Inngest } from 'inngest';

import { inngest } from '../client';
import { createMemoryDemoStore, type DemoResultStore } from '../demo-store';
import type { JobErrorReporter } from '../ports';

import { createDemoJob } from './demo-job';

export interface JobDeps {
  demoStore: DemoResultStore;
  reportError?: JobErrorReporter;
}

export function createFunctions(client: Inngest, deps: JobDeps) {
  return [
    createDemoJob(client, {
      store: deps.demoStore,
      ...(deps.reportError === undefined ? {} : { reportError: deps.reportError }),
    }),
  ];
}

// Demonstration store shared by both hosts and the SDD page (test/demo adapter only).
export const sddDemoStore = createMemoryDemoStore();

export const functions = createFunctions(inngest, { demoStore: sddDemoStore });
