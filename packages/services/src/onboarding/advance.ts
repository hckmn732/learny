// Advancement of the onboarding and first profile/preference writes (SPEC-602 ET-1, ET-2, EF-1,
// EF-8, EF-10, EF-13; ADR-0160).
//
// The stored step is monotone: `max(stored, requested)`. Side effects of a request still apply when
// the step does not move (a reminder change or the move to the provided AI must not be lost). The
// completion event is written in the same transaction as `profiles.onboarding_completed_at`, with a
// stable identifier, so two clicks can never emit it twice.
import { eq } from 'drizzle-orm';

import {
  OnboardingUpdateBody,
  ProfileUpdateBody,
  StudyPreferencesUpdateBody,
  type MeDto,
  type OnboardingUpdateOutput,
  type StudyPreferencesDto,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { aiCredentials, aiTaskModels, schema, sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { readMe } from '../me';
import { requireUser, toResult } from '../resources/result';

import { applyReminderChoicesInTx } from './state';

const { profiles, studyPreferences } = schema;

const RANK = {
  profil: 0,
  rythme: 1,
  ia: 2,
  rappels: 3,
  depart: 4,
  done: 5,
} as const;

type Step = keyof typeof RANK;

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

interface ParseIssue {
  path: PropertyKey[];
  message: string;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: { issues: ParseIssue[] };
}

interface SafeParseLike<T> {
  safeParse: (value: unknown) => ParseResult<T>;
}

function parse<T>(schemaValue: SafeParseLike<T>, input: unknown): T {
  const parsed = schemaValue.safeParse(input);
  if (!parsed.success || parsed.data === undefined) {
    throw validationFailure(parsed.error ?? { issues: [] });
  }
  return parsed.data;
}

/** ET-1 — profile fields of the first step (EF-3, EF-4, BR-ACC-05 to BR-ACC-07). */
export function updateProfile(ctx: ServiceContext, input: unknown): Promise<Result<MeDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const value = parse(ProfileUpdateBody, input);
    return db.run(async (tx) => {
      const updated = await tx
        .update(profiles)
        .set({
          ...(value.firstName === undefined ? {} : { firstName: value.firstName }),
          ...(value.lastName === undefined ? {} : { lastName: value.lastName }),
          ...(value.tutorTone === undefined ? {} : { tutorTone: value.tutorTone }),
          ...(value.courseLanguage === undefined ? {} : { courseLanguage: value.courseLanguage }),
          ...(value.timezone === undefined ? {} : { timezone: value.timezone }),
          updatedAt: ctx.clock.now(),
        })
        .where(eq(profiles.id, userId))
        .returning({ id: profiles.id });
      if (updated.length === 0) throw new AppError('NOT_FOUND', 'Profil introuvable.');
      return readMe(tx, userId);
    });
  });
}

/** ET-1 — current rhythm of the learner. */
export function getStudyPreferences(ctx: ServiceContext): Promise<Result<StudyPreferencesDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const [row] = await tx
        .select({
          hoursPerDay: studyPreferences.hoursPerDay,
          studyDays: studyPreferences.studyDays,
          preferredSlots: studyPreferences.preferredSlots,
        })
        .from(studyPreferences)
        .where(eq(studyPreferences.userId, userId))
        .limit(1);
      if (row === undefined) throw new AppError('NOT_FOUND', 'Préférences introuvables.');
      return {
        hoursPerDay: row.hoursPerDay,
        studyDays: row.studyDays,
        preferredSlots: row.preferredSlots,
      };
    });
  });
}

/** ET-1 — the PATCH replaces the three values, validated by the contract (BR-ACC-08, CL-11). */
export function updateStudyPreferences(
  ctx: ServiceContext,
  input: unknown,
): Promise<Result<StudyPreferencesDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const value = parse(StudyPreferencesUpdateBody, input);
    return db.run(async (tx) => {
      const [row] = await tx
        .insert(studyPreferences)
        .values({
          userId,
          hoursPerDay: value.hoursPerDay,
          studyDays: value.studyDays,
          preferredSlots: value.preferredSlots,
          updatedAt: ctx.clock.now(),
        })
        .onConflictDoUpdate({
          target: studyPreferences.userId,
          set: {
            hoursPerDay: value.hoursPerDay,
            studyDays: value.studyDays,
            preferredSlots: value.preferredSlots,
            updatedAt: ctx.clock.now(),
          },
        })
        .returning({
          hoursPerDay: studyPreferences.hoursPerDay,
          studyDays: studyPreferences.studyDays,
          preferredSlots: studyPreferences.preferredSlots,
        });
      if (row === undefined) throw new AppError('NOT_FOUND', 'Préférences introuvables.');
      return {
        hoursPerDay: row.hoursPerDay,
        studyDays: row.studyDays,
        preferredSlots: row.preferredSlots,
      };
    });
  });
}

async function hasFiveQualifiedAssignments(tx: DbTx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ tasks: sql<number>`count(distinct ${aiTaskModels.task})::int` })
    .from(aiTaskModels)
    .innerJoin(
      aiCredentials,
      sql`${aiCredentials.id} = ${aiTaskModels.credentialId}
          and ${aiCredentials.userId} = ${userId}::uuid
          and ${aiCredentials.status} = 'qualified'`,
    )
    .where(eq(aiTaskModels.userId, userId));
  return (row?.tasks ?? 0) >= 5;
}

/**
 * EF-1, EF-8, EF-10, EF-13 — moves the onboarding forward, applies the side effects and emits the
 * completion event exactly once. The profile row is locked for the whole transaction.
 */
export function advanceOnboarding(
  ctx: ServiceContext,
  input: unknown,
): Promise<Result<OnboardingUpdateOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const value = parse(OnboardingUpdateBody, input);
    const now = ctx.clock.now();
    return withTransaction(db, async (tx, outbox) => {
      const [current] = await tx
        .select({
          step: profiles.onboardingStep,
          completedAt: profiles.onboardingCompletedAt,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .for('update')
        .limit(1);
      if (current === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');

      const requested = value.step as Step;
      const stored = current.step;
      const crossesIa = RANK[stored] < RANK.rappels && RANK[requested] >= RANK.rappels;

      // EF-8 — declaring the provided AI is the only way to cross the IA step without assignments;
      // it also removes the personal assignments (back to the provided defaults).
      if (value.aiChoice === 'managed') {
        await tx.delete(aiTaskModels).where(eq(aiTaskModels.userId, userId));
      }
      if (crossesIa && value.aiChoice !== 'managed') {
        const ready = await hasFiveQualifiedAssignments(tx, userId);
        if (!ready) {
          throw new AppError(
            'ONBOARDING_AI_REQUIRED',
            'Testez une clé personnelle et affectez-la aux cinq tâches, ou choisissez l’IA fournie.',
            { status: 422 },
          );
        }
      }

      if (value.reminders !== undefined) {
        await applyReminderChoicesInTx(tx, userId, value.reminders, now);
      }

      const next: Step = RANK[requested] > RANK[stored] ? requested : stored;
      const completes = next === 'done' && current.completedAt === null;
      const completedAt = completes ? now : current.completedAt;
      if (next !== stored || completes) {
        await tx
          .update(profiles)
          .set({
            onboardingStep: next,
            ...(completes ? { onboardingCompletedAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(profiles.id, userId));
      }
      if (completes) {
        outbox.add(
          'user/onboarding-completed',
          { userId, completedAt: (completedAt ?? now).toISOString() },
          { id: `user-onboarding-completed:${userId}` },
        );
      }
      return { onboardingStep: next };
    });
  });
}
