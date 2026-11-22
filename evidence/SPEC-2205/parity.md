# Parité contractuelle — SPEC-2205

Référence enregistrée depuis Hono sur `:3112`, rejouée contre la façade FastAPI sur `:3101` par
`corepack pnpm parity:record|check --group engagement` (`tools/parity/run.ts`). Les scénarios sont
générés pour **les lectures sans paramètre de chemin** (`generatedScenarios`) ; les mutations et les
routes à paramètre de chemin sont prouvées par les tests d'intégration serveur (voir plus bas).

## Campagne exécutée (2026-11-22, après le moteur d'automatismes)

Méthode : clés Supabase lues par `supabase status -o env`, `TEST_SERVER_ENV` et
`TEST_ENCRYPTION_KEY` lus depuis `packages/testing/src/env.ts`, Hono sur `:3112` (`APP_ENV=test`,
`PORT=3112`, `JOBS_MODE=inline`, `EMAIL_MODE=memory`, `PUSH_MODE=mock`, `LLM_MODE=mock`,
`CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `TZ=UTC`), puis façade sur `:3101`
(`PY_HONO_UPSTREAM_URL=http://127.0.0.1:3112`, `APP_ENV=test`, `LLM_MODE=mock`, mêmes clés). Les
deux serveurs répondent `{"status":"ok"}` avant la campagne.

```
$ corepack pnpm parity:record --target http://127.0.0.1:3112 --group engagement
Recorded 8 scenarios against http://127.0.0.1:3112

$ corepack pnpm parity:check --target http://127.0.0.1:3101 --group engagement
Parity OK: 8 scenarios replay identically against http://127.0.0.1:3101.
```

**Aucune divergence** : les huit entrées rejouent à l'identique (statut, en-têtes de
`COMPARED_HEADERS`, corps JSON normalisé). L'enregistrement n'a **modifié aucune ligne existante** de
`api/oracles/recordings/reads.json` (`git status` vide après `--record`) : les réponses de référence
sont identiques à la campagne précédente.

## Scénarios et propriétaire

| Scénario | Opération | Propriétaire | Ce qui est comparé |
|---|---|---|---|
| `notifications.list` | GET `/api/v1/notifications` | `py` | 200, boîte vide, `total: 0`, compteur, fuseau du profil |
| `notifications.unreadCount` | GET `/api/v1/notifications/unread-count` | `py` | 200, `{"count": 0}` |
| `me.notificationSettings.get` | GET `/api/v1/me/notification-settings` | `py` | 200, DTO normalisé complet (canaux, six types, heures calmes, plafond, `updatedAt`) |
| `email.unsubscribe.page` | GET `/api/v1/email/unsubscribe` sans `token` | `py` | 400 `problem+json` (validation `token` obligatoire) |
| `me.automations.list` | GET `/api/v1/me/automations` | **`py`** | 200, dix réglages dans l'ordre de l'énumération, `params` canoniques, `paused: false`, `updatedAt` du déclencheur d'inscription |
| `me.automation-actions.list` | GET `/api/v1/me/automation-actions` | **`py`** | 200, page vide, `weekCount: 0`, `nextCursor: null` |
| `me.pause.get` | GET `/api/v1/me/pause` | `ts` | 200 relayé à Hono, inchangé (état `none`) |
| `me.weekly-review.get` | GET `/api/v1/me/weekly-review` | **`py`** | 200, état vide explicite (`available: false`, `review: null`) et fuseau du profil |

Les trois entrées passées à `py` dans cette tranche (`me.automations.list`,
`me.automation-actions.list`, `me.weekly-review.get`) sont désormais **servies par Python** et
rejouent exactement la réponse enregistrée depuis Hono. `me.pause.get` reste `ts` : la parité prouve
que la bascule des autres entrées n'a rien changé pour lui.

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

## Ce que la parité générée ne couvre pas, et sa preuve

| Opérations | Motif | Preuve |
|---|---|---|
| `notifications.read`, `notifications.readAll` | mutation (POST) | `tests/integration/engagement/test_engagement_inbox.py` |
| `me.notificationSettings.update` | mutation (PATCH) | `tests/integration/engagement/test_engagement_settings.py` (patch partiel, 409, RLS) |
| `pushSubscriptions.upsert`, `pushSubscriptions.delete` | mutations | `tests/integration/engagement/test_engagement_push_subscriptions.py` |
| `email.unsubscribe` | mutation (POST, jeton en requête) | `tests/integration/engagement/test_engagement_unsubscribe.py` + `tests/unit/engagement/test_engagement_platform.py` |
| `me.automations.update` | mutation (PATCH) | `tests/integration/engagement/test_engagement_automations_settings.py` (défauts canoniques, patch partiel, alias historique, 400 avec le message zod, RLS, pause active) |
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
