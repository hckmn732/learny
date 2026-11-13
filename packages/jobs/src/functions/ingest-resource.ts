// Ingestion job (SPEC-509 EF-1, ET-3): consumes `resource/uploaded` and runs the pipeline.
//
// Every stage of `processResource` is a durable Inngest step. The handler is idempotent on the
// resource: a duplicate delivery finds the completed marker and only replays the event claim.
// Domain events go through the transactional outbox, never directly to Inngest (ADR-0122).
import { defaultIngestionDeps, processResource, type StepRunner } from '@learny/ingestion';

import { defineFunction } from '../define';
import { emitAfterCommit } from '../emit';

export const INGEST_RESOURCE_ID = 'ingest-resource';

export const ingestResource = defineFunction(
  {
    id: INGEST_RESOURCE_ID,
    trigger: { event: 'resource/uploaded' },
    retries: 3,
    // One run per resource; two deliveries of the same event never overlap.
    concurrency: { key: 'event.data.resourceId', limit: 1 },
    timeouts: { finish: '10m' },
  },
  async ({ event, step, ctx }) => {
    const events = {
      resourceReady: async (data: {
        userId: string;
        resourceId: string;
        chunkCount: number;
      }): Promise<void> => {
        await emitAfterCommit(ctx.sdb, 'resource/ready', data, {
          id: `resource-ready:${data.resourceId}`,
        });
      },
      resourceFailed: async (data: {
        userId: string;
        resourceId: string;
        errorCode: string;
      }): Promise<void> => {
        await emitAfterCommit(ctx.sdb, 'resource/failed', data, {
          id: `resource-failed:${data.resourceId}:${data.errorCode}`,
        });
      },
    };
    const deps = defaultIngestionDeps({ events, logger: ctx.logger });
    const runner: StepRunner = {
      run: <T>(name: string, fn: () => Promise<T>) => step.run(name, fn) as Promise<T>,
    };
    return processResource(
      {
        sdb: ctx.sdb,
        clock: ctx.clock,
        logger: ctx.logger,
        requestId: ctx.requestId,
        step: runner,
      },
      event.data.resourceId,
      deps,
    );
  },
);
