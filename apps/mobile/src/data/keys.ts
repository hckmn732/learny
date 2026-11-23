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
  formation: (formationId: string) => ['formation', formationId] as const,
  programme: (formationId: string) => ['formation', formationId, 'programme'] as const,
  agenda: (from: string, to: string, formationId: string | null) =>
    ['agenda', from, to, formationId] as const,
  // SPEC-3203 EF-7 — the three windows proposed by the planner for one slot; the sheet always
  // re-reads them after a conflict (CL-1), hence the dedicated key.
  slotAlternatives: (slotId: string) => ['slots', slotId, 'alternatives'] as const,
  offlinePack: (day: string) => ['offline', 'pack', day] as const,
  tutor: (conversationId: string) => ['tutor', conversationId] as const,
  sdd: {
    health: (apiUrl: string) => ['sdd', 'health', apiUrl] as const,
    me: () => ['sdd', 'me'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
