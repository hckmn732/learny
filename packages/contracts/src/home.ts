import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contract of the home screen (SPEC-603 ET-1, BR-PRO-02, BR-PRO-03, BR-FOR-13, BR-FOR-16).
// One read-only call returns the current day, the retention indicators, the global quiz preview
// and both formation tabs. Everything is computed server-side from the learner's own RLS client:
// the browser only formats and refreshes. No identifier of another learner can appear here.

/** ET-5 — the twelve kinds of schedule slots, as shown by the day card and the agenda. */
export const HOME_SLOT_KINDS = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'revision',
  'sprint',
  'micro_session',
  'warmup',
  'mock_exam',
  'buffer',
  'weekly_review',
] as const;
export const HomeSlotKind = z.enum(HOME_SLOT_KINDS);
export type HomeSlotKind = z.infer<typeof HomeSlotKind>;

/** EF-2 — display state of a slot; `next` is the single highlighted line of the day. */
export const HOME_SLOT_STATES = ['done', 'next', 'ongoing', 'todo', 'missed', 'upcoming'] as const;
export const HomeSlotState = z.enum(HOME_SLOT_STATES);
export type HomeSlotState = z.infer<typeof HomeSlotState>;

export const HomeSlot = z.object({
  id: Uuid,
  formationId: Uuid,
  kind: HomeSlotKind,
  title: z.string().min(1).max(200),
  meta: z.string().max(1000).nullable(),
  /** Local display time, « HH:MM » in the learner's zone. */
  time: z.string().regex(/^\d{2}:\d{2}$/),
  moduleId: Uuid.nullable(),
  activityId: Uuid.nullable(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  status: z.enum(['planned', 'done', 'missed']),
  state: HomeSlotState,
  /** Rounded-up minutes until the highlighted slot; null for every other state. */
  minutesUntil: z.number().int().min(0).nullable(),
  href: z.string().min(1),
});
export type HomeSlot = z.infer<typeof HomeSlot>;

export const HomeAction = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1),
});
export type HomeAction = z.infer<typeof HomeAction>;

export const HomeToday = z.object({
  date: CivilDate,
  /** EF-1 — « Mercredi 11 novembre », in the learner's time zone. */
  label: z.string().min(1),
  /** EF-2 — planned study minutes of the day, excluding the daily global quiz. */
  plannedMinutes: z.number().int().min(0),
  doneMinutes: z.number().int().min(0),
  slots: z.array(HomeSlot),
  primaryAction: HomeAction.nullable(),
});
export type HomeToday = z.infer<typeof HomeToday>;

export const HomeRetention = z.object({
  /** Whole percentages, or null when nothing has been measured yet (EF-3). */
  oneMonth: z.number().int().min(0).max(100).nullable(),
  twoMonths: z.number().int().min(0).max(100).nullable(),
});
export type HomeRetention = z.infer<typeof HomeRetention>;

export const HomeGlobalQuiz = z.object({
  formationId: Uuid,
  formationTitle: z.string().min(1).max(120),
  notionCount: z.number().int().min(0),
  gamesCount: z.number().int().min(0),
  durationMin: z.number().int().min(0),
  hasGaps: z.boolean(),
  deferred: z
    .object({
      dueCount: z.number().int().min(0),
      deferredCount: z.number().int().min(0),
      deferredTo: CivilDate,
      /** « jeudi » within six days, « jeu. 19 nov. » afterwards. */
      dayLabel: z.string().min(1).max(40),
      capMin: z.number().int().min(1),
    })
    .nullable(),
  nextReviewOn: CivilDate.nullable(),
});
export type HomeGlobalQuiz = z.infer<typeof HomeGlobalQuiz>;

export const HOME_MODULE_STATUS_TONES = ['green', 'indigo', 'violet', 'orange'] as const;
export const HomeModuleStatusTone = z.enum(HOME_MODULE_STATUS_TONES);
export type HomeModuleStatusTone = z.infer<typeof HomeModuleStatusTone>;

export const HomeModuleStatus = z.object({
  label: z.string().min(1).max(40),
  tone: HomeModuleStatusTone,
});
export type HomeModuleStatus = z.infer<typeof HomeModuleStatus>;

export const HomeNextActivity = z.object({
  /** « Aujourd'hui, 14:00 », « Demain, 17:30 » or « jeu. 12 nov., 09:00 ». */
  when: z.string().min(1).max(60),
  /** Type label, with the chapter for contributions (« Apports, chapitre 2 »). */
  detail: z.string().min(1).max(80),
});
export type HomeNextActivity = z.infer<typeof HomeNextActivity>;

export const OngoingFormationRow = z.object({
  id: Uuid,
  monogram: z.string().min(1).max(3),
  accent: z.enum(['indigo', 'green', 'orange', 'violet', 'teal']),
  status: z.enum(['active', 'paused', 'programme_proposed', 'cadrage']),
  title: z.string().min(1).max(120),
  /** EF-6 — objective labels joined by « · ». */
  subtitle: z.string().min(1).max(200),
  progressPercent: z.number().int().min(0).max(100),
  modulePosition: z.number().int().min(1).nullable(),
  moduleCount: z.number().int().min(0),
  moduleTitle: z.string().min(1).max(160).nullable(),
  moduleStatus: HomeModuleStatus.nullable(),
  nextActivity: HomeNextActivity.nullable(),
  endDate: CivilDate.nullable(),
  action: HomeAction,
  /** Black button for the first row, outline for the others. */
  primaryAction: z.boolean(),
});
export type OngoingFormationRow = z.infer<typeof OngoingFormationRow>;

export const CompletedFormationRow = z.object({
  id: Uuid,
  monogram: z.string().min(1).max(3),
  accent: z.enum(['indigo', 'green', 'orange', 'violet', 'teal']),
  status: z.literal('completed'),
  title: z.string().min(1).max(120),
  subtitle: z.string().min(1).max(200),
  resultPercent: z.number().int().min(0).max(100).nullable(),
  retentionPercent: z.number().int().min(0).max(100).nullable(),
  dueCount: z.number().int().min(0),
  maintenanceMode: z.enum(['light', 'stopped']).nullable(),
  completedOn: CivilDate.nullable(),
  weeks: z.number().int().min(0).nullable(),
  volumeHours: z.number().int().min(0).nullable(),
  action: HomeAction,
});
export type CompletedFormationRow = z.infer<typeof CompletedFormationRow>;

export const HomeDto = z.object({
  today: HomeToday,
  retention: HomeRetention,
  globalQuiz: HomeGlobalQuiz.nullable(),
  formations: z.object({
    ongoing: z.array(OngoingFormationRow),
    completed: z.array(CompletedFormationRow),
  }),
});
export type HomeDto = z.infer<typeof HomeDto>;

export const homeGet = defineRoute({
  id: 'home.get',
  method: 'GET',
  path: '/api/v1/home',
  auth: 'user',
  output: HomeDto,
  successStatus: 200,
  summary:
    'Accueil de l’apprenant connecté : journée, rétention, quiz global et formations en une lecture (SPEC-603).',
  errors: ['UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const homeRoutes = { homeGet } as const;
