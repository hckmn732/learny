// Settings screen service (SPEC-707 EF-1 to EF-5, ET-1 to ET-5; BR-SET-01, BR-SET-02, BR-ACC-05
// to BR-ACC-08, BR-ACC-10 to BR-ACC-12).
//
// Everything is read and written with the learner's own RLS client (`ctx.db`): another learner's
// profile, rhythm, export or deletion request never reaches the DTO. `PATCH /me/profile` writes
// the profile and the rhythm in ONE transaction with the expected version of ET-3; a stale
// version answers 409 and nothing is written (CL-2). Export and deletion stay owned by SPEC-211:
// this service only mirrors their current state.
import { desc, eq } from 'drizzle-orm';

import {
  ProfilePatch,
  SettingsState as SettingsStateSchema,
  type SettingsExportState,
  type SettingsState,
} from '@learny/contracts';
import { AppError, formatUserDate, type Result } from '@learny/core';
import { schema, sql, type DbTx } from '@learny/db';

import type { ServiceContext } from './context';
import { readMe } from './me';
import { requireUser, toResult } from './resources/result';

const { dataExports, profiles, studyPreferences } = schema;

/** Validation failure of the screen body, with the field paths the form highlights (CL-4). */
function validationFailure(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    status: 400,
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

/** First validation issue of the body, for the form and the tests. */
export function validationIssue(error: unknown): { path: string; message: string } | null {
  if (!(error instanceof AppError)) return null;
  const issue = error.errors?.[0];
  return issue === undefined ? null : { path: issue.path, message: issue.message };
}

/** Parses the PATCH body with the shared contract; an invalid payload writes nothing (CL-1). */
export function parseProfilePatch(input: unknown): ProfilePatch {
  const parsed = ProfilePatch.safeParse(input);
  if (!parsed.success) {
    throw validationFailure(parsed.error);
  }
  return parsed.data;
}

async function readRhythm(tx: DbTx, userId: string): Promise<SettingsState['rhythm']> {
  const [row] = await tx
    .select({
      hoursPerDay: studyPreferences.hoursPerDay,
      studyDays: studyPreferences.studyDays,
      preferredSlots: studyPreferences.preferredSlots,
    })
    .from(studyPreferences)
    .where(eq(studyPreferences.userId, userId))
    .limit(1);
  if (row === undefined) {
    throw new AppError('NOT_FOUND', 'Préférences introuvables.');
  }
  return {
    hoursPerDay: row.hoursPerDay,
    studyDays: row.studyDays,
    preferredSlots: [...row.preferredSlots],
  };
}

async function readLatestExport(tx: DbTx, userId: string): Promise<SettingsExportState | null> {
  const [row] = await tx
    .select({
      id: dataExports.id,
      status: dataExports.status,
      sizeBytes: dataExports.sizeBytes,
      createdAt: dataExports.createdAt,
      expiresAt: dataExports.expiresAt,
    })
    .from(dataExports)
    .where(eq(dataExports.userId, userId))
    .orderBy(desc(dataExports.createdAt))
    .limit(1);
  if (row === undefined) return null;
  return {
    id: row.id,
    status: row.status,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

async function readProfileState(
  tx: DbTx,
  userId: string,
): Promise<{
  updatedAt: Date;
  createdAt: Date;
  activeFormationCount: number;
  deletionScheduledFor: Date | null;
}> {
  const rows = await tx.execute<{
    updated_at: Date;
    created_at: Date;
    deletion_scheduled_for: Date | null;
    active_formation_count: number;
  }>(sql`
    select p.updated_at as updated_at,
           p.created_at as created_at,
           p.deletion_scheduled_for as deletion_scheduled_for,
           (select count(*)::int from public.formations f
             where (f.owner_id = ${userId}::uuid
                    or (f.group_id is not null and public.is_group_member(f.group_id)))
               and f.status = 'active') as active_formation_count
      from public.profiles p
     where p.id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return {
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    activeFormationCount: row.active_formation_count,
    deletionScheduledFor: row.deletion_scheduled_for,
  };
}

/** Everything the screen renders, read in one RLS transaction (ET-1, ET-3). */
export async function readSettingsState(tx: DbTx, userId: string): Promise<SettingsState> {
  const me = await readMe(tx, userId);
  const rhythm = await readRhythm(tx, userId);
  const profile = await readProfileState(tx, userId);
  const latest = await readLatestExport(tx, userId);
  const parsed = SettingsStateSchema.safeParse({
    me,
    rhythm,
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt,
    activeFormationCount: profile.activeFormationCount,
    deletionScheduledFor: profile.deletionScheduledFor,
    export: latest,
  });
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'État des paramètres incohérent.');
  }
  return parsed.data;
}

/** GET /api/v1/me/profile — the settings state of the authenticated learner (EF-2, EF-4). */
export function getSettingsState(ctx: ServiceContext): Promise<Result<SettingsState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readSettingsState(tx, userId));
  });
}

/**
 * PATCH /api/v1/me/profile — saves identity, language, tone, zone and rhythm in one transaction
 * (ET-3). The version check runs on the locked row: a stale `expectedUpdatedAt` answers 409
 * `CONFLICT` and leaves every row untouched (CL-2); the caller refetches to restore the current
 * state. Changing the zone or the rhythm takes effect for the next reads: the screen refreshes
 * the timezone-dependent views after the answer.
 */
export function updateSettingsProfile(
  ctx: ServiceContext,
  input: unknown,
): Promise<Result<SettingsState>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const value = parseProfilePatch(input);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const [current] = await tx
        .select({ updatedAt: profiles.updatedAt })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .for('update')
        .limit(1);
      if (current === undefined) {
        throw new AppError('NOT_FOUND', 'Profil introuvable.');
      }
      if (
        value.expectedUpdatedAt !== undefined &&
        current.updatedAt.toISOString() !== value.expectedUpdatedAt
      ) {
        throw new AppError('CONFLICT', 'Le profil a été modifié ailleurs. Rechargez vos réglages.');
      }
      await tx
        .update(profiles)
        .set({
          ...(value.firstName === undefined ? {} : { firstName: value.firstName }),
          ...(value.lastName === undefined ? {} : { lastName: value.lastName }),
          ...(value.tutorTone === undefined ? {} : { tutorTone: value.tutorTone }),
          ...(value.courseLanguage === undefined ? {} : { courseLanguage: value.courseLanguage }),
          ...(value.timezone === undefined ? {} : { timezone: value.timezone }),
          updatedAt: now,
        })
        .where(eq(profiles.id, userId));
      if (value.rhythm !== undefined) {
        await tx
          .insert(studyPreferences)
          .values({
            userId,
            hoursPerDay: value.rhythm.hoursPerDay,
            studyDays: value.rhythm.studyDays,
            preferredSlots: value.rhythm.preferredSlots,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: studyPreferences.userId,
            set: {
              hoursPerDay: value.rhythm.hoursPerDay,
              studyDays: value.rhythm.studyDays,
              preferredSlots: value.rhythm.preferredSlots,
              updatedAt: now,
            },
          });
      }
      return readSettingsState(tx, userId);
    });
  });
}

/**
 * BR-ACC-11 — local label of the deletion deadline, computed by `@learny/core/time` in the
 * profile zone (« vendredi 11 décembre à 13:20 » with the frozen clock of ADR-0047).
 */
export function formatDeletionDeadline(scheduledFor: string, timeZone: string): string {
  return formatUserDate(scheduledFor, timeZone, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
