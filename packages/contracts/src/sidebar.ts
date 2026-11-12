import { z } from 'zod';

import { CivilDate, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the application shell sidebar (SPEC-304 ET-1, ET-3, ET-4; BR-NAV-02, BR-NAV-03,
// BR-PRO-04, BR-FOR-11). The DTO is read server-side by the shell and refreshed in the browser
// through `/api/v1/me/sidebar`. The streak block is provisional and will be replaced by the
// contract of SPEC-723 (`GET /api/v1/streak`) without changing the sidebar fields used here.

/** ADR-0162 — accent palette of a formation; `indigo` is the fallback until SPEC-603. */
export const FORMATION_ACCENTS = ['indigo', 'green', 'orange', 'violet', 'teal'] as const;
export const FormationAccent = z.enum(FORMATION_ACCENTS);
export type FormationAccent = z.infer<typeof FormationAccent>;

/** ADR-0162 — a visible sigil has at most three characters, two with the fallback. */
export const FORMATION_MONOGRAM_MAX_LENGTH = 3;

export const SidebarFormation = z.object({
  id: Uuid,
  title: z.string().min(1).max(120),
  /** Sigil shown in the formation card and in the switcher (ADR-0162). */
  monogram: z.string().min(1).max(FORMATION_MONOGRAM_MAX_LENGTH),
  accent: FormationAccent,
  /** Only active and paused formations are listed (BR-FOR-11). */
  status: z.enum(['active', 'paused']),
  /** BR-PRO-01 — validated modules out of all modules, rounded to the nearest integer. */
  progressPercent: z.number().int().min(0).max(100),
  /** Position of the open module, or null when none is open. */
  currentModulePosition: z.number().int().min(1).nullable(),
  moduleCount: z.number().int().min(0),
});
export type SidebarFormation = z.infer<typeof SidebarFormation>;

export const STREAK_DAY_STATUSES = ['done', 'none', 'neutral'] as const;
export const StreakDayStatus = z.enum(STREAK_DAY_STATUSES);
export type StreakDayStatus = z.infer<typeof StreakDayStatus>;

/** BR-GAM-02 — one box of the 14-day regularity strip (provisional until SPEC-723). */
export const StreakDay = z.object({
  date: CivilDate,
  status: StreakDayStatus,
});
export type StreakDay = z.infer<typeof StreakDay>;

export const SidebarStreak = z.object({
  days: z.number().int().min(0),
  regularity: z.array(StreakDay).length(14),
});
export type SidebarStreak = z.infer<typeof SidebarStreak>;

export const SidebarDto = z.object({
  collapsed: z.boolean(),
  /** Current formation: only an active formation is rendered here (ET-1, BR-FOR-11). */
  currentFormation: SidebarFormation.nullable(),
  /** Active and paused formations offered by “Changer de formation”. */
  formations: z.array(SidebarFormation),
  /** BR-NAV-02 — notions of the current formation due for the global quiz. */
  quizDueCount: z.number().int().min(0),
  /** BR-NAV-02 — open gaps of the current formation. */
  gapCount: z.number().int().min(0),
  streak: SidebarStreak,
});
export type SidebarDto = z.infer<typeof SidebarDto>;

/** PATCH body: at least one preference must be given. */
export const SidebarUpdateInput = z
  .object({
    collapsed: z.boolean().optional(),
    currentFormationId: Uuid.optional(),
  })
  .refine((value) => value.collapsed !== undefined || value.currentFormationId !== undefined, {
    message: 'Indiquez le menu masqué ou la formation courante.',
  });
export type SidebarUpdateInput = z.infer<typeof SidebarUpdateInput>;

export const sidebarGet = defineRoute({
  id: 'sidebar.get',
  method: 'GET',
  path: '/api/v1/me/sidebar',
  auth: 'user',
  output: SidebarDto,
  successStatus: 200,
  summary:
    'Menu latéral du seul utilisateur connecté : formation courante, formations actives et en pause, compteurs et série (SPEC-304).',
  errors: ['UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const sidebarUpdate = defineRoute({
  id: 'sidebar.update',
  method: 'PATCH',
  path: '/api/v1/me/sidebar',
  auth: 'user',
  body: SidebarUpdateInput,
  output: SidebarDto,
  successStatus: 200,
  summary:
    'Mémorise le masquage du menu ou la formation courante de l’utilisateur connecté, puis renvoie le menu à jour (SPEC-304).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const sidebarRoutes = { sidebarGet, sidebarUpdate } as const;
