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
| engagement | 21 | **14** | 7 |

Les dix opérations de notification (inbox, réglages, abonnements push, désinscription) sont servies
par Python depuis le commit `bee7ec77`. Le noyau du moteur d'automatismes (réglages, journal,
expiration) et la revue hebdomadaire sont servis depuis `21ee1819` et `34803cac`, **dans le même
commit que leurs handlers** (`tests/unit/test_handlers.py` impose `py_operations == HANDLERS`).

Restent à `ts` les sept opérations qui dépendent des **définitions** des dix automatismes ou du
service de pause :

| Opération | Dépendance |
|---|---|
| `me.automation-actions.accept` | `definition.apply` des dix automatismes (planner, échauffement, remédiation, cartes, jeu lacune, sprint) |
| `me.automation-actions.decline` | `definition.explain` des dix automatismes |
| `me.automation-actions.undo` | `definition.undo` + `reproposeAfterUndo` |
| `me.pause.get`, `me.pause.start`, `me.pause.end`, `me.pause.diagnostic` | `packages/services/src/pause/index.ts` (949 lignes) : transitions de formation, replanification, tirage du diagnostic |

Le détail de ce qui reste, dans l'ordre, est dans `handover.md`.

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Implémentation TS |
|---|---|---|---|---|
| [x] | `email.unsubscribe` | POST | `/api/v1/email/unsubscribe` | `services/src/email/unsubscribe.ts` |
| [x] | `email.unsubscribe.page` | GET | `/api/v1/email/unsubscribe` | `api-routes/src/special/unsubscribe-page.ts` |
| [ ] | `me.automation-actions.accept` | POST | `/api/v1/me/automation-actions/:id/accept` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.decline` | POST | `/api/v1/me/automation-actions/:id/decline` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automation-actions.list` | GET | `/api/v1/me/automation-actions` | `automations/src/moteur-d-automatismes.ts` |
| [ ] | `me.automation-actions.undo` | POST | `/api/v1/me/automation-actions/:id/undo` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automations.list` | GET | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.automations.update` | PATCH | `/api/v1/me/automations` | `automations/src/moteur-d-automatismes.ts` |
| [x] | `me.notificationSettings.get` | GET | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [x] | `me.notificationSettings.update` | PATCH | `/api/v1/me/notification-settings` | `services/src/parametres-notifications.ts` |
| [ ] | `me.pause.diagnostic` | POST | `/api/v1/me/pause/diagnostic` | `services/src/pause/index.ts` |
| [ ] | `me.pause.end` | DELETE | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.get` | GET | `/api/v1/me/pause` | `services/src/pause/index.ts` |
| [ ] | `me.pause.start` | POST | `/api/v1/me/pause` | `services/src/pause/index.ts` |
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
| Plateforme e-mail | modes `memory`/`smtp`/`resend`, Jinja2, en-têtes `List-Unsubscribe`, jeton HMAC | `infrastructure/{email,email_templates,unsubscribe,unsubscribe_page}.py`, `templates/email/*.j2` |
| Plateforme push | charge utile bornée, transports `mock`/`live`, décision par abonnement | `infrastructure/push.py` |
| Requêtes SQL | notifications, réglages, abonnements, réglages d'automatismes, journal filtré, pause active, expiration, quatre mesures de la revue | `infrastructure/queries.py` |
| Cas d'usage | `notify`, livraisons, inbox, réglages, abonnements, désinscription, `send_email` ; réglages/journal/expiration des automatismes ; revue hebdomadaire | `application/*.py` |
| Surface publique | les cas d'usage exposés aux autres contextes | `learny/engagement/public.py` |
| Handlers | un `@handler` par opération, sans logique | `apps/api-py/src/learny_api/handlers/engagement.py` |
| Bascule | quatorze entrées `ts` → `py` dans `api/ownership.yaml` | même commit que les handlers |
| Oracle | vecteurs TS du moteur, rejoués par pytest | `tools/engagement/oracle-automations.mjs`, `tests/fixtures/engagement_automations.json` |

## Cas d'usage appelés par les jobs (portés ici, branchés au worker en SPEC-2207)

| Cas d'usage | Job TS | Module TS | État |
|---|---|---|---|
| `deliver_notification` | `notification-delivery` | `notifications/src/deliveries.ts` | **porté et testé** |
| `deliver_due_deliveries` | `notifications-deferred-due` | `notifications/src/deliveries.ts` | **porté et testé** |
| `send_welcome_email` | `email-welcome` | `notifications/src/email/send.ts` | **porté** (câblage worker en SPEC-2207) |
| `expire_due_automation_actions` | `cron-hourly-tick` | `automations/src/moteur-d-automatismes.ts` | **porté et testé** (`application/automations.py`) |
| `ensurePracticeExercise` | job `jeu-lacune` | `services/src/...` (`ensurePracticeExercise`) | reste (effet de la définition `jeu_lacune`) |
| `plan_daily_digests` | `notifications-daily-digest` | `notifications/src/producers/*` | reste (producteur, SPEC-2207) |
| `send_daily_digest` | `notifications-daily-digest` | `notifications/src/digest.ts` | reste (job, SPEC-2207) |
| `sync_validation_quiz_reminders` | `notifications-reminders` | `notifications/src/producers/reminders.ts` | reste (producteur, SPEC-2207) |

## Dettes reprises par cette spécification

| Dette | Origine | Landing | État |
|---|---|---|---|
| `notify` absent : `learning.review.complete` et `learning.series.milestones` n'émettent pas de notification | `evidence/SPEC-2202/acceptance.md`, `evidence/SPEC-2203/acceptance.md` | `learny/engagement/application/notify.py` | **faite** (`bee7ec77`) |
| `ensurePracticeExercise` (automatisation `jeu-lacune`) | `evidence/SPEC-2202/acceptance.md` | `learny/engagement/application/automations.py` | reste : dépend de la définition `jeu_lacune` |
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
  la table de translittération du tri français utilise des échappements Unicode pour que les sources
  hors `locale_fr` restent ASCII (ADR-2011, `tests/unit/shared/test_language_policy.py`).
- **Rôle de service du tick d'expiration** : `learny.engagement.application.automations` est déclaré
  dans `shared/db/privileged.py` avec sa raison, comme les autres balayages système (SPEC-2101).
- **Décompte 28 vs 21** : l'inventaire contient 21 opérations `engagement`, pas 28 ; l'écart
  correspond aux sept cas d'usage appelés par les jobs, nommés par le plan P22.
- Aucun ADR n'a été nécessaire : ADR-2015 (dépendances), ADR-2011 (langue), ADR-2008/ADR-1001
  (textes) et ADR-2010 (rôle de service) couvrent les décisions prises.
