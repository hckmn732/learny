// Registry of the API client of the process (SPEC-3003 EF-2).
//
// `instance.ts` installs the client once at start-up; `stream.ts` and the screens read it here.
// Keeping the registry in its own module leaves `stream.ts` free of any native import, so the
// SSE logic is testable in Node (Vitest) with an injected client.
import type { ApiClient } from '@learny/api-client';

let client: ApiClient | null = null;

/** Installs the client of the application (called by `instance.ts`). */
export function setApiClient(next: ApiClient): void {
  client = next;
}

/** Client of the application; throws when the instance was never installed (programming error). */
export function requireApiClient(): ApiClient {
  if (client === null) throw new Error('Client d’API non initialisé : importer src/api/instance.');
  return client;
}

/** Current client or `null` (tests, pages rendered without the start-up instance). */
export function peekApiClient(): ApiClient | null {
  return client;
}
