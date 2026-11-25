// Query keys of the mobile application (SPEC-3003 EF-4, SPEC-3201 ET-1; canevas § 4).
//
// One key per route, declared here and nowhere else: the cache is keyed by user (the persister
// buster), so a key never carries the user id. `['formation', id, 'programme']` mirrors the canvas
// example and keeps the invalidation of a formation precise (`queryKeys.formation(id)`).
// The four keys of the Aujourd'hui screen are the ones of SPEC-3201 ET-1: `['home']`, `['streak']`,
// `['automation-actions']` and `['warmups', 'today']`; the two detail reads of its sheets stay
// under their own prefix so that a mutation can invalidate them separately.
export const queryKeys = {
  me: () => ['me'] as const,
  profile: () => ['me', 'profile'] as const,
  header: () => ['me', 'header'] as const,
  onboarding: () => ['me', 'onboarding'] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  notifications: (filter: string) => ['notifications', 'list', filter] as const,
  home: () => ['home'] as const,
  streak: () => ['streak'] as const,
  automationActions: () => ['automation-actions'] as const,
  warmupsToday: () => ['warmups', 'today'] as const,
  gaps: (formationId: string) => ['gaps', formationId] as const,
  slotAlternatives: (slotId: string) => ['slots', slotId, 'alternatives'] as const,
  formations: () => ['formations'] as const,
  sidebar: () => ['me', 'sidebar'] as const,
  formation: (formationId: string) => ['formation', formationId] as const,
  programme: (formationId: string) => ['formation', formationId, 'programme'] as const,
  module: (moduleId: string) => ['module', moduleId] as const,
  moduleCourse: (moduleId: string) => ['module', moduleId, 'course'] as const,
  // SPEC-3302 ET-1 — the course of one chapter of a module: the selected chapter is part of the
  // key, so opening another chapter reads its own page and keeps the previous one in the cache.
  course: (moduleId: string, chapterId: string) =>
    ['module', moduleId, 'course', chapterId] as const,
  agenda: (from: string, to: string, formationId: string | null) =>
    ['agenda', from, to, formationId] as const,
  // SPEC-3203 EF-7 — the three windows proposed by the planner for one slot; the sheet always
  // re-reads them after a conflict (CL-1), hence the dedicated key.
  offlinePack: (day: string) => ['offline', 'pack', day] as const,
  // SPEC-3305 EF-1 — session du jour d'une formation, relue après chaque réponse (ET-3).
  globalQuizToday: (formationId: string) => ['global-quiz', formationId, 'today'] as const,
  warmupDetail: (activityId: string) => ['warmup', activityId] as const,
  tutor: (conversationId: string) => ['tutor', conversationId] as const,
  sdd: {
    health: (apiUrl: string) => ['sdd', 'health', apiUrl] as const,
    me: () => ['sdd', 'me'] as const,
  },
  // SPEC-3401 ET-1 — les réglages du profil, les notifications, les modèles d'IA, l'abonnement et
  // la pause. Une clé par route, comme le reste du cache (canevas § 4) ; `exportRead` porte
  // l'identifiant de l'export pour que deux exports successifs ne partagent pas la même entrée.
  settings: () => ['me', 'settings'] as const,
  notificationSettings: () => ['me', 'notification-settings'] as const,
  aiModels: () => ['me', 'ai-models'] as const,
  subscription: () => ['billing', 'subscription'] as const,
  pause: () => ['me', 'pause'] as const,
  exportRead: (exportId: string) => ['me', 'export', exportId] as const,
  // SPEC-4003 — mode simple : l'état de préparation et le résultat du diagnostic.
  simple: (formationId: string) => ['simple', formationId] as const,
  simpleAttempt: (attemptId: string) => ['simple', 'diagnostic', attemptId] as const,
  attempt: (attemptId: string) => ['attempt', attemptId] as const,
  attemptResult: (attemptId: string) => ['attempt', attemptId, 'result'] as const,
} as const;

export type QueryKeys = typeof queryKeys;
