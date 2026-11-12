// Production wiring of the file service (SPEC-206): SPEC-114 Storage gateway, object reader,
// short-lived Storage tokens and the `resource/uploaded` sink. Built once per process from the
// validated configuration; the Supabase JWT secret stays on the server.
import { parseEventData } from '@learny/contracts';
import { AppError, systemClock } from '@learny/core';
import { SupabaseStorageGateway } from '@learny/db';
import { inngest } from '@learny/jobs';
import {
  SupabaseObjectReader,
  mintUserAccessToken,
  type ResourceDeps,
  type ResourceEventSink,
} from '@learny/services';

import { getPublicEnv, getServerEnv } from '../server-env';

// The payload is checked against the SPEC-203 catalogue; until the service emits through the
// transactional outbox (`emitAfterCommit`), the event goes straight to Inngest with its stable id. In `JOBS_MODE=inline` (tests, CI) no function subscribes to it yet.
const eventSink: ResourceEventSink = {
  async emitUploaded(event, { id }) {
    const data = parseEventData('resource/uploaded', event);
    if (getServerEnv().JOBS_MODE === 'inline') return;
    await inngest.send({ id, name: 'resource/uploaded', data });
  },
};

let cached: ResourceDeps | undefined;

export function resourceDeps(): ResourceDeps {
  if (cached !== undefined) return cached;
  const publicEnv = getPublicEnv();
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwtSecret = getServerEnv().SUPABASE_JWT_SECRET;
  if (url === undefined || apiKey === undefined || jwtSecret === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le stockage de fichiers n’est pas configuré.');
  }
  cached = {
    // Storage checks token expiry against real time: the gateway uses the real clock even when
    // the application clock is frozen for tests (ADR-0047).
    gateway: new SupabaseStorageGateway({ url, apiKey, jwtSecret, clock: systemClock }),
    reader: new SupabaseObjectReader({ url, apiKey }),
    events: eventSink,
    accessToken: (userId) => mintUserAccessToken(userId, jwtSecret),
  };
  return cached;
}
