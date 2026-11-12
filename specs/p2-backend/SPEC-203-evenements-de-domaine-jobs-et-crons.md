---
id: SPEC-203
title: Événements de domaine, jobs et crons
phase: P2
priority: V1
depends_on: [SPEC-007, SPEC-201]
business_rules: []
screens: []
adrs: [ADR-0017, ADR-0067, ADR-0122, ADR-0123]
visual: demo
---

# SPEC-203 — Événements de domaine, jobs et crons

## 1. Objectif

Fournir le catalogue typé de tous les événements de domaine (`docs/architecture/overview.md` §5), une émission transactionnelle fiable (boîte d'envoi écrite dans la transaction, envoi après validation), les conventions d'écriture des fonctions Inngest (idempotence, reprises, concurrence), un mode d'exécution en ligne pour les tests, et les deux crons : le tick horaire qui sélectionne les utilisateurs selon leur heure locale et le traitement nocturne.

## 2. Contexte

- Jobs durables Inngest servis par `apps/web` (`/api/inngest`) et `apps/worker` (ADR-0017), crons par fuseau (ADR-0067).
- Catalogue d'événements et crons : `docs/architecture/overview.md` §5 ; flux « Mutation » et « Traitement long » : §4.
- Documents : ADR-0017, ADR-0067, ADR-0030, ADR-0047, ADR-0122, ADR-0123, `docs/engineering/testing.md` §1 (jobs testés par exécution directe des handlers).

## 3. Dépendances

- **SPEC-007** : `@learny/jobs` (client Inngest `inngest`, enregistrement `functions`, fonction de démonstration), `/api/inngest`, `apps/worker`.
- **SPEC-201** : `ServiceContext`, `AppError`, `@learny/contracts` (les schémas d'événements y vivent), `handler()` pour les routes de démonstration.
- Déjà présents : `@learny/db` (transactions Drizzle, `serviceDb`), `@learny/core` (`clock`, `logger`), `profiles` et `notification_settings` (SPEC-102).
- Bibliothèques : `inngest` ≥ 3, `@inngest/test` ≥ 0.1 (exécution directe), `@date-fns/tz` ≥ 1 (ADR-0030).
- Variables : `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (production), `INNGEST_DEV` (local), **nouvelle** `JOBS_MODE` = `inngest` (défaut) | `inline` (tests e2e, CI sans Inngest Dev Server) — à ajouter au schéma de `@learny/config` ; `JOBS_MODE=inline` interdit en production (échec au démarrage).

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est rattachée à cette spécification. Elle rend possibles les règles horodatées par fuseau (BR-ACC-07 : sélection par heure locale ; BR-NOT-04 : programme du jour à l'heure choisie ; BR-AUT-02/09 : micro-séance et bilan à l'heure locale ; BR-ACC-11 : suppression à J+30 par le traitement nocturne), implémentées par leurs spécifications.

## 5. Exigences fonctionnelles

- **EF-1** Toute émission d'événement par un service se fait par `emitAfterCommit` : si la transaction est annulée, aucun événement n'est envoyé ; si elle est validée, l'événement est envoyé au moins une fois, avec un identifiant stable qui permet la déduplication par Inngest.
- **EF-2** Un événement dont le contenu ne respecte pas son schéma est refusé à l'émission (`AppError('INTERNAL_ERROR')`, journal `event_schema_violation`) et n'est jamais écrit.
- **EF-3** Le cron `cron-hourly-tick` s'exécute à la minute 5 de chaque heure UTC ; il émet un événement `user/local-tick` par utilisateur actif décrivant la fenêtre locale `[T − 5 min, T + 55 min[` (T = instant du tick) et un événement global `cron/hourly-tick`.
- **EF-4** Le cron `cron-nightly` s'exécute à 01:30 UTC et émet `cron/nightly` `{ runDate }` (date UTC) ; chaque traitement nocturne est une fonction distincte abonnée à cet événement (échecs isolés).
- **EF-5** Les événements non envoyés (panne d'Inngest) sont renvoyés à chaque tick horaire jusqu'au succès ; au-delà de 10 tentatives, l'entrée est marquée en échec et signalée (journal `error` + rapport d'erreur SPEC-010).
- **EF-6** En mode `JOBS_MODE=inline`, l'envoi exécute immédiatement, dans le processus, les fonctions abonnées (étapes et reprises comprises), ce qui rend les effets observables par les tests e2e sans Inngest Dev Server.
- **EF-7** Page `/_dev/sdd/SPEC-203` : émission d'un événement de démonstration traversant trois étapes avec une reprise, et exécution manuelle du tick horaire avec la liste des utilisateurs sélectionnés et leurs fenêtres locales.

## 6. Exigences techniques

**ET-1 — Catalogue** (`packages/contracts/src/events.ts`, réexporté par `packages/jobs/src/events.ts`) : `EVENTS` = objet `nom → schéma Zod de data`. Tous les identifiants sont des `Uuid`, les instants des `IsoDateTime`, les dates civiles des `CivilDate`.
| Événement | `data` |
|---|---|
| `user/signed-up` | `{ userId, method: 'magic_link'\|'password', signedUpAt }` |
| `user/onboarding-completed` | `{ userId, completedAt }` |
| `formation/cadrage-completed` | `{ userId, formationId }` |
| `formation/programme-requested` | `{ userId, formationId, changeRequestId: Uuid.nullable() }` |
| `formation/programme-imported` | `{ userId, formationId, importId }` |
| `formation/programme-validated` | `{ userId, formationId, validatedAt }` |
| `formation/paused` | `{ userId, formationId, pausedAt }` |
| `formation/resumed` | `{ userId, formationId, resumedOn }` |
| `formation/completed` | `{ userId, formationId, completedAt }` |
| `resource/uploaded` | `{ userId, resourceId, formationId, chapterId: nullable, kind }` |
| `resource/ready` | `{ userId, resourceId, chunkCount: int ≥ 0 }` |
| `resource/failed` | `{ userId, resourceId, errorCode: string }` |
| `chapter/contributions-completed` | `{ userId, moduleId, chapterId: nullable, force: boolean }` |
| `course/generated` | `{ userId, courseId, moduleId, version: int ≥ 1 }` |
| `quiz/submitted` | `{ userId, attemptId, activityId, moduleId }` |
| `quiz/graded` | `{ userId, attemptId, moduleId, score: 0..100, passed: boolean }` |
| `module/validated` | `{ userId, formationId, moduleId, score: 0..100 }` |
| `gap/detected` | `{ userId, formationId, notionId, nature: 'forgetting'\|'confusion'\|'misunderstanding'\|'application' }` |
| `gap/cleared` | `{ userId, formationId, notionId }` |
| `review/answered` | `{ userId, notionId, source, correct: boolean, reviewedAt }` |
| `exam/submitted` | `{ userId, formationId, attemptId }` |
| `exercise/submitted` | `{ userId, moduleId, attemptId }` |
| `tutor/question-asked` | `{ userId, courseId, conversationId, messageId }` |
| `automation/action-proposed` · `automation/action-applied` · `automation/action-undone` | `{ userId, actionId, automation: AutomationKey }` |
| `notification/requested` | `{ userId, type: NotificationType, data: record, formationId: nullable, dedupeKey: string(1..200).nullable(), externalChannels: z.boolean().default(true) }` |
| `billing/subscription-changed` | `{ userId, status, previousStatus }` |
| `account/export-requested` | `{ userId, exportId }` |
| `account/deletion-requested` | `{ userId, scheduledFor }` |
| `group/member-joined` · `group/member-left` | `{ groupId, formationId, userId }` |
| `cron/hourly-tick` | `{ tickAt }` |
| `cron/nightly` | `{ runDate: CivilDate }` |
| `user/local-tick` | `{ userId, timezone, windowStart, windowEnd, localDate: CivilDate, localWeekday: 1..7 }` |
| `sdd/demo-requested` | `{ runId: Uuid, failOnceAt: z.enum(['none','step-2']) }` |
Les spécifications qui émettent ou consomment un événement **réutilisent** ce schéma ; tout nouvel événement est ajouté ici et au tableau de `docs/architecture/overview.md` §5 dans le même commit. Le client Inngest est typé : `new Inngest({ id: 'learny', schemas: new EventSchemas().fromZod(EVENTS) })`.

**ET-2 — Boîte d'envoi** (ADR-0122). Nouvelle table (migration de cette spécification, RLS activée sans politique utilisateur : accès service uniquement) :
```sql
create table event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,            -- identifiant Inngest de déduplication
  name text not null,
  data jsonb not null,
  user_id uuid null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  attempts smallint not null default 0,
  last_error text null,
  failed boolean not null default false
);
create index event_outbox_pending on event_outbox (created_at) where sent_at is null and not failed;
```
API (`packages/jobs/src/emit.ts`) :
```ts
export interface EventOutbox { add<N extends EventName>(name: N, data: EventData<N>, opts?: { id?: string }): void }
export async function withTransaction<T>(db: Db, fn: (tx: Tx, outbox: EventOutbox) => Promise<T>): Promise<T>;
export async function emitAfterCommit<N extends EventName>(db: Db, name: N, data: EventData<N>, opts?: { id?: string }): Promise<void>; // transaction d'une ligne
export async function dispatchPending(limit = 500): Promise<{ sent: number; failed: number }>;
```
`withTransaction` : valide chaque `data` (EF-2), insère les lignes `event_outbox` dans la transaction (insertion via `serviceDb` dans la même connexion transactionnelle : le rôle utilisateur n'a pas de droit sur la table ; la transaction applicative s'exécute avec un client qui porte les deux rôles par `set local role` — voir instruction 3), puis, **après** commit, appelle `dispatch(ids)` : `inngest.send([{ id: event_id, name, data, ts }])` par lots de 100, `sent_at = clock.now()` en cas de succès, sinon `attempts + 1`, `last_error`. Identifiant par défaut : `${name}:${sha256(canonicalJson(data)).slice(0, 32)}` ; les émetteurs fournissent un identifiant métier quand l'unicité est sémantique (ex. `user-signed-up:<userId>`). `failed = true` quand `attempts ≥ 10`.

**ET-3 — Mode en ligne** (`packages/jobs/src/inline.ts`) : si `JOBS_MODE=inline`, `dispatch` n'appelle pas Inngest mais, pour chaque événement, exécute séquentiellement chaque fonction du registre dont le déclencheur correspond, avec `InngestTestEngine` de `@inngest/test` (étapes réelles, `step.sleep*` résolus immédiatement, au plus 4 exécutions pour simuler 3 reprises) ; les erreurs sont journalisées et n'interrompent pas l'émetteur. Les événements produits par ces fonctions suivent le même chemin (profondeur maximale 5, au-delà erreur `inline_depth_exceeded`).

**ET-4 — Conventions de fonctions** (`packages/jobs/src/define.ts`) :
```ts
export function defineFunction<N extends EventName>(cfg: {
  id: string;                            // kebab-case, stable
  trigger: { event: N } | { cron: string };
  retries?: 0 | 1 | 2 | 3;               // défaut 3 (ADR-0017)
  concurrency?: { key?: string; limit: number };   // défaut { key: 'event.data.userId', limit: 5 } si userId présent
  idempotency?: string;                  // expression CEL, ex. 'event.data.exportId'
}, handler: (args: { event; step; logger; ctx: SystemContext }) => Promise<unknown>): InngestFunction;
```
Règles normatives : toute écriture et tout appel externe est dans un `step.run('<nom-stable>', …)` ; chaque étape est idempotente (écritures par `upsert` sur clé naturelle ou contrôle d'état préalable) ; une erreur métier non réessayable lève `NonRetriableError` ; les étapes ne lisent jamais `Date` directement mais `clock.now()` ; reprises : 3 avec la temporisation par défaut d'Inngest ; une fonction en échec définitif est rapportée (SPEC-010) avec `functionId`, `eventId`, `userId`.

**ET-5 — Tick horaire** (`packages/jobs/src/functions/cron-hourly-tick.ts`, ADR-0123) : déclencheur `{ cron: 'TZ=UTC 5 * * * *' }`, `retries: 1`. T = `clock.now()` tronqué à la minute. Étapes :
1. `dispatch-outbox` : `dispatchPending(500)`.
2. `select-users` : page par page (500, tri par `id`) via `serviceDb` : `select id, timezone from profiles where onboarding_step in ('rappels','depart','done') and (deletion_scheduled_for is null or deletion_scheduled_for > $T)`.
3. `fan-out-<page>` : pour chaque utilisateur, `windowStart = T − 5 min`, `windowEnd = T + 55 min` (instants UTC), `localDate` et `localWeekday` (ISO 1..7) de `windowStart` dans le fuseau ; envoi `user/local-tick` avec identifiant `local-tick:<userId>:<windowStart ISO>`.
4. `global` : envoi `cron/hourly-tick { tickAt: T }` (identifiant `hourly-tick:<T ISO>`).
Fonction utilitaire pour les consommateurs (`packages/jobs/src/time-window.ts`) :
```ts
/** Instant UTC où l'heure locale `hhmm` survient dans la fenêtre, ou null. Gère les fuseaux à demi-heure et les changements d'heure. */
export function dueInWindow(hhmm: `${number}:${number}`, window: { windowStart: string; windowEnd: string; timezone: string }): Date | null;
```
Algorithme : pour la date locale de `windowStart` et celle de `windowEnd`, convertir `date + hhmm` en instant via `localTimeToInstant` (heure inexistante au passage à l'heure d'été → instant décalé à la première minute valide suivante ; heure ambiguë au passage à l'heure d'hiver → première occurrence) ; renvoyer le premier instant `i` tel que `windowStart ≤ i < windowEnd`. Les consommateurs (SPEC-209, 706, 713, 720) appellent `dueInWindow` puis `step.sleepUntil(instant)`.
`localTimeToInstant(date: CivilDate, hhmm, tz)` et `zonedParts(instant, tz)` sont ajoutées à `packages/core/src/time.ts` si absentes (SPEC-207 les reprend sans changer leur signature).

**ET-6 — Traitement nocturne** (`cron-nightly.ts`) : `{ cron: 'TZ=UTC 30 1 * * *' }`, émet `cron/nightly { runDate: date UTC de T }` (identifiant `nightly:<runDate>`). Les traitements sont des fonctions `trigger: { event: 'cron/nightly' }` livrées par leurs spécifications (créneaux manqués SPEC-411, banques SPEC-513, suppressions et purge des exports SPEC-211, purge des clés d'idempotence SPEC-208). Cette spécification livre `nightly-outbox-cleanup` : suppression des lignes `event_outbox` envoyées depuis plus de 7 jours.

**ET-7 — Démonstration** : fonction `sdd-demo-pipeline` (`trigger: sdd/demo-requested`, `retries: 3`) : étapes `step-1-prepare`, `step-2-process` (lève une erreur à la première exécution si `failOnceAt = 'step-2'`, compteur conservé dans `sdd_demo_runs`), `step-3-finish`. Table de démonstration (migration, RLS sans accès utilisateur) : `sdd_demo_runs(run_id uuid pk, steps jsonb not null default '[]', attempts int not null default 0, finished_at timestamptz)`. Routes (`ENABLE_SDD_PAGES` seulement, `auth: 'user'`) :
| Route | Entrée | Sortie |
|---|---|---|
| POST `/api/v1/dev/sdd/events/demo` (idempotent) | `{ failOnceAt: 'none'\|'step-2' }` | 202 `{ jobId: runId }` |
| GET `/api/v1/dev/sdd/events/demo/:runId` | — | 200 `{ runId, steps: { name, at }[], attempts, finishedAt }` |
| POST `/api/v1/dev/sdd/cron/hourly-tick` | `{ at?: IsoDateTime }` (défaut `clock.now()`) | 200 `{ tickAt, users: { userId, timezone, windowStart, windowEnd, localDate, localWeekday, localStart: 'HH:MM' }[] }` limité aux utilisateurs de fabrique préfixés `sdd-203-` |

**ET-8 — Enregistrement** : `packages/jobs/src/functions/index.ts` exporte le tableau `functions` ; `/api/inngest` (`serve` de `inngest/next`) et `apps/worker` le réutilisent ; test : chaque fonction a un `id` unique et un déclencheur présent dans `EVENTS` ou un cron valide.

## 7. Comportements attendus et cas limites

- **CL-1 Transaction annulée** après `outbox.add` → aucune ligne, aucun envoi.
- **CL-2 Inngest indisponible au commit** → ligne conservée (`attempts = 1`), renvoyée au tick suivant ; double envoi évité par l'identifiant (déduplication Inngest 24 h).
- **CL-3 Rejeu d'un même événement** (même identifiant, ex. double clic côté service) → une seule exécution des consommateurs.
- **CL-4 Fuseau à demi-heure** (`Asia/Kolkata`, UTC+5:30) : tick 02:05 UTC → fenêtre locale 07:30–08:30 ; `dueInWindow('07:30')` renvoie 02:00 UTC ; `dueInWindow('08:00')` renvoie 02:30 UTC.
- **CL-5 Passage à l'heure d'été** (`Europe/Paris`, 29 mars 2026, 02:00 → 03:00) : `dueInWindow('02:30')` dans la fenêtre couvrant 01:00 UTC renvoie 01:00 UTC (03:00 locale, première minute valide).
- **CL-6 Passage à l'heure d'hiver** (25 octobre 2026, 02:30 existe deux fois) : une seule occurrence renvoyée (la première, 00:30 UTC) ; le tick de 01:05 UTC ne la renvoie pas une seconde fois.
- **CL-7 Tick en retard ou rejoué** par Inngest : identifiants `local-tick:<userId>:<windowStart>` → aucun doublon ; un tick manqué n'est pas rattrapé (les consommateurs tolèrent l'absence d'une fenêtre).
- **CL-8 Utilisateur en onboarding ou en suppression échue** → non sélectionné.
- **CL-9 10 000 utilisateurs** → 20 pages de 500 ; temps du tick < 60 s en intégration (mesure sur 2 000 utilisateurs de fabrique, extrapolée et consignée).
- **CL-10 Schéma violé** à l'émission → erreur immédiate dans le service émetteur, transaction annulée.

## 8. Instructions d'implémentation

1. Écrire `packages/contracts/src/events.ts` (ET-1) et ses tests de schéma ; typer le client Inngest. Commit `feat(SPEC-203): catalogue typé des événements`.
2. Migration `event_outbox` et `sdd_demo_runs` (RLS activée, aucune politique pour `authenticated`), régénérer les types Drizzle.
3. Écrire `emit.ts` : la transaction applicative ouvre la connexion avec le client utilisateur ; l'insertion dans `event_outbox` passe par la fonction SQL `security definer` `enqueue_event(p_event_id text, p_name text, p_data jsonb, p_user_id uuid)` (créée dans la même migration, `revoke all … from public`, `grant execute … to authenticated, service_role`) qui insère avec `on conflict (event_id) do nothing`. Commit `feat(SPEC-203): émission transactionnelle par boîte d'envoi`.
4. Écrire `inline.ts`, `define.ts`, `time-window.ts` et les fonctions `localTimeToInstant`/`zonedParts` si absentes.
5. Écrire `cron-hourly-tick.ts`, `cron-nightly.ts`, `nightly-outbox-cleanup.ts`, `sdd-demo-pipeline.ts`, les enregistrer. Migrer l'appel `inngest.send('user/signed-up')` de SPEC-202 vers `withTransaction`/`emitAfterCommit`. Commit `feat(SPEC-203): crons horaire et nocturne`.
6. Routes de démonstration, page `/_dev/sdd/SPEC-203`, mise à jour de `docs/architecture/overview.md` §5 (nouveaux événements `cron/*`, `user/local-tick`, `sdd/demo-requested`) et de `docs/architecture/api.md` (routes de démonstration).
7. Tests (section 12). Commit `test(SPEC-203): événements, boîte d'envoi et crons`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/events.ts`, `packages/jobs/src/{emit,inline,define,time-window}.ts`, `packages/jobs/src/functions/{cron-hourly-tick,cron-nightly,nightly-outbox-cleanup,sdd-demo-pipeline}.ts`, migration `event_outbox`/`enqueue_event`/`sdd_demo_runs`, `apps/web/app/api/v1/dev/sdd/events/demo/route.ts`, `…/events/demo/[runId]/route.ts`, `…/cron/hourly-tick/route.ts`, `apps/web/components/sdd/Spec203Demo.tsx`.
- **Modifiés** : `packages/jobs/src/client.ts` (schémas typés), `packages/jobs/src/functions/index.ts`, `packages/core/src/time.ts` (2 fonctions si absentes), `packages/config` (`JOBS_MODE`), `packages/services/src/auth/finalize.ts` (émission via la boîte d'envoi), `docs/architecture/overview.md` §5, `docs/architecture/api.md`.
- **Lus** : `profiles`, `@learny/db`, `@learny/core`.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-203` :
1. `h1` « SPEC-203 — Événements, jobs et crons ».
2. Carte « Pipeline de démonstration » (`data-testid="jobs-demo"`) : interrupteur « Faire échouer l'étape 2 une fois » (`role="switch"`), bouton « Émettre l'événement », frise de 3 étapes (`jobs-step-1..3`, états « En attente », « Échec, nouvelle tentative », « Terminée »), compteur « Exécutions : n », interrogation toutes les 1 s tant que `finishedAt` est nul (ADR-0065 adapté à la démonstration).
3. Carte « Tick horaire » (`jobs-tick`) : champ « Instant du tick (UTC) » prérempli `2026-11-11T07:05:00Z`, bouton « Exécuter le tick », tableau (`jobs-tick-table`) : colonnes « Utilisateur », « Fuseau », « Fenêtre locale », « Date locale », « Jour ».
4. Carte « Boîte d'envoi » : nombre d'événements en attente, envoyés, en échec.
Contrôles visuels : jetons (fond `#F4F4F1`, cartes `#FFFFFF` bordure `#E7E6E1` rayon 24 px, interrupteur actif `#111113`, état « Terminée » vert `#0F9F7F`, échec orange `#F97316`), structure, `toHaveScreenshot`. Accessibilité : tableau avec `th scope`, frise en liste ordonnée, `aria-live`.

## 11. Critères d'acceptation

- **CA-1** Un événement ajouté dans une transaction annulée n'est jamais envoyé ; dans une transaction validée, il est envoyé exactement une fois même si `dispatch` est appelé deux fois.
- **CA-2** Inngest injoignable : l'événement reste en attente puis part au tick suivant ; après 10 échecs il est `failed` et signalé.
- **CA-3** Le pipeline de démonstration avec échec simulé termine ses 3 étapes avec `attempts = 2` et l'étape 1 exécutée une seule fois.
- **CA-4** Le tick de `2026-11-11T07:05:00Z` produit pour `Europe/Paris` la fenêtre locale 08:00–09:00 (mercredi, jour 3), pour `Asia/Kolkata` 12:30–13:30, pour `America/New_York` 02:00–03:00 ; les utilisateurs en onboarding sont exclus.
- **CA-5** `dueInWindow` respecte les cas CL-4, CL-5 et CL-6 (tests tabulés).
- **CA-6** En `JOBS_MODE=inline`, l'émission d'un événement exécute la fonction abonnée dans le processus et ses effets sont visibles avant la réponse HTTP suivante.
- **CA-7** Toutes les fonctions enregistrées ont un identifiant unique et un déclencheur présent dans le catalogue.

## 12. Plan de tests

- **Unitaires** : `packages/contracts/src/events.test.ts` — `describe('[SPEC-203] catalogue des événements')` : chaque schéma accepte un exemple valide et refuse un identifiant non UUID. `packages/jobs/src/time-window.test.ts` — `[SPEC-203] fenêtres locales` : CL-4 à CL-6, fenêtre chevauchant minuit (tick 22:05 UTC, `Europe/Paris` → 23:00–00:00, `dueInWindow('23:30')` et date locale du jour), fuseau `Pacific/Kiritimati` (UTC+14). `packages/jobs/src/functions/registry.test.ts` — `[SPEC-203] registre` : CA-7.
- **Intégration** (`packages/jobs/test/integration/*.test.ts`, Supabase local) — `describe('[SPEC-203] boîte d'envoi')` : CA-1 (annulation via `withRollback`, double dispatch avec client Inngest simulé), CA-2 (client qui échoue 10 fois). `[SPEC-203] tick horaire` : 6 utilisateurs de fabrique (Paris, Kolkata, New York, Auckland, onboarding `ia`, suppression échue) avec `createFixedClock('2026-11-11T07:05:00Z')`, exécution directe via `InngestTestEngine` ; vérification des événements envoyés (CA-4). `[SPEC-203] pipeline` : CA-3. `[SPEC-203] mode en ligne` : CA-6.
- **End-to-end** (`apps/web/e2e/specs/p2/spec-203-jobs.spec.ts`, `JOBS_MODE=inline`, vidéo) : `test('pipeline avec reprise et tick horaire @SPEC-203', …)` : activer l'échec, émettre, attendre « Terminée » ×3 et « Exécutions : 2 » ; exécuter le tick à `2026-11-11T07:05:00Z`, vérifier les lignes Paris 08:00–09:00 et Kolkata 12:30–13:30.
- **Visuel** : `test('page de démonstration SPEC-203 @SPEC-203 @visual', …)` : `expectTokens`, structure, `toHaveScreenshot`.
- **Non-régression** : `@SPEC-007` (fonction de démonstration, worker), `@SPEC-201`, `@SPEC-202` (émission migrée de `user/signed-up`).
- **Traçabilité** :
| Critère | Tests |
|---|---|
| CA-1 | int boîte d'envoi |
| CA-2 | int boîte d'envoi (échecs) |
| CA-3 | int pipeline ; e2e `@SPEC-203` |
| CA-4 | int tick ; e2e `@SPEC-203` |
| CA-5 | unit fenêtres locales |
| CA-6 | int mode en ligne ; e2e `@SPEC-203` |
| CA-7 | unit registre |

## 13. Preuves attendues

Vidéo du test e2e, captures de la frise terminée et du tableau du tick, mesure du temps de tick sur 2 000 utilisateurs (dans `acceptance.md`), rapports.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : `pnpm db:reset` applique la migration, `apps/worker` démarre avec le registre complet (test de fumée SPEC-007 rejoué), `JOBS_MODE=inline` refusé quand `NODE_ENV=production` (test unitaire de configuration).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0017 (3 reprises, étapes idempotentes), ADR-0067 (cron horaire minute 5, nocturne 01:30 UTC), ADR-0030, ADR-0047, ADR-0049.
- **Décisions créées** : ADR-0122 « Émission transactionnelle des événements par boîte d'envoi » (table `event_outbox`, fonction `enqueue_event`, renvoi horaire, 10 tentatives, mode `JOBS_MODE=inline`) ; ADR-0123 « Fenêtres locales, heures calmes et changements d'heure » (fenêtre `[T − 5 min, T + 55 min[`, `dueInWindow` + `sleepUntil` pour les heures à la demi-heure et les fuseaux décalés, règles DST).
- Hypothèse : la déduplication d'Inngest par identifiant d'événement couvre 24 h ; au-delà, les consommateurs restent idempotents par leurs propres clés.
- **Décisions prises à l'implémentation** : ADR-0252 (Inngest 4 : le catalogue Zod `EVENTS` de `@learny/contracts` remplace `EventSchemas().fromZod`, mode en ligne piloté par `InngestTestEngine` avec sommeils résolus, étapes rejouées et au plus 4 exécutions, `JobContext` construit dans `@learny/jobs` pour éviter le cycle `services` ↔ `jobs`, étape `tick-instant` qui fige T, `zonedParts`/`localTimeToInstant` dans `packages/core/src/zoned-time.ts` pour ne pas entrer en conflit avec `time.ts` de SPEC-207) ; ADR-0253 (`enqueue_event` borne les appelants `authenticated` à leurs propres événements et refuse `cron/*`).
- Écarts mineurs : une quatrième route de démonstration `GET /api/v1/dev/sdd/events/outbox` alimente la carte « Boîte d'envoi » de la page ; `GET …/events/demo/:runId` renvoie un état vide (200) tant que le pipeline n'a pas démarré (exécution asynchrone) ; l'appel `inngest.send('user/signed-up')` de SPEC-202 n'existe pas encore dans cette branche (SPEC-202 non fusionnée) : l'adaptation vers `emitAfterCommit` est faite à la fusion.
