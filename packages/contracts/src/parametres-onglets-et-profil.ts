import { z } from 'zod';

import { Timezone } from './auth';
import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { MeDto, StudyPreferencesDto } from './me';
import { ExportStatus } from './personal-data';
import { COURSE_LANGUAGES, TUTOR_TONES, type CourseLanguage, type TutorTone } from './tutor';

// Contracts of the settings screen (SPEC-707 ET-1, ET-3, ET-5; BR-SET-01, BR-SET-02, BR-ACC-05 to
// BR-ACC-08, BR-ACC-10 to BR-ACC-12). The four ARIA tabs are a pure rule of the screen; the saved
// payload reuses the bounds of SPEC-602 (`ProfileUpdateBody`, `StudyPreferencesDto`) and adds the
// optimistic version of ET-3. Export and deletion stay owned by SPEC-211: their DTOs are only
// mirrored here as read-only state.

/** BR-SET-01 — the four tabs, in mockup order; the hash mirrors the active tab. */
export const SETTINGS_TAB_IDS = ['profil', 'notifications', 'automatismes', 'modeles'] as const;
export const SettingsTab = z.enum(SETTINGS_TAB_IDS);
export type SettingsTab = z.infer<typeof SettingsTab>;

/** BR-SET-01 — Profil is the default tab. */
export const SETTINGS_DEFAULT_TAB: SettingsTab = 'profil';

/** CL-3 — an unknown or missing hash opens Profil and normalises the URL. */
export function settingsTabFromHash(hash: string | null | undefined): SettingsTab {
  const raw = (hash ?? '').replace(/^#/, '').toLowerCase();
  return (SETTINGS_TAB_IDS as readonly string[]).includes(raw)
    ? (raw as SettingsTab)
    : SETTINGS_DEFAULT_TAB;
}

/**
 * BR-ACC-08 — study rhythm of the profile. Same bounds as the rhythm of SPEC-602: one source of
 * truth, no duplicated schema (ET-3).
 */
export const StudyRhythm = StudyPreferencesDto;
export type StudyRhythm = StudyPreferencesDto;

/**
 * ET-3 — body of `PATCH /me/profile`: at least one field, the rhythm embedded, and the expected
 * version of the profile row for the optimistic concurrency of CL-2. The e-mail is never
 * accepted: it is read-only in V1 (BR-ACC-12).
 */
export const ProfilePatch = z
  .object({
    firstName: z.string().trim().min(1).max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    tutorTone: z.enum(TUTOR_TONES).optional(),
    courseLanguage: z.enum(COURSE_LANGUAGES).optional(),
    /** BR-ACC-07 — a valid IANA name, validated like the rest of the application. */
    timezone: Timezone.optional(),
    rhythm: StudyRhythm.optional(),
    /** `updatedAt` of the profile as read by the caller; a stale value answers 409. */
    expectedUpdatedAt: IsoDateTime.optional(),
  })
  .refine(
    (value) =>
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.tutorTone !== undefined ||
      value.courseLanguage !== undefined ||
      value.timezone !== undefined ||
      value.rhythm !== undefined,
    { message: 'au moins un champ du profil est attendu' },
  );
export type ProfilePatch = z.infer<typeof ProfilePatch>;

/** BR-ACC-10 — read-only mirror of the latest export of SPEC-211 (no signed URL here). */
export const SettingsExportState = z.object({
  id: Uuid,
  status: ExportStatus,
  sizeBytes: z.int().min(0).nullable(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
});
export type SettingsExportState = z.infer<typeof SettingsExportState>;

/** Data of the settings screen: profile, rhythm and the state of « Données et confidentialité ». */
export const SettingsState = z.object({
  me: MeDto,
  rhythm: StudyRhythm,
  /** ET-3 — current version of the profile row, sent back as `expectedUpdatedAt`. */
  updatedAt: IsoDateTime,
  /** BR-ACC-11 — deadline of a pending deletion request, null when nothing is scheduled. */
  deletionScheduledFor: IsoDateTime.nullable(),
  /** Latest export of the learner, null when none was requested. */
  export: SettingsExportState.nullable(),
});
export type SettingsState = z.infer<typeof SettingsState>;

export const meProfileGet = defineRoute({
  id: 'me.profile.get',
  method: 'GET',
  path: '/api/v1/me/profile',
  auth: 'user',
  output: SettingsState,
  successStatus: 200,
  summary:
    'État de l’écran Paramètres : profil, rythme, export le plus récent et suppression programmée (SPEC-707).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND'],
});

export const meProfileUpdate = defineRoute({
  id: 'me.profile.update',
  method: 'PATCH',
  path: '/api/v1/me/profile',
  auth: 'user',
  body: ProfilePatch,
  output: SettingsState,
  successStatus: 200,
  summary:
    'Enregistre le profil et le rythme en une transaction, avec la version attendue du profil (SPEC-707).',
  errors: ['VALIDATION_FAILED', 'CONFLICT', 'NOT_FOUND', 'UNAUTHENTICATED'],
});

export const parametresRoutes = { meProfileGet, meProfileUpdate } as const;

// Re-exports used by the screen without importing a second module (BR-ACC-05, BR-ACC-06).
export { TUTOR_TONES as SETTINGS_TUTOR_TONES, COURSE_LANGUAGES as SETTINGS_COURSE_LANGUAGES };
export type { TutorTone, CourseLanguage };
