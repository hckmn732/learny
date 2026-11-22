// Query keys of the mobile application (SPEC-3003 EF-4; canevas § 4).
//
// One key per route, declared here and nowhere else: the cache is keyed by user (the persister
// buster), so a key never carries the user id. `['formation', id, 'programme']` mirrors the canvas
// example and keeps the invalidation of a formation precise (`queryKeys.formation(id)`).
export const queryKeys = {
  me: () => ['me'] as const,
  profile: () => ['me', 'profile'] as const,
  home: () => ['home'] as const,
  formations: () => ['formations'] as const,
  formation: (formationId: string) => ['formation', formationId] as const,
  programme: (formationId: string) => ['formation', formationId, 'programme'] as const,
  agenda: (from: string, to: string, formationId: string | null) =>
    ['agenda', from, to, formationId] as const,
  offlinePack: (day: string) => ['offline', 'pack', day] as const,
  tutor: (conversationId: string) => ['tutor', conversationId] as const,
  sdd: {
    health: (apiUrl: string) => ['sdd', 'health', apiUrl] as const,
    me: () => ['sdd', 'me'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
