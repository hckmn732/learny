import { AdjustProgrammeInput, type ProgrammeProposalStateDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { serviceDb } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import { programmeScenario, runProgrammeDraft, type ProgrammeRunContext } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { programmeLock, tutorProfile } from './generate';
import { normalizeDraft, parseProposalPayload } from './rules';
import {
  currentVersion,
  readFormation,
  readProfile,
  readProposal,
  readProgrammeState,
} from './state';

// Ajustement en langage naturel (SPEC-605 EF-3, ET-4): the request is stored, the tutor returns a
// complete new version, and the old version stays readable. No active module and no planning row
// is touched before validation.

export function adjustProposal(
  ctx: ServiceContext,
  formationId: string,
  input: unknown,
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = AdjustProgrammeInput.parse(input);

    const prepare = await db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status !== 'programme_proposed') {
        throw new AppError('CONFLICT', 'Aucune proposition ajustable pour cette formation.', {
          status: 409,
        });
      }
      const version = await currentVersion(tx, formationId);
      if (version !== parsed.expectedVersion) {
        throw stale(version);
      }
      const proposal = await readProposal(tx, formationId, version);
      if (proposal === null) throw new AppError('NOT_FOUND', 'Proposition introuvable.');
      const payload = parseProposalPayload(proposal.payload);
      const changeRequests = await tx.execute<{ id: string }>(sql`
        insert into public.programme_change_requests (
          formation_id, user_id, message, status, created_at, updated_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          ${parsed.message},
          'queued',
          ${ctx.clock.now().toISOString()}::timestamptz,
          ${ctx.clock.now().toISOString()}::timestamptz
        )
        returning id::text as id
      `);
      const changeRequestId = changeRequests[0]?.id;
      if (changeRequestId === undefined) {
        throw new AppError('INTERNAL_ERROR', 'La demande d’ajustement n’a pas pu être créée.');
      }
      const profile = await readProfile(tx, userId);
      return { formation, proposal, payload, changeRequestId, profile };
    });

    const runContext: ProgrammeRunContext = {
      userId,
      formationId,
      profile: tutorProfile(prepare.profile),
      clock: ctx.clock,
      requestId: ctx.requestId,
      llmDb: serviceDb(),
      scenario: programmeScenario('adjust', prepare.formation.title, parsed.message),
    };
    const generated = await runProgrammeDraft(runContext, {
      title: prepare.formation.title,
      message: parsed.message,
      context: JSON.stringify({
        versionActuelle: prepare.proposal.version,
        propositionActuelle: prepare.payload,
      }),
    });
    if (!generated.ok) {
      await markChangeRequest(
        ctx,
        userId,
        prepare.changeRequestId,
        'failed',
        generated.error.detail,
      );
      throw generated.error;
    }
    const payload = normalizeDraft(generated.value.draft);

    await db.run(async (tx) => {
      await programmeLock(tx, formationId);
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const version = await currentVersion(tx, formationId);
      if (version !== parsed.expectedVersion) throw stale(version);
      await tx.execute(sql`
        insert into public.programme_proposals (
          formation_id, user_id, version, source, description, volume_hours, summary, payload,
          change_request_id, created_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          ${version + 1},
          'generated',
          ${payload.description},
          ${payload.volumeHours},
          ${payload.summary},
          ${JSON.stringify(payload)}::jsonb,
          ${prepare.changeRequestId}::uuid,
          ${ctx.clock.now().toISOString()}::timestamptz
        )
      `);
      await tx.execute(sql`
        update public.formations
        set description = coalesce(${payload.description}, description),
            volume_hours = coalesce(${payload.volumeHours}, volume_hours),
            start_date = ${payload.modules[0]?.plannedStart ?? null}::date,
            end_date = ${payload.modules.at(-1)?.plannedEnd ?? null}::date,
            default_threshold = ${payload.modules[0]?.threshold ?? 80},
            updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      await tx.execute(sql`
        update public.programme_change_requests
        set status = 'done', result_summary = ${payload.summary}, updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${prepare.changeRequestId}::uuid
          and formation_id = ${formationId}::uuid
      `);
    });

    await emitAfterCommit(
      db,
      'formation/programme-requested',
      { userId, formationId, changeRequestId: prepare.changeRequestId },
      { id: `programme-requested:${prepare.changeRequestId}` },
    );
    return db.run((tx) => readProgrammeState(tx, userId, formationId, { completed: true }));
  });
}

function stale(version: number): AppError {
  return new AppError('CONFLICT', 'La proposition a changé : rechargez la version actuelle.', {
    status: 409,
    errors: [{ path: 'expectedVersion', message: `Version actuelle : ${String(version)}` }],
  });
}

async function markChangeRequest(
  ctx: ServiceContext,
  userId: string,
  changeRequestId: string,
  status: 'failed',
  error: string,
): Promise<void> {
  const { db } = requireUser(ctx);
  await db.run(async (tx) => {
    await tx.execute(sql`
      update public.programme_change_requests
      set status = ${status},
          result_summary = ${error.slice(0, 4000)},
          updated_at = ${ctx.clock.now().toISOString()}::timestamptz
      where id = ${changeRequestId}::uuid
        and user_id = ${userId}::uuid
    `);
  });
}
