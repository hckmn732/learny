# Périmètre — SPEC-2205 (domaine Engagement : notifications et automatismes)

Source unique : `api/inventory.json`, filtré sur `context == "engagement"`. L'inventaire fait foi
(ADR-2005, ADR-1001) : il contient **21 opérations** de contexte `engagement` et **aucune route
spéciale**. Le plan P22 et le titre de la spécification annoncent « 28 opérations » : l'écart de
sept unités correspond aux **cas d'usage appelés par les jobs** que le plan nomme explicitement
(`deliver_notification`, `deliver_due_deliveries`, `plan_daily_digests`, `send_daily_digest`,
`sync_validation_quiz_reminders`, `send_welcome_email`, `expire_due_automation_actions`), portés
ici parce que les consommateurs basculent en SPEC-2207 mais que leur logique appartient à ce
contexte. La liste exacte des entrées HTTP à basculer reste les 21 ci-dessous (constat consigné
dans l'`acceptance.md`, comme pour SPEC-2203).

## État de la bascule

| Contexte | Opérations | `py` | `ts` restantes |
|---|---|---|---|
| engagement | 21 | **21** | 0 |

Les dix opérations de notification (inbox, réglages, abonnements push, désinscription) sont servies
par Python depuis le commit `bee7ec77`. Le noyau du moteur d'automatismes (réglages, journal,
expiration) et la revue hebdomadaire sont servis depuis `21ee1819` et `34803cac`, **dans le même
commit que leurs handlers** (`tests/unit/test_handlers.py` impose `py_operations == HANDLERS`).
Les définitions des dix automatismes et le service de pause ont été portés par `512aeac2`,
`8c68ca0c` et `8f85fcba`, ce qui bascule les sept dernières opérations (`accept`, `decline`, `undo`
et les quatre opérations de pause).

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Implémentation TS |
|---|---|---|---|---|
| [x] | `email.unsubscribe` | POST | `/api/v1/email/unsubscribe` | `services/src/email/unsubscribe.ts` |
| [x] | `email.unsubscribe.page` | GET | `/api/v1/email/unsubscribe` | `api-routes/src/special/unsubscribe-page.ts` |
| [x] | `me.automation-actions.accept` | POST | `/api/v1/me/automation-actions/:id/accept` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automation-actions.decline` | POST | `/api/v1/me/automation-actions/:id/decline` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automation-actions.list` | GET | `/api/v1/me/automation-actions` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automation-actions.undo` | POST | `/api/v1/me/automation-actions/:id/undo` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automations.list` | GET | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automations.update` | PATCH | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.notificationSettings.get` | GET | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [x] | `me.notificationSettings.update` | PATCH | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [x] | `me.pause.diagnostic` | POST | `/api/v1/me/pause/diagnostic` | `services/src/pause/index.ts` |
| [x] | `me.pause.end` | DELETE | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [x] | `me.pause.get` | GET | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [x] | `me.pause.start` | POST | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [x] | `me.weekly-review.get` | GET | `/api/v1/me/weekly-review` | `services/src/weekly-review.ts` |
| [x] | `notifications.list` | GET | `/api/v1/notifications` | `services/src/notifications/list.ts` |
| [x] | `notifications.read` | POST | `/api/v1/notifications/:id/read` | `services/src/notifications/list.ts` |
| [x] | `notifications.readAll` | POST | `/api/v1/notifications/read-all` | `services/src/notifications/list.ts` |
| [x] | `notifications.unreadCount` | GET | `/api/v1/notifications/unread-count` | `services/src/notifications/list.ts` |
| [x] | `pushSubscriptions.delete` | DELETE | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |
| [x] | `pushSubscriptions.upsert` | POST | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |

## Couches livrées

| Couche | Contenu | Fichiers |
|---|---|---|
| Domaine notifications | routage, heures calmes, seize gabarits × deux tonalités | `learny/engagement/domain/{routing,quiet,templates}.py` |
| Domaine automatismes | vocabulaires, schémas des dix paramètres, résumés d'une ligne, ordre stable et curseur, expiration, semaines locales, libellés de la revue, textes de la pause, registre et validation d'un brouillon | `learny/engagement/domain/automations/*.py`, `shared/locale_fr/engagement_automations.py` |
| Domaine des jobs | fenêtres locales du tick (DST, zones à demi-heure), libellés et durée du programme du jour, calcul des rappels (40 minutes, clé de dédoublonnage, libellé local), exercice pratique déterministe | `domain/{tick,digest,reminders,practice}.py`, `shared/locale_fr/engagement_exercises.py` |
| Plateforme e-mail | modes `memory`/`smtp`/`resend`, Jinja2, en-têtes `List-Unsubscribe`, jeton HMAC | `infrastructure/{email,email_templates,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2` |
| Plateforme push | charge utile bornée, transports `mock`/`live`, décision par abonnement | `infrastructure/push.py` |
| Requêtes SQL | notifications, réglages, abonnements, réglages d'automatismes, journal filtré, pause active, expiration, quatre mesures de la revue, pages du tick, agenda et envois écartés de la veille, créneaux de quiz à rappeler, exercice pratique | `infrastructure/queries.py` |
| Cas d'usage | `notify`, livraisons, inbox, réglages, abonnements, désinscription, `send_email` ; réglages/journal/expiration des automatismes ; revue hebdomadaire ; `plan_daily_digests`, `send_daily_digest`, `sync_validation_quiz_reminders`, `ensure_practice_exercise` | `application/*.py` |
| Surface publique | les cas d'usage exposés aux autres contextes | `learny/engagement/public.py` |
| Handlers | un `@handler` par opération, sans logique | `apps/api-py/src/learny_api/handlers/engagement.py` |
| Bascule | vingt-et-une entrées `ts` → `py` dans `api/ownership.yaml` | même commit que les handlers |
| Oracle | vecteurs TS du moteur, des fenêtres, des rappels et des libellés, rejoués par pytest | `tools/engagement/oracle-{automations,jobs}.mjs`, `tests/fixtures/engagement_{automations,jobs}.json` |

## Cas d'usage appelés par les jobs (portés ici, branchés au worker en SPEC-2207)

| Cas d'usage | Job TS | Module TS | État |
|---|---|---|---|
| `deliver_notification` | `notification-delivery` | `notifications/src/deliveries.ts` | **porté et testé** |
| `deliver_due_deliveries` | `notifications-deferred-due` | `notifications/src/deliveries.ts` | **porté et testé** |
| `send_welcome_email` | `email-welcome` | `notifications/src/email/send.ts` | **porté** (câblage worker en SPEC-2207) |
| `expire_due_automation_actions` | `cron-hourly-tick` | `automations/src/moteur-d-automatismes.ts` | **porté et testé** (`application/automations.py`) |
| `ensurePracticeExercise` | job `jeu-lacune` | `services/src/exercises/ensure-practice-exercise.ts` | **porté et testé** (`application/practice_exercises.py`) |
| `plan_daily_digests` | `notifications-daily-digest` | `notifications/src/digest.ts` | **porté et testé** (`application/digest.py`) |
| `send_daily_digest` | `notifications-daily-digest` | `notifications/src/digest.ts` | **porté et testé** (`application/digest.py`) |
| `sync_validation_quiz_reminders` | `notifications-reminders` | `notifications/src/producers/reminders.ts` | **porté et testé** (`application/reminders.py`) |

## Dettes reprises par cette spécification

| Dette | Origine | Landing | État |
|---|---|---|---|
| `notify` absent : `learning.review.complete` et `learning.series.milestones` n'émettent pas de notification | `evidence/SPEC-2202/acceptance.md`, `evidence/SPEC-2203/acceptance.md` | `learny/engagement/application/notify.py` | **faite** (`bee7ec77`) |
| `ensurePracticeExercise` (automatisation `jeu-lacune`) | `evidence/SPEC-2202/acceptance.md` | `learny/engagement/application/practice_exercises.py` | **faite** (câblage worker en SPEC-2207) |
| `gradeOpenAnswers` | contexte IA, **hors périmètre** (SPEC-2204) | — | — |

## Tests TypeScript à porter

Source : `evidence/SPEC-2001/test-port-map.md`. La correspondance fichier par fichier est tenue dans
`evidence/SPEC-2205/test-port-map.md`.

## Anomalies constatées

- **Deux défauts latents dans `queries.py`** (tranche notifications) : `SELECT_NOTIFICATION` testait
  `:notification_id is null` sur un paramètre lié non typé (`AmbiguousParameter`) et `LOAD_DELIVERY`
  ne sélectionnait pas `n.id` (`NoSuchColumnError`). Corrigés, avec les tests qui les exécutent.
- **Politique de langue** : les textes vus par l'utilisateur du moteur (résumés, libellés, messages
  zod recopiés, phrases de la pause) sont isolés dans `shared/locale_fr/engagement_automations.py` ;
  le contenu déterministe de l'exercice pratique et les libellés des jobs sont dans
  `shared/locale_fr/engagement_exercises.py` et `engagement.py`. Les sources hors `locale_fr`
  restent ASCII, échappements Unicode compris (ADR-2011, `tests/unit/shared/test_language_policy.py`).
- **Rôle de service des ticks** : `learny.engagement.application.automations`, `.digest` et
  `.reminders` sont déclarés dans `shared/db/privileged.py` avec leur raison, comme les autres
  balayages système (SPEC-2101).
- **Balayages globaux** : `plan_daily_digests` et `sync_validation_quiz_reminders` lisent tous les
  apprenants, comme les jobs TypeScript. Leurs tests d'intégration neutralisent, dans la transaction
  annulée, les lignes semées par les autres suites locales ; aucune ligne n'est modifiée hors de la
  transaction.
- **Placement de `ensurePracticeExercise`** : le cas d'usage vit dans le contexte `engagement`
  (P22, cas d'usage appelé par le job) alors que le cycle de vie de l'exercice reste dans
  `assessments` ; aucune duplication, l'exercice créé est lu par `assessments`.
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement`, pas 28 ; l'écart
  correspond aux sept cas d'usage appelés par les jobs, nommés par le plan P22.
- Aucun ADR n'a été nécessaire : ADR-2015 (dépendances), ADR-2011 (langue), ADR-2008/ADR-1001
  (textes) et ADR-2010 (rôle de service) couvrent les décisions prises.
