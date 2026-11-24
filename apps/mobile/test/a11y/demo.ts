// Données et hooks de démonstration du parcours d'accessibilité (SPEC-3502 EF-2, ET-2).
//
// Chaque écran audité est rendu avec les valeurs du jeu de démonstration (Alex Perrin, 11 novembre
// 2026, 13:20) : les modules de données sont remplacés ici, une seule fois, plutôt que dans chaque
// écran. Les fixtures existantes des tests d'écran sont réutilisées telles quelles, donc l'audit
// porte sur l'écran réellement livré et non sur une variante de test.
import { AGENDA, ALTERNATIVES } from '../agenda/fixtures';
import { courseScreen } from '../cours/fixtures';
import {
  GAPS as PROFILE_GAPS,
  HOME as PROFILE_HOME,
  MODELS,
  NOTIFICATIONS,
  PAUSE,
  SETTINGS,
  STREAK as PROFILE_STREAK,
  SUBSCRIPTION,
} from '../profil/fixtures';
import { me, activeProgramme, courseProgress, sidebar } from '../programme/fixtures';


const noop = (): void => undefined;
const resolved = (): Promise<void> => Promise.resolve();

const HOME = {
  today: {
    date: '2026-11-11',
    label: 'Mercredi 11 novembre',
    plannedMinutes: 302,
    doneMinutes: 180,
    slots: [
      {
        id: 's-quiz',
        formationId: 'f-sap',
        kind: 'validation_quiz',
        title: 'Quiz de validation',
        meta: 'Tentative 2 · seuil 80 %',
        time: '14:00',
        moduleId: 'm-3',
        activityId: null,
        startsAt: '2026-11-11T13:00:00.000Z',
        endsAt: '2026-11-11T14:00:00.000Z',
        status: 'planned',
        state: 'next',
        minutesUntil: 40,
        href: '/formations/f-sap/modules/m-3/quiz',
      },
    ],
    primaryAction: { label: 'Commencer', href: '/formations/f-sap/modules/m-3/quiz' },
  },
  retention: { oneMonth: 86, twoMonths: 0 },
  globalQuiz: null,
  formations: {
    ongoing: [
      {
        id: 'f-sap',
        monogram: 'SAP',
        accent: 'indigo',
        status: 'active',
        title: 'SAP S/4HANA Finance',
        subtitle: 'Être opérationnel',
        progressPercent: 29,
        modulePosition: 3,
        moduleCount: 7,
        moduleTitle: 'Comptabilité générale',
        moduleStatus: null,
        nextActivity: null,
        endDate: '2026-12-11',
        action: { label: 'Reprendre', href: '/formations/f-sap/modules/m-3' },
        primaryAction: true,
      },
    ],
    completed: [],
  },
};

const STREAK = {
  days: 12,
  regularity: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    status: index >= 2 ? 'done' : 'none',
  })),
  timezone: 'Europe/Paris',
  computedOn: '2026-11-11',
  nextMilestone: null,
};

const GAPS = {
  summary: { openGaps: 4, masteredNotions: 23, gapModules: [2, 3], masteredModules: [1] },
  items: [],
};

/** Modules `src/data/home` (Aujourd'hui et Profil lisent les mêmes requêtes). */
export const home = {
  useHome: () => ({ status: 'ready', data: HOME, refreshing: false, refetch: noop }),
  useStreak: () => ({ status: 'ready', data: STREAK, refetch: noop }),
  useAutomationActions: () => ({
    status: 'ready',
    pending: [],
    recent: [],
    weekCount: 5,
    refetch: noop,
  }),
  useWarmupsToday: () => ({ status: 'ready', data: { items: [] }, refetch: noop }),
  useGaps: () => ({ status: 'ready', data: GAPS, refetch: noop }),
  useTutorActions: () => ({ run: resolved, pending: false }),
  useSlotAlternatives: () => ({ status: 'ready', data: null, refetch: noop }),
  useSlotMove: () => ({ move: resolved, pending: false }),
  useRefreshToday: () => noop,
  statusOf: () => 'ready',
};

/** Module `src/data/use-programme`. */
export const programme = {
  useMe: () => ({ status: 'ready', data: me(), retry: noop }),
  useFormationOptions: () => ({
    status: 'ready',
    formations: [{ id: 'f-sap', title: 'SAP S/4HANA Finance' }],
    current: { id: 'f-sap', title: 'SAP S/4HANA Finance' },
    retry: noop,
  }),
  useCurrentFormationId: () => ({ status: 'ready', formationId: 'f-sap', setFormationId: noop }),
  useProgramme: () => ({ status: 'ready', data: activeProgramme(), retry: noop }),
  useFormationsList: () => ({
    status: 'ready',
    items: [{ id: 'f-sap', title: 'SAP S/4HANA Finance', status: 'active' }],
    retry: noop,
  }),
  useModuleCourse: () => ({ status: 'ready', data: courseScreen(), retry: noop, refresh: resolved }),
  useSwitchFormation: () => ({ switchTo: resolved, pending: false, error: null }),
  formationSigil: (title: string) => title.slice(0, 3).toUpperCase(),
};

/** Module `src/data/use-agenda`. */
export const agenda = {
  useAgenda: () => ({ status: 'ready', data: AGENDA, retry: noop }),
  useSlotAlternatives: () => ({ status: 'ready', data: ALTERNATIVES, retry: noop }),
  useMoveSlot: () => ({ move: resolved, pending: false, reset: noop }),
};

/** Module `src/data/course`. */
export const course = {
  useCourseScreen: () => ({ status: 'ready', data: courseScreen(), staleVersion: false, retry: noop }),
  useCourseProgress: () => ({
    chapterPercent: courseProgress().chapters[0]?.percent ?? 40,
    coursePercent: 38,
    observe: noop,
    flush: resolved,
  }),
  useChapterSummary: () => ({ submit: resolved, pending: false }),
  useSectionReport: () => ({ report: resolved, pending: false }),
  useCitationSource: () => ({ load: resolved, pending: false, failed: false, reset: noop }),
};

/** Module `src/data/profile`. */
export const profile = {
  useProfile: () => ({ status: 'ready', data: SETTINGS, refetch: noop }),
  useSaveProfile: () => ({ save: resolved, pending: false }),
  useDeletion: () => ({
    schedule: resolved,
    cancel: resolved,
    pending: false,
    error: null,
  }),
  useExportState: () => ({ status: 'ready', data: null, refetch: noop }),
  useExportRequest: () => ({ request: resolved, pending: false, error: null }),
};

/** Module `src/data/pause`. */
export const pause = {
  usePause: () => ({ status: 'ready', data: PAUSE, refetch: noop }),
  usePauseActions: () => ({ start: resolved, end: resolved, pending: false }),
  isPauseActive: () => false,
};

/** Module `src/data/subscription`. */
export const subscription = {
  useSubscription: () => ({ status: 'ready', data: SUBSCRIPTION, refetch: noop }),
};

/** Module `src/data/task-models`. */
export const taskModels = {
  useTaskModels: () => ({ status: 'ready', data: MODELS, refetch: noop }),
  useAssignTaskModel: () => ({ assign: resolved, pending: false }),
  chosenModelLabel: () => 'GPT-5 · Compte personnel',
};

/** Module `src/data/notification-settings`. */
export const notificationSettings = {
  useNotificationSettings: () => ({ status: 'ready', data: NOTIFICATIONS, refetch: noop }),
  useSaveNotificationSettings: () => ({ save: resolved, pending: false }),
  typeCountOf: () => 6,
};

/** Module `src/data/review` (session du jour, utilisée par l'onglet Réviser). */
export const review = {
  useGlobalQuizToday: () => ({ status: 'ready', data: null, retry: noop }),
  useReviewAnswer: () => ({ answer: resolved, pending: false }),
  useReviewComplete: () => ({ complete: resolved, pending: false }),
  useUndoSmoothing: () => ({ undo: resolved, pending: false }),
};

/** Module `src/data/warmup`. */
export const warmup = {
  useWarmupToday: () => ({ status: 'ready', data: null, refetch: noop }),
  useWarmupAnswer: () => ({ answer: resolved, pending: false }),
};

/** Module `src/features/shell/use-shell` (en-tête et compteur de non-lues). */
export const shell = {
  useHeader: () => ({
    status: 'ready',
    data: {
      firstName: 'Alex',
      lastName: 'Perrin',
      emailLabel: 'alex.perrin@exemple.fr',
      activeFormationCount: 3,
      unreadNotificationCount: 3,
    },
    refetch: noop,
  }),
  useUnreadCount: () => ({ count: 3, refetch: noop }),
  useOnboarding: () => ({ status: 'ready', state: 'done', retry: noop }),
  useFormations: () => ({ status: 'ready', items: [], refetch: noop }),
  displayNameOf: (identity: { firstName?: string | null; lastName?: string | null }) =>
    [identity.firstName, identity.lastName].filter(Boolean).join(' '),
  initialsOf: () => 'AP',
  UNREAD: 'unread',
};

/** Module `src/auth/session` (compte connecté de démonstration). */
export const session = {
  useSession: () => ({
    status: 'signedIn',
    userId: 'user-1',
    accessToken: () => 'token',
    signIn: resolved,
    signOut: resolved,
    expiredNotice: null,
    error: null,
    busy: false,
  }),
};

export const DEMO = { PROFILE_HOME, PROFILE_GAPS, PROFILE_STREAK, sidebar: sidebar() };
