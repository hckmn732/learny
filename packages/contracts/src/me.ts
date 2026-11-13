import { z } from 'zod';

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

export const meRoutes = { meGet } as const;
