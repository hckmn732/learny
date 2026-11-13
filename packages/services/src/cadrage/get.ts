import {
  FormationPatchInput,
  type CadrageStateDto,
  type FormationPatchInput as FormationPatchInputType,
  type FormationSummary,
  type FormationsList,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';
import { formationMonogram } from '../sidebar';

import { buildState, readFormation, readMessages, toSummary } from './state';

// Reads and title update of the cadrage (SPEC-604 EF-1, EF-11, EF-13, ET-1). Every read uses the
// learner's RLS transaction: the formation of another owner is absent, so the route answers 404.

export function getCadrageState(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<CadrageStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const messages = await readMessages(tx, formationId);
      return buildState(formation, messages);
    });
  });
}

export interface CadragePageState {
  state: CadrageStateDto;
  status: FormationSummary['status'];
}

/** Page-only view: the route redirects a formation that left the `cadrage` status (EF-1). */
export function getCadragePageState(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<CadragePageState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const messages = await readMessages(tx, formationId);
      return {
        state: buildState(formation, messages),
        status: toSummary(formation).status,
      };
    });
  });
}

export function listFormations(ctx: ServiceContext): Promise<Result<FormationsList>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const rows = await tx.execute<{
        id: string;
        title: string;
        status: string;
        [key: string]: unknown;
      }>(sql`
        select id::text as id, title, status::text as status
        from public.formations
        where owner_id = ${userId}::uuid
        order by created_at desc
      `);
      return {
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status as FormationSummary['status'],
        })),
      };
    });
  });
}

export function updateFormationTitle(
  ctx: ServiceContext,
  formationId: string,
  input: FormationPatchInputType | unknown,
): Promise<Result<FormationSummary>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = FormationPatchInput.parse(input);
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const rows = await tx.execute<{
        id: string;
        title: string;
        status: string;
        [key: string]: unknown;
      }>(sql`
        update public.formations
        set title = ${parsed.title ?? formation.title},
            monogram = ${formationMonogram(parsed.title ?? formation.title)},
            updated_at = ${ctx.clock.now()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
        returning id::text as id, title, status::text as status
      `);
      const row = rows[0];
      if (row === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      return {
        id: row.id,
        title: row.title,
        status: row.status as FormationSummary['status'],
      };
    });
  });
}
