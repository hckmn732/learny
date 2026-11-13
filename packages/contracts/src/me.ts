import { z } from 'zod';

import { TaskModelDto } from './ai-credentials';
import { Timezone } from './auth';
import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { COURSE_LANGUAGES, TUTOR_TONES } from './tutor';

// Profile of the authenticated learner (SPEC-601 EF-10; completed by SPEC-602). The verification
// screen only needs `onboardingStep`; the other fields are the ones SPEC-602 persists and reads,
// returned here so the contract does not change between the two specifications.

export const ONBOARDING_STEP_VALUES = [
  'profil',
  'rythme',
  'ia',
  'rappels',
  'depart',
  'done',
] as const;
export const OnboardingStep = z.enum(ONBOARDING_STEP_VALUES);
export type OnboardingStep = z.infer<typeof OnboardingStep>;

/** Steps accepted by `PATCH /me/onboarding` (the entry step is written by the profile trigger). */
export const ONBOARDING_PATCH_STEPS = ['rythme', 'ia', 'rappels', 'depart', 'done'] as const;

export const STUDY_SLOTS = ['matin', 'apres_midi', 'soir'] as const;
export const StudySlot = z.enum(STUDY_SLOTS);
export type StudySlot = z.infer<typeof StudySlot>;

export const MeDto = z.object({
  id: Uuid,
  email: z.email(),
  firstName: z.string().min(1).max(60).nullable(),
  lastName: z.string().min(1).max(60).nullable(),
  tutorTone: z.enum(TUTOR_TONES),
  courseLanguage: z.enum(COURSE_LANGUAGES),
  timezone: z.string().min(1).max(64),
  onboardingStep: OnboardingStep,
  onboardingCompletedAt: IsoDateTime.nullable(),
  currentFormationId: Uuid.nullable(),
});
export type MeDto = z.infer<typeof MeDto>;

/** EF-3 to EF-7 — one PATCH edits only the transmitted profile fields. */
export const ProfileUpdateBody = z
  .object({
    firstName: z.string().trim().min(1).max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    tutorTone: z.enum(TUTOR_TONES).optional(),
    courseLanguage: z.enum(COURSE_LANGUAGES).optional(),
    timezone: Timezone.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'au moins un champ du profil est attendu',
  });
export type ProfileUpdateBody = z.infer<typeof ProfileUpdateBody>;

/** BR-ACC-08 — rhythm of the learner, default of every new formation. */
export const StudyPreferencesDto = z.object({
  hoursPerDay: z.int().min(1).max(6),
  studyDays: z
    .array(z.int().min(1).max(7))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'les jours doivent être uniques'),
  preferredSlots: z.array(StudySlot).min(1).max(3),
});
export type StudyPreferencesDto = z.infer<typeof StudyPreferencesDto>;

/** ET-1 — the PATCH replaces the three rhythm values; the server refuses an empty list (CL-11). */
export const StudyPreferencesUpdateBody = StudyPreferencesDto.refine(
  (value) => new Set(value.preferredSlots).size === value.preferredSlots.length,
  { path: ['preferredSlots'], message: 'les moments doivent être uniques' },
);
export type StudyPreferencesUpdateBody = z.infer<typeof StudyPreferencesUpdateBody>;

/** EF-10 — three switches of the rappels screen. */
export const ReminderChoices = z.object({
  push: z.boolean(),
  email: z.boolean(),
  automations: z.boolean(),
});
export type ReminderChoices = z.infer<typeof ReminderChoices>;

export const OnboardingUpdateBody = z
  .object({
    step: z.enum(ONBOARDING_PATCH_STEPS),
    /** EF-8 — the learner declares that the provided AI is the chosen model. */
    aiChoice: z.literal('managed').optional(),
    reminders: ReminderChoices.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reminders !== undefined && value.step !== 'depart') {
      ctx.addIssue({
        code: 'custom',
        path: ['reminders'],
        message: 'les rappels ne sont acceptés qu’avec l’étape depart',
      });
    }
  });
export type OnboardingUpdateBody = z.infer<typeof OnboardingUpdateBody>;

export const OnboardingUpdateOutput = z.object({ onboardingStep: OnboardingStep });
export type OnboardingUpdateOutput = z.infer<typeof OnboardingUpdateOutput>;

/** ET-1 — one personal model assigned to one task (SPEC-506/602). */
export const TaskModelUpdateBody = TaskModelDto.extend({ credentialId: Uuid });
export type TaskModelUpdateBody = z.infer<typeof TaskModelUpdateBody>;

export const meGet = defineRoute({
  id: 'me.get',
  method: 'GET',
  path: '/api/v1/me',
  auth: 'user',
  output: MeDto,
  successStatus: 200,
  summary: 'Profil du seul utilisateur connecté, y compris son étape d’onboarding (SPEC-601).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

export const meUpdate = defineRoute({
  id: 'me.update',
  method: 'PATCH',
  path: '/api/v1/me',
  auth: 'user',
  body: ProfileUpdateBody,
  output: MeDto,
  successStatus: 200,
  summary: 'Met à jour le prénom, le ton, la langue des cours ou le fuseau du profil (SPEC-602).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND'],
});

export const mePreferencesGet = defineRoute({
  id: 'me.preferences.get',
  method: 'GET',
  path: '/api/v1/me/preferences',
  auth: 'user',
  output: StudyPreferencesDto,
  successStatus: 200,
  summary: 'Lit le rythme d’étude du profil (SPEC-602).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND'],
});

export const mePreferencesUpdate = defineRoute({
  id: 'me.preferences.update',
  method: 'PATCH',
  path: '/api/v1/me/preferences',
  auth: 'user',
  body: StudyPreferencesUpdateBody,
  output: StudyPreferencesDto,
  successStatus: 200,
  summary: 'Enregistre le rythme d’étude : heures, jours et moments (SPEC-602).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND'],
});

export const meOnboardingUpdate = defineRoute({
  id: 'me.onboarding.update',
  method: 'PATCH',
  path: '/api/v1/me/onboarding',
  auth: 'user',
  body: OnboardingUpdateBody,
  output: OnboardingUpdateOutput,
  successStatus: 200,
  summary: 'Avance l’onboarding sans jamais reculer et applique les rappels (SPEC-602).',
  errors: ['VALIDATION_FAILED', 'ONBOARDING_AI_REQUIRED', 'UNAUTHENTICATED', 'NOT_FOUND'],
});

export const meAiTaskModelsUpdate = defineRoute({
  id: 'me.ai.task-models.update',
  method: 'PUT',
  path: '/api/v1/me/ai/task-models',
  auth: 'user',
  body: TaskModelUpdateBody,
  output: TaskModelDto,
  successStatus: 200,
  summary: 'Affecte un modèle personnel qualifié à une tâche du tuteur (SPEC-506/602).',
  errors: [
    'VALIDATION_FAILED',
    'CREDENTIAL_NOT_FOUND',
    'AI_MODEL_NOT_QUALIFIED',
    'UNAUTHENTICATED',
  ],
});

export const meRoutes = {
  meGet,
  meUpdate,
  mePreferencesGet,
  mePreferencesUpdate,
  meOnboardingUpdate,
  meAiTaskModelsUpdate,
} as const;
