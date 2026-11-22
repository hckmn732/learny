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
| engagement | 21 | **10** | 11 |

Les dix opérations de notification (inbox, réglages, abonnements push, désinscription) sont servies
par Python depuis le commit de bascule, **dans le même commit que leurs handlers**
(`tests/unit/test_handlers.py` impose `py_operations == HANDLERS`). Les onze autres
(`me.automations.*` 2, `me.automation-actions.*` 4, `me.pause.*` 4, `me.weekly-review.get`) relèvent
du **moteur d'automatismes** et de la revue hebdomadaire, non portés par cette tranche : voir
« Ce qui reste » dans `handover.md`.

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Implémentation TS |
|---|---|---|---|---|
| [x] | `email.unsubscribe` | POST | `/api/v1/email/unsubscribe` | `services/src/email/unsubscribe.ts` |
| [x] | `email.unsubscribe.page` | GET | `/api/v1/email/unsubscribe` | `api-routes/src/special/unsubscribe-page.ts` |
| [ ] | `me.automation-actions.accept` | POST | `/api/v1/me/automation-actions/:id/accept` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.decline` | POST | `/api/v1/me/automation-actions/:id/decline` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.list` | GET | `/api/v1/me/automation-actions` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.undo` | POST | `/api/v1/me/automation-actions/:id/undo` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automations.list` | GET | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automations.update` | PATCH | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.notificationSettings.get` | GET | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [x] | `me.notificationSettings.update` | PATCH | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [ ] | `me.pause.diagnostic` | POST | `/api/v1/me/pause/diagnostic` | `services/src/pause/index.ts` |
| [ ] | `me.pause.end` | DELETE | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.get` | GET | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.start` | POST | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.weekly-review.get` | GET | `/api/v1/me/weekly-review` | `services/src/weekly-review.ts` |
| [x] | `notifications.list` | GET | `/api/v1/notifications` | `services/src/notifications/list.ts` |
| [x] | `notifications.read` | POST | `/api/v1/notifications/:id/read` | `services/src/notifications/list.ts` |
| [x] | `notifications.readAll` | POST | `/api/v1/notifications/read-all` | `services/src/notifications/list.ts` |
| [x] | `notifications.unreadCount` | GET | `/api/v1/notifications/unread-count` | `services/src/notifications/list.ts` |
| [x] | `pushSubscriptions.delete` | DELETE | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |
| [x] | `pushSubscriptions.upsert` | POST | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |

## Couches livrées par cette tranche

| Couche | Contenu | Fichiers |
|---|---|---|
| Domaine (déjà committé) | routage, heures calmes, seize gabarits × deux tonalités | `learny/engagement/domain/*.py`, `shared/locale_fr/engagement.py` |
| Plateforme e-mail | modes `memory`/`smtp`/`resend`, Jinja2, en-têtes `List-Unsubscribe`, jeton HMAC de désinscription | `infrastructure/{email,email_templates,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2`, `shared/locale_fr/engagement_email.py` |
| Plateforme push | charge utile bornée, `safe_notification_url`, transports `mock`/`live` (VAPID serveur), décision par abonnement | `infrastructure/push.py` |
| Requêtes SQL | plus les énoncés du tour push et de l'expiration d'automatisation ; deux défauts latents corrigés (voir anomalies) | `infrastructure/queries.py` |
| Cas d'usage | `notify`, `deliver_notification`, `deliver_due_deliveries`, `send_push`, `count_sent_notifications`, inbox, réglages, abonnements, désinscription, `send_email`/`send_welcome_email`/`disable_email_channel` | `application/*.py` |
| Surface publique | `notify` et les cas d'usage exposés aux autres contextes | `learny/engagement/public.py` |
| Handlers | un `@handler` par opération, sans logique | `apps/api-py/src/learny_api/handlers/engagement.py` |
| Bascule | dix entrées `ts` → `py` dans `api/ownership.yaml` | même commit que les handlers |

## Cas d'usage appelés par les jobs (portés ici, branchés au worker en SPEC-2207)

| Cas d'usage | Job TS | Module TS | État |
|---|---|---|---|
| `deliver_notification` | `notification-delivery` | `notifications/src/deliveries.ts` | **porté et testé** |
| `deliver_due_deliveries` | `notifications-deferred-due` | `notifications/src/deliveries.ts` | **porté et testé** |
| `send_welcome_email` | `email-welcome` | `notifications/src/email/send.ts` | **porté** (testé par la plateforme ; câblage worker en SPEC-2207) |
| `plan_daily_digests` | `notifications-daily-digest` | `notifications/src/producers/*` | reste (producteur, SPEC-2207) |
| `send_daily_digest` | `notifications-daily-digest` | `notifications/src/digest.ts` | reste (job, SPEC-2207) |
| `sync_validation_quiz_reminders` | `notifications-reminders` | `notifications/src/producers/reminders.ts` | reste (producteur, SPEC-2207) |
| `expire_due_automation_actions` | `cron-hourly-tick` | `automations/src/moteur-d-automatismes.ts` | reste (moteur d'automatismes) |

## Dettes reprises par cette spécification

| Dette | Origine | Landing | État |
|---|---|---|---|
| `notify` absent : `learning.review.complete` et `learning.series.milestones` n'émettent pas de notification | `evidence/SPEC-2202/acceptance.md`, `evidence/SPEC-2203/acceptance.md` | `learny/engagement/application/notify.py`, exposé par `public.py`, branché dans `learny/learning` | **faite** : jalons `notions_100`/`streak_30` notifiés par `series.py`, réconciliation après la clôture de session dans `review.py` |
| `ensurePracticeExercise` (automatisation `jeu-lacune`) | `evidence/SPEC-2202/acceptance.md` | `learny/engagement/application/automations.py` | reste (moteur d'automatismes) |
| `gradeOpenAnswers` | contexte IA, **hors périmètre** (SPEC-2204) | — | — |

## Tests TypeScript à porter

Source : `evidence/SPEC-2001/test-port-map.md`. La correspondance fichier par fichier est tenue dans
`evidence/SPEC-2205/test-port-map.md`.

## Anomalies constatées

- **Deux défauts latents dans `queries.py`**, révélés par les premiers tests d'intégration : les
  énoncés SQL avaient été copiés mais **jamais exécutés**. `SELECT_NOTIFICATION` testait
  `:notification_id is null` sur un paramètre lié non typé (PostgreSQL refuse :
  `AmbiguousParameter`), et `LOAD_DELIVERY` ne sélectionnait pas `n.id`, si bien que la livraison
  chargée n'avait pas d'identifiant de notification (`NoSuchColumnError`). Corrigés dans
  `queries.py` (cast explicite, `n.id as id`), avec les tests qui les exécutent désormais.
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement`, pas 28 ; l'écart
  correspond aux sept cas d'usage appelés par les jobs, nommés par le plan P22 (constat déjà
  consigné pour SPEC-2203).
- Aucun ADR n'a été nécessaire : toutes les décisions prises sont couvertes par ADR-2015
  (dépendances), ADR-2011 (textes français isolés) et ADR-2008/ADR-1001 (textes copiés au mot près).
