# Périmètre — SPEC-2201 (identity + formation)

## État de la bascule (dernier commit de la branche)

| Contexte | Opérations | `py` | `ts` restantes | Motif des `ts` |
|---|---|---|---|---|
| identity | 19 | **13** | 6 | 5 × `auth.*` (ADR-2022 : cookies non comparables) ; `home.get` (ADR-2023 : moteur d'apprentissage de SPEC-2202) |
| formation | 26 | **25** | 1 | `formations.resume` (ADR-2024 : planificateur de SPEC-2202) |
| **Total** | **45** | **38** | **7** | |

Les 25 opérations formation basculées : `cadrage.complete`, `cadrage.get`, `cadrage.message`,
`cadrage.page`, `formations.access`, `formations.archive`, `formations.create`,
`formations.current`, `formations.group.create`, `formations.group.get`, `formations.list`,
`formations.pause`, `formations.update`, `groups.leave`, `groups.members.remove`,
`groups.rotateCode`, `invitations.accept`, `invitations.get`, `notionGraph.get`,
`programme.adjust`, `programme.generate`, `programme.get`, `programme.import`,
`programme.validate`, `search.global`.

Les 13 opérations identity servies et basculées : `header.get`, `me.ai.task-models.update`, `me.get`,
`me.legal.accept`, `me.onboarding.get`, `me.onboarding.update`, `me.preferences.get`,
`me.preferences.update`, `me.profile.get`, `me.profile.update`, `me.update`, `sidebar.get`,
`sidebar.update`.

Source unique : `api/inventory.json` (généré par SPEC-2001, `pnpm migration:report`), filtré sur
`context == "identity"` et `context == "formation"`. Les 32 routes spéciales de l'inventaire
appartiennent toutes à `SPEC-2207` (dev-jobs, health, `auth/callback`, sprints) : elles restent
`ts` et hors périmètre de cette spécification.

## Comptage

| Contexte | Opérations | Routes spéciales | Consommateurs | Crons |
|---|---|---|---|---|
| identity | 19 | 0 | 0 | 0 |
| formation | 26 | 0 | 0 | 0 |
| **Total** | **45** | **0** | **0** | **0** |

Écart avec l'intitulé du plan P22 (« 50 operations ») : l'inventaire, qui fait foi (SPEC-2001),
ne contient que 45 opérations pour ces deux contextes. Les 5 opérations manquantes ne sont
réparties dans aucun autre contexte du périmètre : ce chiffre du plan est une estimation, pas une
liste. Aucune opération hors inventaire n'est ajoutée (ADR-2005, ADR-1001).

## Modules d'implémentation source

| Fichier TypeScript | Opérations |
|---|---|
| `packages/api-routes/src/implementations/auth.ts` | 5 |
| `packages/api-routes/src/implementations/me.ts` | 8 |
| `packages/api-routes/src/implementations/legal.ts` | 1 |
| `packages/api-routes/src/implementations/parametres-onglets-et-profil.ts` | 2 |
| `packages/api-routes/src/implementations/header.ts` | 1 |
| `packages/api-routes/src/implementations/sidebar.ts` | 2 |
| `packages/api-routes/src/implementations/home.ts` | 1 |
| `packages/api-routes/src/implementations/cadrage.ts` | 6 |
| `packages/api-routes/src/implementations/formation-management.ts` | 6 |
| `packages/api-routes/src/implementations/formations-a-plusieurs.ts` | 7 |
| `packages/api-routes/src/implementations/programme.ts` | 5 |
| `packages/api-routes/src/implementations/notion-graph.ts` | 1 |
| `packages/api-routes/src/implementations/search.ts` | 1 |

`security` (mot de passe, sessions) et `views` (header, sidebar, home) sont portés dans
`learny/identity` et `learny/views` (00-conventions section 2) ; `learny.platform.llm` est construit
par cette spécification (premier usage : cadrage et génération de programme).

## Opérations

### identity (19)

| Operation | Méthode | Chemin | Auth | Rate limit | Idempotent | Usage | Tables | Tests |
|---|---|---|---|---|---|---|---|---|
| `auth.magicLink` | POST | `/api/v1/auth/magic-link` | public | auth | non | auth.ts | instrumentation, legal_acceptances, pg_timezone_names, profiles, users | 2 |
| `auth.resend` | POST | `/api/v1/auth/resend` | public | auth | non | auth.ts | instrumentation, legal_acceptances, pg_timezone_names, profiles, users | 3 |
| `auth.signIn` | POST | `/api/v1/auth/sign-in` | public | auth | non | auth.ts | instrumentation, legal_acceptances, pg_timezone_names, profiles, users | 4 |
| `auth.signOut` | POST | `/api/v1/auth/sign-out` | public | auth | non | auth.ts | instrumentation, legal_acceptances, pg_timezone_names, profiles, users | 2 |
| `auth.signUp` | POST | `/api/v1/auth/sign-up` | public | auth | non | auth.ts | instrumentation, legal_acceptances, pg_timezone_names, profiles, users | 3 |
| `header.get` | GET | `/api/v1/me/header` | user | default | non | header.ts | formations, group_members, groups, notifications, profiles | 3 |
| `home.get` | GET | `/api/v1/home` | user | default | non | home.ts | activities, attempts, automation_settings, bricks, cadrage_messages, chapter_progress… | 0 |
| `me.ai.task-models.update` | PUT | `/api/v1/me/ai/task-models` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 0 |
| `me.get` | GET | `/api/v1/me` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 41 |
| `me.legal.accept` | POST | `/api/v1/me/legal-acceptances` | user | default | non | legal.ts | profiles | 2 |
| `me.onboarding.get` | GET | `/api/v1/me/onboarding` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 1 |
| `me.onboarding.update` | PATCH | `/api/v1/me/onboarding` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 1 |
| `me.preferences.get` | GET | `/api/v1/me/preferences` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 1 |
| `me.preferences.update` | PATCH | `/api/v1/me/preferences` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 1 |
| `me.profile.get` | GET | `/api/v1/me/profile` | user | default | non | parametres-onglets-et-profil.ts | formations, profiles | 2 |
| `me.profile.update` | PATCH | `/api/v1/me/profile` | user | default | non | parametres-onglets-et-profil.ts | formations, profiles | 2 |
| `me.update` | PATCH | `/api/v1/me` | user | default | non | me.ts | instrumentation, profiles, study_preferences | 32 |
| `sidebar.get` | GET | `/api/v1/me/sidebar` | user | default | non | sidebar.ts | daily_activity, formations, group_members, groups, modules, notion_states… | 4 |
| `sidebar.update` | PATCH | `/api/v1/me/sidebar` | user | default | non | sidebar.ts | daily_activity, formations, group_members, groups, modules, notion_states… | 2 |

### formation (26)

| Operation | Méthode | Chemin | Auth | Rate limit | Idempotent | Usage | Tables | Tests |
|---|---|---|---|---|---|---|---|---|
| `cadrage.complete` | POST | `/api/v1/formations/:fid/cadrage/complete` | user | default | non | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 0 |
| `cadrage.get` | GET | `/api/v1/formations/:fid/cadrage/messages` | user | default | non | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 0 |
| `cadrage.message` | POST | `/api/v1/formations/:fid/cadrage/messages` | user | ai | oui | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 1 |
| `cadrage.page` | GET | `/api/v1/formations/:fid/cadrage` | user | default | non | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 0 |
| `formations.access` | GET | `/api/v1/formations/:fid/access` | user | none | non | formation-management.ts | formations, group_members, groups, module_progress, modules, profiles… | 0 |
| `formations.archive` | POST | `/api/v1/formations/:fid/archive` | user | default | oui | formation-management.ts | formations, group_members, groups, module_progress, modules, profiles… | 0 |
| `formations.create` | POST | `/api/v1/formations` | user | default | oui | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 14 |
| `formations.current` | PATCH | `/api/v1/me/current-formation` | user | default | non | formation-management.ts | formations, group_members, groups, module_progress, modules, profiles… | 2 |
| `formations.group.create` | POST | `/api/v1/formations/:fid/group` | user | default | oui | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `formations.group.get` | GET | `/api/v1/formations/:fid/group` | user | default | non | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `formations.list` | GET | `/api/v1/formations` | user | default | non | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 12 |
| `formations.pause` | POST | `/api/v1/formations/:fid/pause` | user | default | oui | formation-management.ts | formations, group_members, groups, module_progress, modules, profiles… | 0 |
| `formations.resume` | POST | `/api/v1/formations/:fid/resume` | user | default | oui | formation-management.ts | formations, group_members, groups, module_progress, modules, profiles… | 0 |
| `formations.update` | PATCH | `/api/v1/formations/:fid` | user | default | non | cadrage.ts | cadrage_messages, daily_activity, event_outbox, formations, group_members, groups… | 3 |
| `groups.leave` | POST | `/api/v1/groups/:gid/leave` | user | default | oui | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `groups.members.remove` | DELETE | `/api/v1/groups/:gid/members/:uid` | user | default | non | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `groups.rotateCode` | POST | `/api/v1/groups/:gid/rotate-code` | user | default | oui | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `invitations.accept` | POST | `/api/v1/invitations/:code/accept` | user | default | oui | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `invitations.get` | GET | `/api/v1/invitations/:code` | public | default | non | formations-a-plusieurs.ts | activities, automation_actions, bricks, chapter_progress, chapter_summaries, chapters… | 0 |
| `notionGraph.get` | GET | `/api/v1/formations/:fid/notion-graph` | user | default | non | notion-graph.ts | chapters, course_sections, courses, formations, free, modules… | 0 |
| `programme.adjust` | POST | `/api/v1/formations/:fid/programme/adjust` | user | ai | oui | programme.ts | chapter_progress, chapters, event_outbox, formations, group_members, groups… | 0 |
| `programme.generate` | POST | `/api/v1/formations/:fid/programme/generate` | user | ai | oui | programme.ts | chapter_progress, chapters, event_outbox, formations, group_members, groups… | 0 |
| `programme.get` | GET | `/api/v1/formations/:fid/programme` | user | default | non | programme.ts | chapter_progress, chapters, event_outbox, formations, group_members, groups… | 0 |
| `programme.import` | POST | `/api/v1/formations/:fid/programme/import` | user | ai | oui | programme.ts | chapter_progress, chapters, event_outbox, formations, group_members, groups… | 0 |
| `programme.validate` | POST | `/api/v1/formations/:fid/programme/validate` | user | default | oui | programme.ts | chapter_progress, chapters, event_outbox, formations, group_members, groups… | 0 |
| `search.global` | GET | `/api/v1/search` | user | default | non | search.ts | course_sections, formations, notions, plain, sql | 4 |
