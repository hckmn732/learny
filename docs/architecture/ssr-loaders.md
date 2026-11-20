# Chargeurs serveur du web

`apps/web` conserve le rendu serveur, mais les modules produit ci-dessous ne lisent plus
`@learny/services` ni un autre paquet serveur : ils transmettent la session et l’identité de requête
à `apps/api` avec `lib/api/server-client.ts`. Les réponses conservent les DTO existants.

## Chargeurs `lib/*-page.ts`

| Chargeur / écran | Routes appelées | DTO |
|---|---|---|
| `home-page.ts` · Accueil | `homeGet` | `HomeDto` |
| `agenda-page.ts` · Agenda | `agendaGet` (sonde puis fenêtre) | `AgendaDto` |
| `cadrage-page.ts` · Cadrage | `cadragePageGet`, shell | `CadragePageState`, shell |
| `exercise-page.ts` · Exercice | `exerciseDetail` | `PracticeExerciseDto` |
| `final-review-page.ts` · Bilan final | `getFinalReview` | `FinalReviewDto` |
| `gaps-page.ts` · Lacunes | `gapsList` | `GapListDto` |
| `global-quiz-page.ts` · Quiz global | `globalQuizToday`, `meGet` | `GlobalQuizSessionDto`, `MeDto` |
| `group-page.ts` · Groupe / invitation | `formationGroupGet`, `invitationGet` | `GroupState`, `InvitationPreview` |
| `notification-settings-page.ts` · Notifications | `meNotificationSettingsGet` | `NotificationSettingsDto` |
| `notion-graph-page.ts` · Carte | `notionGraph` | `NotionGraphDto` |
| `programme-page.ts` · Programme | `programmeGet`, shell | `ProgrammeScreenStateDto`, shell |
| `search-page.ts` · Recherche | `searchGlobal` via `searchPageForApi` | `SearchResponse` |
| `settings-page.ts` · Profil | `meProfileGet` | `SettingsState` |
| `ai-models-page.ts` · Modèles d’IA | `meAiModelsGet` | `AiModelsState` |
| `sidebar-page.ts` · Coquille | `sidebarGet`, `sidebarUpdate`, `headerGet` | `SidebarDto`, `HeaderDto` |

## Pages serveur sans chargeur `*-page.ts`

| Page | Routes appelées |
|---|---|
| Premiers pas | `meGet`, `meOnboardingGet` |
| Module / cours / quiz | `programmeGet`, `moduleScreen`, `moduleCourse`, shell |
| Résultat / remédiation | `getQuizResult`, `getRemediation`, shell |
| Examen blanc | `getExamIntro`, `getExamAttempt`, shell |
| `proxy.ts` | `formationAccessGet` |

Les appels indépendants d’une même page sont lancés avec `Promise.all` ou `Promise.allSettled`.
Les erreurs d’API conservent le `requestId` de `problem+json`; 401 redirige vers la connexion,
404 déclenche le même `notFound()` et les autres erreurs restent dans la frontière de page.

## Mesures

Le calcul de surcoût compare les médianes serveur avant/après et impose au plus 25 ms par page.
Dans cet environnement, le lancement de `pnpm test:perf` est bloqué avant la mesure parce que la
base Supabase locale est indisponible. Les artefacts portent explicitement cet état et ne présentent
donc aucune valeur synthétique comme mesure.
