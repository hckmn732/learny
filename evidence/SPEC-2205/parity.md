# Parité contractuelle — SPEC-2205

Référence enregistrée depuis Hono sur `:3112`, rejouée contre la façade FastAPI sur `:3101` par
`corepack pnpm parity:record|check --group engagement` (`tools/parity/run.ts`). Les scénarios sont
générés pour **les lectures sans paramètre de chemin** (`generatedScenarios`) ; les mutations et les
routes à paramètre de chemin sont prouvées par les tests d'intégration serveur (voir plus bas).

## Campagne de clôture exécutée (2026-11-22, HEAD `3ddd07ae`)

Méthode : clés Supabase lues par `supabase status -o env`, `TEST_SERVER_ENV` et
`TEST_ENCRYPTION_KEY` lus depuis `packages/testing/src/env.ts`, Hono sur `:3112` (`APP_ENV=test`,
`PORT=3112`, `JOBS_MODE=inline`, `EMAIL_MODE=memory`, `PUSH_MODE=mock`, `LLM_MODE=mock`,
`CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `TZ=UTC`), puis façade sur `:3101`
(`PY_HONO_UPSTREAM_URL=http://127.0.0.1:3112`, `APP_ENV=test`, `LLM_MODE=mock`, mêmes clés). Les
deux serveurs répondent `{"status":"ok"}` avant la campagne. Aucun `flock` : la campagne de parité
ne remet pas la base à zéro et ne partage aucune transaction avec les suites.

```
$ corepack pnpm parity:record --target http://127.0.0.1:3112 --group engagement
Recorded 8 scenarios against http://127.0.0.1:3112

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group engagement
Parity OK: 8 scenarios replay identically against http://127.0.0.1:3101.
```

**Aucune divergence** : les huit entrées rejouent à l'identique (statut, en-têtes de
`COMPARED_HEADERS`, corps JSON normalisé). L'enregistrement n'a **modifié aucune ligne existante** de
`api/oracles/recordings/reads.json` : `git status --short api/oracles/recordings/reads.json` est vide
avant et après la campagne, l'oracle de SPEC-2001 est inchangé.

## Rejeu des groupes existants : aucune régression de la façade

```
$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group identity
Parity OK: 7 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group formation
Parity OK: 2 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group learning
Parity OK: 4 scenarios replay identically against http://127.0.0.1:3101.

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group assessments
Parity OK: 1 scenarios replay identically against http://127.0.0.1:3101.
```

**22 scénarios rejoués à l'identique, zéro divergence** : la bascule des vingt-et-une entrées
`engagement` n'a rien changé pour les contextes déjà servis (7 + 2 + 4 + 1).

## Scénarios et propriétaire

| Scénario | Opération | Propriétaire | Ce qui est comparé |
|---|---|---|---|
| `notifications.list` | GET `/api/v1/notifications` | `py` | 200, boîte vide, `total: 0`, compteur, fuseau du profil |
| `notifications.unreadCount` | GET `/api/v1/notifications/unread-count` | `py` | 200, `{"count": 0}` |
| `me.notificationSettings.get` | GET `/api/v1/me/notification-settings` | `py` | 200, DTO normalisé complet (canaux, six types, heures calmes, plafond, `updatedAt`) |
| `email.unsubscribe.page` | GET `/api/v1/email/unsubscribe` sans `token` | `py` | 400 `problem+json` (validation `token` obligatoire) |
| `me.automations.list` | GET `/api/v1/me/automations` | `py` | 200, dix réglages dans l'ordre de l'énumération, `params` canoniques, `paused: false`, `updatedAt` du déclencheur d'inscription |
| `me.automation-actions.list` | GET `/api/v1/me/automation-actions` | `py` | 200, page vide, `weekCount: 0`, `nextCursor: null` |
| `me.pause.get` | GET `/api/v1/me/pause` | `py` | 200, état `none` (`status: "none"`, `returnDue: false`, `pausedFormationIds: []`) |
| `me.weekly-review.get` | GET `/api/v1/me/weekly-review` | `py` | 200, état vide explicite (`available: false`, `review: null`) et fuseau du profil |

Les huit entrées du groupe sont **toutes servies par Python** depuis la bascule finale
(`me.pause.get` a rejoint les sept autres lors du portage du service de pause, commits `8f85fcba` et
suivants) ; le rejeu prouve que la réponse est identique à celle enregistrée depuis Hono.

## Matrice entrée → cas d'usage → règles → tables → tests

Chaque ligne est une opération `engagement` de `api/inventory.json` (21 / 21 à `py` dans
`api/ownership.yaml`). Les chemins de tests sont relatifs à `packages-py/learny/tests/`.

| Entrée | Cas d'usage | Règles | Tables | Tests |
|---|---|---|---|---|
| `email.unsubscribe` | `unsubscribe_by_token` (`application/unsubscribe.py`) | SPEC-209 (désinscription), jeton HMAC | `notification_settings`, `profiles` | `integration/engagement/test_engagement_unsubscribe.py` |
| `email.unsubscribe.page` | `unsubscribe_form`, `unsubscribe_invalid`, `unsubscribe_done` (`application/unsubscribe.py`) | SPEC-209 (pages serveur) | `notification_settings` | `integration/engagement/test_engagement_unsubscribe.py`, `unit/engagement/test_engagement_platform.py` |
| `me.automation-actions.accept` | `accept_automation_action` (`application/automations.py`) | SPEC-711, BR-AUT-12, CL-2 | `automation_actions`, `automation_settings`, `schedule_slots`, `activities`, `bricks`, `notion_states` | `integration/engagement/test_engagement_automations_decisions.py` |
| `me.automation-actions.decline` | `decline_automation_action` (`application/automations.py`) | SPEC-711, BR-AUT-12 | `automation_actions` | `integration/engagement/test_engagement_automations_decisions.py` |
| `me.automation-actions.list` | `list_my_automation_actions` (`application/automations.py`) | SPEC-711 ET-5, BR-AUT-12 | `automation_actions`, `profiles` | `integration/engagement/test_engagement_automations_journal.py` |
| `me.automation-actions.undo` | `undo_automation_action` (`application/automations.py`) | SPEC-711, BR-AUT-12, CL-2 | `automation_actions`, tables d'effet | `integration/engagement/test_engagement_automations_decisions.py` |
| `me.automations.list` | `list_my_automations` (`application/automations.py`) | SPEC-711, BR-AUT-12, pause active | `automation_settings`, `profiles`, `pauses` | `integration/engagement/test_engagement_automations_settings.py` |
| `me.automations.update` | `update_my_automation_setting` (`application/automations.py`) | SPEC-711, schémas zod, BR-AUT-12 | `automation_settings`, `profiles` | `integration/engagement/test_engagement_automations_settings.py` |
| `me.notificationSettings.get` | `get_notification_settings` (`application/settings.py`) | SPEC-102, BR-NOT-04, CL-1 | `notification_settings`, `profiles` | `integration/engagement/test_engagement_settings.py` ; e2e `@SPEC-2205` |
| `me.notificationSettings.update` | `update_notification_settings` (`application/settings.py`) | SPEC-102, BR-NOT-04, CL-2 (409) | `notification_settings`, `profiles` | `integration/engagement/test_engagement_settings.py` |
| `me.pause.diagnostic` | `complete_pause_diagnostic` (`application/pause.py`) | SPEC-721, BR-AUT-10, ADR-0016 | `pauses`, `formations`, `schedule_slots`, `automation_actions`, `daily_activity` | `integration/engagement/test_engagement_pause.py` |
| `me.pause.end` | `end_pause` (`application/pause.py`) | SPEC-721, BR-AUT-10 | `pauses`, `formations`, `automation_actions` | `integration/engagement/test_engagement_pause.py` |
| `me.pause.get` | `get_pause_state` (`application/pause.py`) | SPEC-721, BR-AUT-10 | `pauses`, `profiles`, `automation_actions` | `integration/engagement/test_engagement_pause.py` |
| `me.pause.start` | `start_pause` (`application/pause.py`) | SPEC-721, BR-AUT-10 | `pauses`, `formations`, `schedule_slots`, `automation_actions` | `integration/engagement/test_engagement_pause.py` |
| `me.weekly-review.get` | `get_weekly_review` (`application/weekly_review.py`) | SPEC-720, BR-AUT-09, CL-1 | `automation_actions`, `schedule_slots`, `modules`, `review_logs`, `notions`, `notion_states` | `integration/engagement/test_engagement_weekly_review.py` |
| `notifications.list` | `list_notifications` (`application/inbox.py`) | BR-NOT-01, ET-3, CL-1 | `notifications`, `profiles` | `integration/engagement/test_engagement_inbox.py` |
| `notifications.read` | `mark_notification_read` (`application/inbox.py`) | BR-NOT-01, CL-1, CL-2 | `notifications`, `notification_deliveries` | `integration/engagement/test_engagement_inbox.py` ; e2e `@SPEC-2205` |
| `notifications.readAll` | `mark_all_read` (`application/inbox.py`) | BR-NOT-01, CL-2 | `notifications`, `notification_deliveries` | `integration/engagement/test_engagement_inbox.py` |
| `notifications.unreadCount` | `get_unread_notification_count` (`application/inbox.py`) | BR-NOT-01, ET-1 | `notifications` | `integration/engagement/test_engagement_inbox.py` ; e2e `@SPEC-2205` |
| `pushSubscriptions.delete` | `remove_push_subscription` (`application/subscriptions.py`) | SPEC-205, SPEC-209 | `push_subscriptions` | `integration/engagement/test_engagement_push_subscriptions.py` |
| `pushSubscriptions.upsert` | `upsert_push_subscription` (`application/subscriptions.py`) | SPEC-205, SPEC-209 | `push_subscriptions` | `integration/engagement/test_engagement_push_subscriptions.py` |

## Cas d'usage de job : preuve par les tests, pas par HTTP

Les quatre cas d'usage appelés par des jobs n'ont **aucune entrée HTTP** : la parité contractuelle ne
peut pas les couvrir, et ils ne sont pas inventés dans `reads.json`. Ils sont prouvés par les
vecteurs de l'oracle TypeScript (`tools/engagement/oracle-jobs.mjs` →
`tests/fixtures/engagement_jobs.json`) et par les tests d'intégration :

| Cas d'usage | Job TS | Preuve |
|---|---|---|
| `ensure_practice_exercise` | `jeu-lacune` | `unit/engagement/test_engagement_jobs_domain.py`, `integration/engagement/test_engagement_jobs.py` |
| `plan_daily_digests` | `notifications-daily-digest` | idem (fenêtres locales, DST, zones à demi-heure) |
| `send_daily_digest` | `notifications-daily-digest` | idem (programme du jour, plafonds 3/5/8, dédup) |
| `sync_validation_quiz_reminders` | `notifications-reminders` | idem (rappel à 40 minutes, rejeu sans doublon, annulation) |

Le câblage au worker Python (dispatcher, ordonnanceur) relève de **SPEC-2207** (ADR-2014,
ADR-2006) : ces cas d'usage sont appelables et testés, aucune réponse HTTP n'en dépend.

## Ce que la parité générée ne couvre pas, et sa preuve

| Opérations | Motif | Preuve |
|---|---|---|
| `notifications.read`, `notifications.readAll` | mutation (POST) | `tests/integration/engagement/test_engagement_inbox.py` ; e2e `@SPEC-2205` pour `read` |
| `me.notificationSettings.update` | mutation (PATCH) | `tests/integration/engagement/test_engagement_settings.py` (patch partiel, 409, RLS) |
| `pushSubscriptions.upsert`, `pushSubscriptions.delete` | mutations | `tests/integration/engagement/test_engagement_push_subscriptions.py` |
| `email.unsubscribe` | mutation (POST, jeton en requête) | `tests/integration/engagement/test_engagement_unsubscribe.py` + `tests/unit/engagement/test_engagement_platform.py` |
| `me.automations.update` | mutation (PATCH) | `tests/integration/engagement/test_engagement_automations_settings.py` (défauts canoniques, patch partiel, alias historique, 400 avec le message zod, RLS, pause active) |
| `me.automation-actions.accept` / `.decline` / `.undo` | mutations à paramètre de chemin | `tests/integration/engagement/test_engagement_automations_decisions.py` (effet unique, rejeu, 404, 409, 422) |
| `me.pause.start` / `.end` / `.diagnostic` | mutations | `tests/integration/engagement/test_engagement_pause.py` (gel, reprise, rejeu, 409, 422, diagnostic déterministe) |
| `me.automations.list` / `me.automation-actions.list` (filtres, curseur, compteur) | la parité générée n'appelle aucune route avec requête | `tests/integration/engagement/test_engagement_automations_journal.py` (ordre stable, filtres, curseur, compteur hebdomadaire, expiration, RLS) |
| `me.weekly-review.get` (charge figée et recalcul) | la parité générée ne couvre que l'état vide | `tests/integration/engagement/test_engagement_weekly_review.py` (charge complète, charge partielle recalculée, `actionId` étranger → 404) |
| `notify` et les envois différés | aucune route HTTP | `tests/integration/engagement/test_engagement_notify.py` |
| Règles pures du moteur (schémas de paramètres, résumés, ordre, curseur, expiration, semaines, libellés, pause) | aucune route dédiée | `tests/unit/engagement/test_engagement_automations_domain.py`, oracle `tools/engagement/oracle-automations.mjs` |

## Divergences connues, documentées et sans effet observable

| Constat | Décision |
|---|---|
| Le HTML des e-mails n'est pas identique octet pour octet à celui de React Email (`@react-email/render` produit des tables imbriquées) : les gabarits Jinja2 reprennent les **mêmes textes au mot près**, les mêmes jetons de couleur, la même largeur de 600 px et les mêmes en-têtes `List-Unsubscribe`. | Aucun oracle ne compare ce HTML : il n'est ni une réponse HTTP ni une page du web (le HTML des pages de désinscription, lui, est servi par l'API et comparé par l'intégration). Écart de structure DOM documenté ici, textes et sujets vérifiés par `test_engagement_platform.py`. |
| L'identifiant de message des transports `memory` et `smtp` est déterministe (`mem_<sha256(clé)>`, `smtp_<sha256(clé)>`) au lieu d'un UUID aléatoire : aucune source aléatoire n'est autorisée dans le code métier. | Cet identifiant n'apparaît dans aucune réponse ni aucun journal public (seul le journal du serveur le porte). |
| `email.unsubscribe.page` répond 400 sur le scénario généré : l'outil appelle la route sans `token`, les deux runtimes répondent la même erreur de validation. | La page valide (200) et la page altérée (400) sont prouvées par `test_engagement_platform.py` et `test_engagement_unsubscribe.py`. |
| Le tri français des notions à risque est reproduit par une table de translittération (accents retirés) au lieu de `Intl.Collator` : la locale du processus ne doit pas décider du résultat (ADR-0047). | Les libellés comparés par les tests sont des mots simples ; l'ordre est prouvé par les vecteurs de l'oracle (`atRisk.sorted`). |
