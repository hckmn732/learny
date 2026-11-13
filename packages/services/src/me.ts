// Profile of the authenticated learner (SPEC-601 EF-10, completed by SPEC-602). Everything is read
// with the learner's own RLS client: another learner's profile never reaches the DTO.
import type { MeDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

interface MeRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tutor_tone: 'vous' | 'tu';
  course_language: 'fr' | 'en' | 'es' | 'de';
  timezone: string;
  onboarding_step: 'profil' | 'rythme' | 'ia' | 'rappels' | 'depart' | 'done';
  onboarding_completed_at: Date | null;
  current_formation_id: string | null;
  [key: string]: unknown;
}

function toMe(row: MeRow): MeDto {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name === null || row.first_name.trim() === '' ? null : row.first_name,
    lastName: row.last_name === null || row.last_name.trim() === '' ? null : row.last_name,
    tutorTone: row.tutor_tone,
    courseLanguage: row.course_language,
    timezone: row.timezone,
    onboardingStep: row.onboarding_step,
    onboardingCompletedAt: row.onboarding_completed_at?.toISOString() ?? null,
    currentFormationId: row.current_formation_id,
  };
}

/** Profile DTO read inside an existing transaction (SPEC-602 reuses it for its state). */
export async function readMe(tx: DbTx, userId: string): Promise<MeDto> {
  const rows = await tx.execute<MeRow>(sql`
    select id::text as id,
           email,
           first_name,
           last_name,
           tutor_tone::text as tutor_tone,
           course_language::text as course_language,
           timezone,
           onboarding_step::text as onboarding_step,
           onboarding_completed_at,
           current_formation_id::text as current_formation_id
      from public.profiles
     where id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return toMe(row);
}

/** GET /api/v1/me — the authenticated learner's profile (EF-10). */
export function getMe(ctx: ServiceContext): Promise<Result<MeDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readMe(tx, userId));
  });
}
