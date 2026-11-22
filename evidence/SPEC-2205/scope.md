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
| engagement | 21 | voir `acceptance.md` | voir `acceptance.md` |

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Implémentation TS |
|---|---|---|---|---|
| [ ] | `email.unsubscribe` | POST | `/api/v1/email/unsubscribe` | `services/src/email/unsubscribe.ts` |
| [ ] | `email.unsubscribe.page` | GET | `/api/v1/email/unsubscribe` | `api-routes/src/special/unsubscribe-page.ts` |
| [ ] | `me.automation-actions.accept` | POST | `/api/v1/me/automation-actions/:id/accept` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.decline` | POST | `/api/v1/me/automation-actions/:id/decline` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.list` | GET | `/api/v1/me/automation-actions` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.undo` | POST | `/api/v1/me/automation-actions/:id/undo` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automations.list` | GET | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automations.update` | PATCH | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.notificationSettings.get` | GET | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [ ] | `me.notificationSettings.update` | PATCH | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [ ] | `me.pause.diagnostic` | POST | `/api/v1/me/pause/diagnostic` | `services/src/pause/index.ts` |
| [ ] | `me.pause.end` | DELETE | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.get` | GET | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.start` | POST | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.weekly-review.get` | GET | `/api/v1/me/weekly-review` | `services/src/weekly-review.ts` |
| [ ] | `notifications.list` | GET | `/api/v1/notifications` | `services/src/notifications/list.ts` |
| [ ] | `notifications.read` | POST | `/api/v1/notifications/:id/read` | `services/src/notifications/list.ts` |
| [ ] | `notifications.readAll` | POST | `/api/v1/notifications/read-all` | `services/src/notifications/list.ts` |
| [ ] | `notifications.unreadCount` | GET | `/api/v1/notifications/unread-count` | `services/src/notifications/list.ts` |
| [ ] | `pushSubscriptions.delete` | DELETE | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |
| [ ] | `pushSubscriptions.upsert` | POST | `/api/v1/me/push-subscriptions` | `notifications/src/push/subscriptions.ts` |

## Cas d'usage appelés par les jobs (portés ici, branchés au worker en SPEC-2207)

| Cas d'usage | Job TS | Module TS |
|---|---|---|
| `deliver_notification` | `notification-delivery` | `notifications/src/deliveries.ts` |
| `deliver_due_deliveries` | `notifications-deferred-due` | `notifications/src/deliveries.ts` |
| `plan_daily_digests` | `notifications-daily-digest` | `notifications/src/producers/*` |
| `send_daily_digest` | `notifications-daily-digest` | `notifications/src/digest.ts` |
| `sync_validation_quiz_reminders` | `notifications-reminders` | `notifications/src/producers/reminders.ts` |
| `send_welcome_email` | `email-welcome` | `notifications/src/email/send.ts` |
| `expire_due_automation_actions` | `cron-hourly-tick` | `automations/src/moteur-d-automatismes.ts` |

## Dettes reprises par cette spécification

| Dette | Origine | Landing |
|---|---|---|
| `notify` absent : `learning.review.complete` et `learning.series.milestones` n'émettent pas de notification | `evidence/SPEC-2202/acceptance.md`, `evidence/SPEC-2203/acceptance.md` | `learny/engagement/application/notify.py`, exposé par `public.py`, branché dans `learny/learning` |
| `ensurePracticeExercise` (automatisation `jeu-lacune`) | `evidence/SPEC-2202/acceptance.md` | `learny/engagement/application/automations.py` |
| `gradeOpenAnswers` | contexte IA, **hors périmètre** (SPEC-2204) | — |

## Tests TypeScript à porter

Source : `evidence/SPEC-2001/test-port-map.md`. Les fichiers de test du périmètre engagement y
sont listés ; chaque cas est rejoué par un test pytest au nom unique, la correspondance étant
tenue dans `evidence/SPEC-2205/test-port-map.md`.
