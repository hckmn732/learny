# SPEC-3501 — Notifications push natives (FCM et APNs) : preuves d'acceptation

- **Spécification** : `specs/p35-mobile-notifications-livraison/SPEC-3501-notifications-push-natives.md`
- **Branche** : `spec/SPEC-3501-notifications-push-natives` (VM `learny-dev`, `/root/learny-mobile`)
- **Date** : 2026-11-24
- **Environnement** : API locale 3001 (`APP_ENV=local`, `PUSH_MODE=mock`, `LLM_MODE=mock`, horloge
  figée `2026-11-11T12:20:00Z`), Supabase local 54321, émulateur Android local API 35 (ADR-3018),
  Maestro 2.12.1.
- **Décisions** : ADR-3007 (jetons natifs, contrat, canaux, charge, mode simulé), ADR-0055
  (nettoyage 404/410 et cinq échecs), ADR-0031 (service unifié), ADR-2006 (worker sur outbox),
  ADR-2011 (canevas Python), ADR-3003 § 4 (comparaison visuelle), ADR-2004 (contrat généré).

## 1. Ce qui est livré

| Zone | Fichiers |
|---|---|
| Contrat (EF-3) | `packages/contracts/src/push.ts` (union discriminée `webpush` par défaut / `apns` / `fcm`, `kind` + `token` pour `DELETE`), `api/openapi.yaml`, `packages/api-sdk/src/schema.d.ts`, `apps/api/src/learny_api/generated/{models,routes}.py` (régénérés) |
| Données (EF-4) | `packages/db/src/schema/identity.ts` (`kind`, `token`, `platform`, `endpoint`/`p256dh`/`auth` nullables, unicité partielle par canal, CHECK de forme), `packages/db/migrations/0056_futuristic_sebastian_shaw.sql`, `supabase/migrations/20261111000056_*.sql` |
| Worker Python (EF-5, EF-6, ET-1, ET-2, ET-4) | `python/learny/src/learny/engagement/infrastructure/{apns,fcm,push_http,push,queries}.py`, `application/{subscriptions,notify}.py`, `domain/push_token.py`, `shared/{config,deps}.py`, `shared/locale_fr/engagement.py` |
| Mobile (EF-1, EF-2, EF-7) | `apps/mobile/src/notifications/{register,handlers,expo-device,use-device-channel,PushBridge}`, `app/_dev/sdd/push.tsx` (page de démonstration du toucher), `app/_layout.tsx`, `src/features/profil/NotificationsScreen.tsx`, `packages/i18n/src/fr/mobile.ts`, `app.config.ts` (+ `expo-notifications ~58.1.9`), `e2e/build-e2e.mjs` |
| Tests | pytest `tests/unit/engagement/test_spec_3501_push_channels.py`, `tests/integration/engagement/test_spec_3501_native_push.py` ; Vitest `src/notifications/{register,handlers}.test.ts`, `test/integration/push.int.test.ts` ; Jest `test/profil/notifications-settings-device.test.tsx` |
| Campagne | `e2e/flows/SPEC-3501-{activation,toucher,notifications}.yaml`, `e2e/visual/masks/spec-3501-notifications.json`, `e2e/visual/baselines/SPEC-3501-notifications.png`, `e2e/sql/SPEC-3501-{seed,cleanup}-quiz.sql` |

## 2. Critères d'acceptation

| Critère | Résultat | Preuve |
|---|---|---|
| **CA-1** — activer le canal appareil demande la permission, crée l'abonnement natif et l'interrupteur reflète l'état ; le désactiver le supprime | ✅ | Vitest `notifications/register.test.ts` (12 cas : permission demandée au moment utile, refus → `denied` sans écriture, appareil sans jeton → `unsupported`, désinscription à la coupure et à la déconnexion, corps validé par `PushSubscriptionBody`) ; Jest `notifications-settings-device.test.tsx` (5 cas : interrupteur éteint/activé, CTA « Autoriser dans les réglages », état d'échec) ; intégration `push.int.test.ts` (inscription puis rafraîchissement `created: false`, désinscription idempotente) ; Maestro `SPEC-3501-activation.yaml` (permission accordée sur l'émulateur, interrupteur allumé → libellé « Les rappels arrivent sur cet appareil. », puis éteint → abonnement supprimé) |
| **CA-2** — un rappel simulé (`PUSH_MODE=mock`) produit une livraison native respectant heures calmes et plafond ; hors heures calmes il est envoyé, pendant il est reporté | ✅ | pytest `test_spec_3501_native_push.py::test_quiet_hours_defer_a_native_send_until_the_plage_ends` (statut `deferred_quiet`, aucune entrée dans la boîte de démonstration, envoi après la plage par `deliver_due_deliveries`), `::test_the_daily_cap_counts_a_native_send_like_the_other_channels` (3 envois puis `capped`), `::test_a_native_round_sends_through_its_channel_and_journals_it` (livraison `sent`, journal `push`), plus la suite `[SPEC-2205]` du service unifié (heures calmes, plafond) |
| **CA-3** — toucher la notification (envoyée en local sur l'émulateur avec la même charge) ouvre l'écran du quiz | ✅ | Vitest `notifications/handlers.test.ts` (9 cas : destination interne uniquement, garde d'authentification — `deferred` puis `opened`, charge inconnue ignorée, bannière du premier plan) ; Maestro `SPEC-3501-toucher.yaml` (notification locale programmée par `/_dev/sdd/push` avec la charge d'un push, application en arrière-plan, volet des notifications, toucher → `quiz-question` et `quiz-count`) |
| **CA-4** — un jeton invalide supprime l'abonnement ; aucune livraison en double après reprise du worker | ✅ | pytest `::test_a_dead_native_token_removes_the_subscription_at_once` (410/`Unregistered` → ligne supprimée, livraison `failed`/`gone`), `::test_five_consecutive_transient_failures_remove_the_subscription` (compteur 4 puis suppression au cinquième), `::test_a_resumed_delivery_is_never_sent_twice` (rejeu d'une livraison `sent` : une seule entrée, une seule ligne de journal) ; unitaires `test_spec_3501_push_channels.py` (classification des réponses APNs et FCM) |
| **CA-5** — le contrôle de compatibilité du contrat et la suite pytest du domaine notifications passent ; aucune régression Web Push | ✅ | `pnpm contract:check` et `pnpm py:contract:check` (aucune dérive après régénération) ; `pnpm lint` et `pnpm typecheck` verts ; pytest `[SPEC-3501]` (55 cas) et suites `[SPEC-2205]` (dont `test_engagement_push_subscriptions.py`, `test_engagement_notify.py`, `test_push_endpoint.py`) ; intégration `push.int.test.ts` (corps Web Push de SPEC-205 sans `kind` accepté) ; Maestro `SPEC-3501-notifications.yaml` (`@visual`) |

## 3. Conformité visuelle (ADR-3003 § 4)

- **Flux** : `e2e/flows/SPEC-3501-notifications.yaml`, étiquettes `SPEC-3501 @visual`, capture
  `takeScreenshot: SPEC-3501-notifications` prise sur l'écran Notifications **avant toute mutation**
  (interrupteur appareil éteint, aucune permission demandée par ce flux), donc reproductible.
- **Ligne de base versionnée** : `apps/mobile/e2e/visual/baselines/SPEC-3501-notifications.png`.
- **Masque** : `e2e/visual/masks/spec-3501-notifications.json` — **aucun rectangle propre au flux** :
  l'écran est une pile de réglages sans barre d'onglets, seules les zones natives par défaut (barre
  d'état du haut, indicateur d'accueil du bas) sortent de la comparaison. Aucune zone de contenu
  n'est masquée.
- **Écart mesuré** : voir § 6 (`diffRatio`) et le diff
  `artifacts/spec-3501-notifications/SPEC-3501-notifications.diff.png`.
- **Écarts assumés à la planche** : la feuille « Notifications » de la maquette est un écran de
  réglages ; le canal appareil y remplace le canal navigateur de la maquette web, avec le libellé
  d'état du système (« Aucun rappel n'arrive sur cet appareil. ») que la maquette ne dessine pas.
  Aucun autre écart structurel : mêmes sections, mêmes jetons, mêmes composants.

## 4. Couverture des niveaux de test

| Niveau | Résultat |
|---|---|
| pytest `[SPEC-3501]` | **55 cas** (unitaires des canaux + intégration base réelle) |
| Vitest `[SPEC-3501]` | `register.test.ts` **12**, `handlers.test.ts` **9** |
| Jest `[SPEC-3501]` | `notifications-settings-device.test.tsx` **5** |
| Intégration Vitest `[SPEC-3501]` | `test/integration/push.int.test.ts` **4** (compte éphémère créé puis supprimé) |
| Maestro `@SPEC-3501` + vidéo | **3 flux** : activation, toucher, notifications (`@visual`) |
| Visuel `@visual` | 1 flux comparé à la ligne de base versionnée |

## 5. Ce qui n'a pas pu être prouvé (blocage externe, ADR-2007 / ADR-2009)

1. **Identifiants APNs absents** — la clé `.p8` (`APNS_KEY_ID`, `APNS_TEAM_ID`,
   `APNS_PRIVATE_KEY`, `APNS_TOPIC`) n'est pas fournie par le porteur : aucun envoi réel vers
   `api.push.apple.com`. Le canal est livré, testé en unité (JWT ES256, en-têtes, charge, réponses) et
   branché ; il reste inactif tant que les secrets manquent (`build_apns_transport` renvoie `None`
   et le routeur répond `channel_not_configured`, transitoire, jamais un faux succès).
2. **Identifiants FCM absents** — pas de `google-services.json` ni de compte de service
   (`FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`) : aucun envoi réel vers
   `fcm.googleapis.com`. Même traitement : adaptateur testé en unité (OAuth caché, message HTTP v1,
   `UNREGISTERED`), inactif sans configuration.
3. **iOS non compilable** — aucun runner macOS dans cet environnement : `expo prebuild -p ios`,
   l'entitlement APNs et le simulateur iOS ne peuvent pas être produits. Le code iOS est le même
   (`getDevicePushTokenAsync` rend un jeton APNs), déclaré par `app.config.ts` (son par défaut, pas
   de badge en V1) mais **non compilé ni exécuté**.
4. **Jeton natif simulé dans le build e2e** — l'émulateur n'a pas de configuration FCM : le build
   e2e (`EXPO_PUBLIC_SDD_PUSH_MOCK=1`, jamais en production) rend un jeton déterministe au lieu de
   `getDevicePushTokenAsync`. Le chemin client (permission → jeton → `POST` → interrupteur) est donc
   réel de bout en bout ; seule la valeur du jeton est simulée.
5. Conséquence : `node tools/sdd/fail.mjs SPEC-3501 "identifiants APNs/FCM absents" --external` reste
   à consigner par l'agent principal (consigne explicite de la spécification § 3).

## 6. Mesures et sorties

Voir `evidence/SPEC-3501/checks.json` (résultat de `validate.mjs` étape par étape),
`evidence/SPEC-3501/e2e-mobile.json` (campagne Maestro : flux, vidéos, `diffRatio`) et le journal de
validation ci-dessous.

- `PUSH_MODE=mock` explicite sur l'API et le worker de la campagne.
- Boîte de démonstration : `MockPushTransport.records()` porte `kind` (`webpush`/`apns`/`fcm`) et un
  `target` **masqué** (`…cdef` pour un jeton, l'hôte seul pour un endpoint) — les tests vérifient
  qu'aucun jeton en clair n'y apparaît (ET-4).
