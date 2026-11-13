import { FORMATION_RULES } from '@learny/config';
import { ValidateProgrammeInput, type ProgrammeProposalStateDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { programmeLock } from './generate';
import { parseProposalPayload } from './rules';
import {
  activeFormationCount,
  currentVersion,
  readFormation,
  readProposal,
  readProgrammeState,
} from './state';

// Validation of a proposal (SPEC-605 EF-4, ET-2, ET-4, ET-5; CA-1, CA-3, CA-4). One transaction
// takes the programme lock, re-checks the expected version, enforces the three-active limit, creates
// modules/chapters/notions and module progress, then activates the formation. The event carries a
// deterministic id so a retry never produces a second planning request.

export function validateProposal(
  ctx: ServiceContext,
  formationId: string,
  input: unknown,
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = ValidateProgrammeInput.parse(input);

    await db.run(async (tx) => {
      await programmeLock(tx, formationId);
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status === 'active' || formation.status === 'paused') {
        throw new AppError('CONFLICT', 'Ce programme est déjà validé.', { status: 409 });
      }
      if (formation.status !== 'cadrage' && formation.status !== 'programme_proposed') {
        throw new AppError('CONFLICT', 'Cette formation ne peut pas être activée.', {
          status: 409,
        });
      }
      const version = await currentVersion(tx, formationId);
      if (version !== parsed.expectedVersion) {
        throw new AppError('CONFLICT', 'La proposition a changé : rechargez la version actuelle.', {
          status: 409,
          errors: [{ path: 'expectedVersion', message: `Version actuelle : ${String(version)}` }],
        });
      }
      const proposal = await readProposal(tx, formationId, version);
      if (proposal === null) throw new AppError('NOT_FOUND', 'Proposition introuvable.');
      const payload = parseProposalPayload(proposal.payload);
      if (payload.modules.length === 0) {
        throw new AppError('PROGRAMME_INCOMPLETE', 'Ajoutez au moins un module.', { status: 422 });
      }

      const activeCount = await activeFormationCount(tx, userId, formationId);
      if (activeCount >= FORMATION_RULES.maxActiveFormations) {
        throw new AppError(
          'FORMATION_LIMIT_REACHED',
          'Trois formations actives au plus. Mettez une formation en pause pour valider celle-ci.',
          { status: 422 },
        );
      }

      const now = ctx.clock.now().toISOString();
      const createdBy = proposal.source === 'imported' ? 'import' : 'tutor';
      for (const [moduleIndex, module] of payload.modules.entries()) {
        const modules = await tx.execute<{ id: string }>(sql`
          insert into public.modules (
            formation_id, position, title, objectives, planned_start, planned_end, threshold,
            status, opened_at, created_at, updated_at
          )
          values (
            ${formationId}::uuid,
            ${module.position},
            ${module.title},
            ${sql`ARRAY[${sql.join(
              module.objectives.map((objective) => sql`${objective}`),
              sql`, `,
            )}]::text[]`},
            ${module.plannedStart}::date,
            ${module.plannedEnd}::date,
            ${module.threshold},
            ${moduleIndex === 0 ? 'open' : 'locked'}::public.module_status,
            ${moduleIndex === 0 ? now : null}::timestamptz,
            ${now}::timestamptz,
            ${now}::timestamptz
          )
          returning id::text as id
        `);
        const moduleId = modules[0]?.id;
        if (moduleId === undefined) {
          throw new AppError('INTERNAL_ERROR', 'Le module n’a pas pu être créé.');
        }
        await tx.execute(sql`
          insert into public.module_progress (
            user_id, module_id, status, opened_at, updated_at
          )
          values (
            ${userId}::uuid,
            ${moduleId}::uuid,
            ${moduleIndex === 0 ? 'open' : 'locked'}::public.module_status,
            ${moduleIndex === 0 ? now : null}::timestamptz,
            ${now}::timestamptz
          )
        `);
        for (const chapter of module.chapters) {
          const chapters = await tx.execute<{ id: string }>(sql`
            insert into public.chapters (
              module_id, formation_id, position, title, created_at, updated_at
            )
            values (
              ${moduleId}::uuid,
              ${formationId}::uuid,
              ${chapter.position},
              ${chapter.title},
              ${now}::timestamptz,
              ${now}::timestamptz
            )
            returning id::text as id
          `);
          const chapterId = chapters[0]?.id;
          if (chapterId === undefined) {
            throw new AppError('INTERNAL_ERROR', 'Le chapitre n’a pas pu être créé.');
          }
          for (const [notionIndex, notion] of chapter.notions.entries()) {
            await tx.execute(sql`
              insert into public.notions (
                formation_id, module_id, chapter_id, label, short_definition, position,
                created_by, created_at, updated_at
              )
              values (
                ${formationId}::uuid,
                ${moduleId}::uuid,
                ${chapterId}::uuid,
                ${notion.label},
                ${notion.definition},
                ${notionIndex + 1},
                ${createdBy}::public.actor,
                ${now}::timestamptz,
                ${now}::timestamptz
              )
            `);
          }
        }
      }

      const first = payload.modules[0];
      const last = payload.modules.at(-1);
      await tx.execute(sql`
        update public.formations
        set status = 'active',
            description = coalesce(description, ${proposal.description}),
            volume_hours = coalesce(${proposal.volume_hours}, volume_hours),
            start_date = ${first?.plannedStart ?? null}::date,
            end_date = ${last?.plannedEnd ?? null}::date,
            default_threshold = ${first?.threshold ?? 80},
            paused_at = null,
            updated_at = ${now}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
    });

    await emitAfterCommit(
      db,
      'formation/programme-validated',
      { userId, formationId, validatedAt: ctx.clock.now().toISOString() },
      { id: `programme-validated:${formationId}` },
    );
    return db.run((tx) => readProgrammeState(tx, userId, formationId, { completed: true }));
  });
}
