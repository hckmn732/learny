// Sessions des 50 utilisateurs de charge (SPEC-804 EF-4, ET-3). Lancé par `run-k6.mjs` avec `tsx` :
// stdout reçoit un tableau JSON d'en-têtes `Cookie`, un par utilisateur `perf-NN@learny.test`.
import { createHash } from 'node:crypto';

import { PERF_CREDENTIALS } from '../../packages/db/src/seed/perf-credentials';
import { createDemoSession } from '../../packages/testing/src/supabase';

/** Identifiant déterministe de `packages/db/src/seed/perf.ts` (`md5('perf:user:<i>')::uuid`). */
export function perfUserId(index: number): string {
  const hex = createHash('md5')
    .update(`perf:user:${String(index)}`)
    .digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const sessions: Array<{ cookie: string; formationId: string }> = [];
for (const [offset, credential] of PERF_CREDENTIALS.entries()) {
  const session = await createDemoSession(perfUserId(offset + 1), credential.email);
  const index = offset + 1;
  const formationHex = createHash('md5')
    .update(`perf:formation:${String(index)}`)
    .digest('hex');
  sessions.push({
    cookie: session.cookieHeader,
    formationId: [
      formationHex.slice(0, 8),
      formationHex.slice(8, 12),
      formationHex.slice(12, 16),
      formationHex.slice(16, 20),
      formationHex.slice(20, 32),
    ].join('-'),
  });
}
process.stdout.write(JSON.stringify(sessions));
