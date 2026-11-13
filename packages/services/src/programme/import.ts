import { ImportProgrammeInput, type ProgrammeProposalStateDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import { programmeScenario, runProgrammeDraft, type ProgrammeRunContext } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { programmeLock, tutorProfile } from './generate';
import { extractProgrammeText } from './import-file';
import { normalizeDraft } from './rules';
import { currentVersion, readFormation, readProfile, readProgrammeState } from './state';

// Import of a programme (SPEC-605 EF-2, CL-5). The extracted text is structured by the tutor
// outside the transaction. The original file stays private in `programme_imports` even when the
// tutor is unavailable, so the learner can retry without uploading it again.

export function importProposal(
  ctx: ServiceContext,
  formationId: string,
  input: unknown,
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = ImportProgrammeInput.parse(input);
    const extracted = await extractProgrammeText(parsed);

    const prepare = await db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status === 'active' || formation.status === 'paused') {
        throw new AppError('CONFLICT', 'Cette formation a déjà un programme actif.', {
          status: 409,
        });
      }
      const version = await currentVersion(tx, formationId);
      if (version !== parsed.expectedVersion) throw stale(version);
      const imports = await tx.execute<{ id: string }>(sql`
        insert into public.programme_imports (
          formation_id, user_id, source_kind, raw_text, original_filename, original_size,
          original_content, status, created_at, updated_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          ${extracted.kind},
          ${extracted.kind === 'text' ? extracted.text : null},
          ${extracted.filename},
          ${extracted.originalSize},
          ${extracted.originalContent},
          'running',
          ${ctx.clock.now().toISOString()}::timestamptz,
          ${ctx.clock.now().toISOString()}::timestamptz
        )
        returning id::text as id
      `);
      const importId = imports[0]?.id;
      if (importId === undefined) {
        throw new AppError('INTERNAL_ERROR', 'L’import n’a pas pu être enregistré.');
      }
      const profile = await readProfile(tx, userId);
      return { formation, importId, profile };
    });

    const runContext: ProgrammeRunContext = {
      userId,
      formationId,
      profile: tutorProfile(prepare.profile),
      clock: ctx.clock,
      requestId: ctx.requestId,
      llmDb: serviceDb(),
      scenario: programmeScenario(
        'import',
        prepare.formation.title,
        `${extracted.filename ?? ''} ${extracted.text.slice(0, 500)}`,
      ),
    };
    const generated = await runProgrammeDraft(runContext, {
      title: prepare.formation.title,
      message:
        'Structure ce programme importé : conserve les modules, chapitres et notions du document, sans en inventer.',
      documents: [
        {
          source: extracted.filename ?? 'programme-collé',
          title: 'Programme importé par l’apprenant',
          text: extracted.text,
        },
      ],
    });
    if (!generated.ok) {
      await markImportFailed(ctx, prepare.importId, generated.error.detail);
      throw generated.error;
    }
    const payload = normalizeDraft(generated.value.draft);

    await db.run(async (tx) => {
      await programmeLock(tx, formationId);
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const version = await currentVersion(tx, formationId);
      if (version !== parsed.expectedVersion) {
        throw stale(version);
      }
      await tx.execute(sql`
        insert into public.programme_proposals (
          formation_id, user_id, version, source, description, volume_hours, summary, payload,
          import_id, created_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          ${version + 1},
          'imported',
          ${payload.description},
          ${payload.volumeHours},
          ${payload.summary},
          ${JSON.stringify(payload)}::jsonb,
          ${prepare.importId}::uuid,
          ${ctx.clock.now().toISOString()}::timestamptz
        )
      `);
      await tx.execute(sql`
        update public.formations
        set status = 'programme_proposed',
            description = coalesce(description, ${payload.description}),
            volume_hours = coalesce(${payload.volumeHours}, volume_hours),
            start_date = ${payload.modules[0]?.plannedStart ?? null}::date,
            end_date = ${payload.modules.at(-1)?.plannedEnd ?? null}::date,
            default_threshold = ${payload.modules[0]?.threshold ?? 80},
            updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      await tx.execute(sql`
        update public.programme_imports
        set status = 'done',
            parsed = ${JSON.stringify(payload)}::jsonb,
            error = null,
            updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${prepare.importId}::uuid
          and formation_id = ${formationId}::uuid
      `);
    });

    await emitAfterCommit(
      db,
      'formation/programme-imported',
      { userId, formationId, importId: prepare.importId },
      { id: `programme-imported:${prepare.importId}` },
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

async function markImportFailed(
  ctx: ServiceContext,
  importId: string,
  error: string,
): Promise<void> {
  const { userId, db } = requireUser(ctx);
  await db.run(async (tx) => {
    await tx.execute(sql`
      update public.programme_imports
      set status = 'failed',
          error = ${error.slice(0, 2000)},
          updated_at = ${ctx.clock.now().toISOString()}::timestamptz
      where id = ${importId}::uuid
        and user_id = ${userId}::uuid
    `);
  });
}
