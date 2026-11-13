import type { CadrageCompleteOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import {
  buildState,
  cadrageAlreadyCompleted,
  cadrageCompletedEventId,
  readFormation,
  readMessages,
} from './state';

// Conclusion of the cadrage (SPEC-604 EF-10, ET-1; CA-5, CA-6). The formation stays in `cadrage`
// until SPEC-605 proposes a programme; the conclusion is recorded by one deterministic outbox
// event, which freezes the profile and makes a second click a 409 without changing the status.

export function completeCadrage(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<CadrageCompleteOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (await cadrageAlreadyCompleted(formationId)) {
      throw new AppError('CONFLICT', 'Le cadrage de cette formation est déjà terminé.', {
        status: 409,
      });
    }

    await db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status !== 'cadrage') {
        throw new AppError('CONFLICT', 'Le cadrage de cette formation est terminé.', {
          status: 409,
        });
      }
      const messages = await readMessages(tx, formationId);
      const state = buildState(formation, messages, null);
      if (!state.canGenerate) {
        throw new AppError(
          'CADRAGE_INCOMPLETE',
          'Précisez d’abord le périmètre et le niveau visé.',
          { status: 422 },
        );
      }
      const objectives =
        formation.objectives.length > 0 ? formation.objectives : ['operational'];
      await tx.execute(sql`
        update public.formations
        set objectives = ${objectives.join(',')}::text[]::public.formation_objective[],
            cadrage_profile = ${JSON.stringify(state.profile)}::jsonb,
            updated_at = ${ctx.clock.now()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
    });

    await emitAfterCommit(
      db,
      'formation/cadrage-completed',
      { userId, formationId },
      { id: cadrageCompletedEventId(formationId) },
    );
    return { formationId };
  });
}
