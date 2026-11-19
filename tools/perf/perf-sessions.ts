// Sessions des 50 utilisateurs de charge (SPEC-804 EF-4, ET-3). Lancé par `run-k6.mjs` avec `tsx` :
// stdout reçoit un cookie et l'identifiant de formation valide pour chaque utilisateur.
import { PERF_CREDENTIALS } from '../../packages/db/src/seed/perf-credentials';
import { createDemoSession } from '../../packages/testing/src/supabase';

import { perfFormationId, perfUserId } from './perf-identifiers';

const sessions: { cookie: string; formationId: string }[] = [];
for (const [offset, credential] of PERF_CREDENTIALS.entries()) {
  const index = offset + 1;
  const session = await createDemoSession(perfUserId(index), credential.email);
  sessions.push({ cookie: session.cookieHeader, formationId: perfFormationId(index) });
}
process.stdout.write(JSON.stringify(sessions));
