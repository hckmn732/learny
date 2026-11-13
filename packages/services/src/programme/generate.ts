import {
  GenerateProgrammeInput,
  type ProgrammeProposalStateDto,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import { runProgrammeDraft, programmeScenario, type ProgrammeRunContext } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { normalizeDraft } from './rules';
import { currentVersion, readFormation, readProfile, readProgrammeState } from './state';

// Generation of one proposal (SPEC-605 EF-1, ET-4). The tutor call runs outside any transaction;
// the write of the version and the transition to `programme_proposed` are one transaction guarded
// by an advisory lock and the expected version. Modules and planning are never touched here.

const PROGRAMME_LOCK = 'programme:';

export function programmeLock(tx: import('@learny/db').DbTx, formationId: string) {
  return tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${PROGRAMME_LOCK} || ${formationId}, 0))
  `);
}

interface CadrageValue {
  value: string | null;
  state: string;
}

function cadrageSummary(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as CadrageValue;
    if (typeof record.value === 'string' && record.value.trim() !== '') result[key] = record.value;
  }
  return result;
}

export function tutorProfile(profile: {
  tone: 'tu' | 'vous';
  courseLanguage: string;
}): TutorProfile {
  const courseLanguage =
    profile.courseLanguage === 'fr' || profile.courseLanguage === 'en'
      ? profile.courseLanguage
      : 'fr';
  return { tone: profile.tone, courseLanguage };
}

/** EF-1 — web results only inform the proposal and never become raw course content (BR-IA-12). */
export async function searchContext(
  ctx: ServiceContext,
  input: { title: string; scope: string | null },
): Promise<string> {
  const { searchWeb } = await import('@learny/tutor');
  const query = [input.title, input.scope, 'programme formation'].filter(Boolean).join(' ');
  const result = await searchWeb(
    {
      task: 'programme',
      userId: ctx.userId ?? '',
      // service-role: model resolution and ai_calls journal are system-owned (SPEC-504).
      db: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    { query: query.slice(0, 300), purpose: 'programme', limit: 5 },
  );
  if (!result.ok) return 'Recherche web indisponible : la proposition repose sur le cadrage seul.';
  if (result.value.results.length === 0) {
    return 'Aucune source web pertinente : la proposition repose sur le cadrage seul.';
  }
  return [
    'Sources web consultées pour la proposition (jamais recopiées dans un cours) :',
    ...result.value.results.map((item) => `- ${item.title} — ${item.url}`),
  ].join('\n');
}

export function generateProposal(
  ctx: ServiceContext,
  formationId: string,
  input: unknown,
): Promise<Result<ProgrammeProposalStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const parsed = GenerateProgrammeInput.parse(input);

    const prepare = await db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if (formation.status === 'active' || formation.status === 'paused') {
        throw new AppError('CONFLICT', 'Cette formation a déjà un programme actif.', {
          status: 409,
        });
      }
      if (formation.status !== 'cadrage' && formation.status !== 'programme_proposed') {
        throw new AppError('CONFLICT', 'Cette formation ne peut plus recevoir de proposition.', {
          status: 409,
        });
      }
      const version = await currentVersion(tx, formationId);
      if (version !== 0 || parsed.expectedVersion !== 0) {
        throw new AppError(
          'CONFLICT',
          version === 0
            ? 'Le programme a changé : rechargez la proposition.'
            : 'Un programme est déjà proposé : ajustez-le avec le tuteur.',
          {
            status: 409,
            errors: [{ path: 'expectedVersion', message: `Version actuelle : ${String(version)}` }],
          },
        );
      }
      const profile = await readProfile(tx, userId);
      return { formation, profile };
    });

    const scope = cadrageSummary(prepare.formation.cadrage_profile).scope ?? null;
    const sources = await searchContext(ctx, {
      title: prepare.formation.title,
      scope,
    });
    const profile = tutorProfile(prepare.profile);
    const runContext: ProgrammeRunContext = {
      userId,
      formationId,
      profile,
      clock: ctx.clock,
      requestId: ctx.requestId,
      llmDb: serviceDb(),
      scenario: programmeScenario('generate', prepare.formation.title),
    };
    const generated = await runProgrammeDraft(runContext, {
      title: prepare.formation.title,
      message: `Conçois le programme complet de la formation « ${prepare.formation.title} » à partir du cadrage figé.`,
      context: JSON.stringify({
        objectifs: prepare.formation.objectives,
        cadrage: cadrageSummary(prepare.formation.cadrage_profile),
        volumeHeures: prepare.formation.volume_hours,
        dateDebut: prepare.formation.start_date,
        dateFin: prepare.formation.end_date,
        sourcesWeb: sources,
      }),
    });
    if (!generated.ok) throw generated.error;
    const payload = normalizeDraft(generated.value.draft);

    await db.run(async (tx) => {
      await programmeLock(tx, formationId);
      const formation = await readFormation(tx, userId, formationId);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      const version = await currentVersion(tx, formationId);
      if (version !== 0 || parsed.expectedVersion !== 0) {
        throw new AppError('CONFLICT', 'Le programme a changé : rechargez la proposition.', {
          status: 409,
          errors: [{ path: 'expectedVersion', message: `Version actuelle : ${String(version)}` }],
        });
      }
      await tx.execute(sql`
        insert into public.programme_proposals (
          formation_id, user_id, version, source, description, volume_hours, summary, payload,
          created_at
        )
        values (
          ${formationId}::uuid,
          ${userId}::uuid,
          1,
          'generated',
          ${payload.description},
          ${payload.volumeHours},
          ${payload.summary},
          ${JSON.stringify(payload)}::jsonb,
          ${ctx.clock.now().toISOString()}::timestamptz
        )
      `);
      await tx.execute(sql`
        update public.formations
        set status = 'programme_proposed',
            description = coalesce(${payload.description}, description),
            volume_hours = coalesce(${payload.volumeHours}, volume_hours),
            start_date = ${payload.modules[0]?.plannedStart ?? null}::date,
            end_date = ${payload.modules.at(-1)?.plannedEnd ?? null}::date,
            default_threshold = ${payload.modules[0]?.threshold ?? 80},
            updated_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
    });

    return db.run((tx) => readProgrammeState(tx, userId, formationId, { completed: true }));
  });
}

/** One adjustment request event per created version (audit trail of SPEC-203). */
export async function emitAdjustmentRequested(
  db: import('@learny/db').UserDatabase,
  input: { userId: string; formationId: string; changeRequestId: string },
): Promise<void> {
  await emitAfterCommit(db, 'formation/programme-requested', input, {
    id: `programme-requested:${input.changeRequestId}`,
  });
}
