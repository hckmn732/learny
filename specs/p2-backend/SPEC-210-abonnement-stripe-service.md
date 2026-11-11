---
id: SPEC-210
title: Abonnement Stripe (service)
phase: P2
priority: V1
depends_on: [SPEC-201, SPEC-110]
business_rules: [BR-IA-06]
screens: []
adrs: [ADR-0011, ADR-0061]
visual: demo
---

# SPEC-210 — Abonnement Stripe (service)

## 1. Objectif

Livrer le service d'abonnement à l'IA fournie : création du client Stripe, session Checkout, portail client, webhook signé et idempotent, lecture du statut, et la fonction `hasManagedAi(userId)` qui décide seule du droit d'accès. Un faux client Stripe (`STRIPE_MODE=mock`) rend tout le parcours testable sans réseau.

## 2. Contexte

Le modèle économique (ADR-0011) rend l'outil gratuit avec sa propre clé et réserve l'IA fournie aux abonnés. SPEC-110 a créé `subscriptions` (`stripe_customer_id`, `stripe_subscription_id`, `status none|active|past_due|canceled|incomplete`, `current_period_end`, `daily_cap_usd`). Consommateurs : SPEC-504 (résolution du modèle par tâche via `hasManagedAi`), SPEC-507 (plafond quotidien), SPEC-602 (Checkout à l'onboarding), SPEC-725 (interface d'abonnement). Lire `docs/product/business-rules.md` BR-IA-06 et BR-IA-07, `docs/architecture/api.md` §1–§2, `docs/architecture/data-model.md` §9, ADR-0011, ADR-0061, ADR-0215 (statuts, ordre des webhooks, mode mock), ADR-0120 (idempotence), ADR-0047 (horloge).

## 3. Dépendances

- **SPEC-201** : `handler`, `defineRoute`, `problem+json`, clé d'idempotence, profils de débit (le webhook est en profil `none`).
- **SPEC-110** : table `subscriptions`, vue `ai_spend_today`.
- **SPEC-009** (transitive) : variables `STRIPE_MODE` (`mock|test|live`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL` ; `STRIPE_MODE=mock` refusé en production.
- **SPEC-208** (même phase, recommandé) : la garde d'origine exempte `/api/v1/webhooks/*`.
- **Externe** : SDK `stripe` ≥ 17 côté serveur uniquement. Sans clés Stripe (CI, local), `STRIPE_MODE=mock` est utilisé ; un test `STRIPE_MODE=test` n'est exécuté que si les clés de test sont présentes, sinon il est marqué ignoré avec raison consignée (jamais simulé comme réussi).

## 4. Règles métier couvertes

- **BR-IA-06** : `hasManagedAi(userId)` est vrai seulement pour un abonnement `active` dont la période n'est pas échue ; sans abonnement actif ni clé qualifiée pour une tâche, SPEC-504 renvoie `AI_UNAVAILABLE` avec lien vers Paramètres, tandis que les fonctions sans IA ne consultent jamais ce service. Le paiement passe exclusivement par Stripe Checkout (un seul prix `STRIPE_PRICE_ID`).

## 5. Exigences fonctionnelles

- **EF-1** — `POST /api/v1/billing/checkout`, corps `{ successPath, cancelPath }` (chemins relatifs commençant par `/`, sans `//`), renvoie `200 { url }`. Le client Stripe est créé au premier appel avec `metadata.userId` et l'e-mail du profil, puis réutilisé. Un utilisateur déjà `active` reçoit `409 ALREADY_SUBSCRIBED`.
- **EF-2** — `POST /api/v1/billing/portal` renvoie `200 { url }` vers le portail client Stripe avec retour vers `/parametres#ia` ; sans client Stripe, `404 NOT_FOUND`.
- **EF-3** — `GET /api/v1/billing/subscription` renvoie `{ status, currentPeriodEnd, hasManagedAi, dailyCapUsd }` (`status` ∈ `none|active|past_due|canceled|incomplete`, date ISO ou `null`).
- **EF-4** — `POST /api/v1/webhooks/stripe` (public, sans session) vérifie la signature `Stripe-Signature` avec `STRIPE_WEBHOOK_SECRET` (tolérance 300 s), traite `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, ignore les autres types avec `200`, et répond `400 INVALID_SIGNATURE` si la signature est invalide.
- **EF-5** — Correspondance des statuts (ADR-0215) : `active`/`trialing` → `active` ; `past_due`/`unpaid` → `past_due` ; `canceled`/`incomplete_expired` → `canceled` ; `incomplete` → `incomplete`.
- **EF-6** — `hasManagedAi(userId)` est exporté par `@learny/services/billing` et lit la base à chaque appel (aucun cache côté client) ; aucun délai de grâce après `past_due`.
- **EF-7** — Mode mock : `checkout` renvoie `/_dev/stripe/checkout?session=<id>` ; cette page affiche « Paiement simulé » avec les boutons « Payer » et « Annuler » ; « Payer » émet un webhook simulé signé puis redirige vers `successPath`, « Annuler » redirige vers `cancelPath`. Le portail mock propose « Résilier » (émet `customer.subscription.deleted`).
- **EF-8** — La page `/_dev/sdd/SPEC-210` montre le statut courant, lance Checkout mock, simule paiement, échec de paiement, résiliation et rejeu d'un webhook, et affiche l'historique des événements traités.

## 6. Exigences techniques

- **ET-1** — Contrats Zod dans `packages/contracts/src/billing.ts` ; routes fines `apps/web/app/api/v1/billing/{checkout,portal,subscription}/route.ts` et `apps/web/app/api/v1/webhooks/stripe/route.ts` (lecture du corps brut, `runtime = 'nodejs'`).
- **ET-2** — `packages/services/src/billing/stripe-client.ts` expose l'interface `StripeGateway { createCustomer, createCheckoutSession, createPortalSession, retrieveSubscription, constructEvent }` avec deux implémentations : réelle (SDK) et `MockStripeGateway` en mémoire, déterministe (identifiants `cus_mock_<n>`, `sub_mock_<n>`, horloge injectée).
- **ET-3** — Migration additive : table `stripe_events(event_id text pk, type text, created_at timestamptz, processed_at timestamptz)` et colonne `subscriptions.stripe_event_at timestamptz` ; RLS activée sans politique utilisateur (accès `serviceDb` seulement, opération autorisée listée).
- **ET-4** — Traitement du webhook dans une transaction : `insert into stripe_events … on conflict do nothing` (doublon → `200` sans effet) ; si `event.created < subscriptions.stripe_event_at` → `200` sans effet ; sinon relire l'abonnement par `retrieveSubscription` et mettre à jour `status`, `stripe_subscription_id`, `current_period_end`, `stripe_event_at`. L'utilisateur est retrouvé par `metadata.userId` puis `stripe_customer_id`.
- **ET-5** — Après mise à jour, émission de `billing/subscription-changed` (boîte d'envoi ADR-0122) avec `{ userId, from, to }` ; `invoice.payment_failed` émet aussi `billing/payment-failed`. Les notifications correspondantes relèvent de SPEC-725.
- **ET-6** — Aucune clé secrète ni identifiant de paiement n'atteint le navigateur ; la réponse de `checkout` ne contient que l'URL. Les journaux masquent les identifiants Stripe sauf le suffixe de 4 caractères.
- **ET-7** — Nouveaux codes d'erreur : `ALREADY_SUBSCRIBED` (409), `INVALID_SIGNATURE` (400). Limitation : `checkout` et `portal` en profil `default`, idempotence de `checkout` par clé `Idempotency-Key`.

## 7. Comportements attendus et cas limites

- **CL-1** — Même webhook livré deux fois : un seul traitement, deuxième réponse `200`.
- **CL-2** — `customer.subscription.updated` (active) arrivé après `customer.subscription.deleted` plus récent : ignoré, statut `canceled` conservé.
- **CL-3** — Signature valide mais horodatage de plus de 300 s : `400 INVALID_SIGNATURE`.
- **CL-4** — `current_period_end` dépassé sans webhook reçu : `hasManagedAi` faux bien que `status = active`.
- **CL-5** — `successPath` absolu (`https://…`) ou `//evil` : `400 VALIDATION_FAILED`.
- **CL-6** — Deux clics simultanés sur « S'abonner » : un seul client Stripe créé (verrou par utilisateur), même URL rejouée par idempotence.
- **CL-7** — Utilisateur `past_due` : `hasManagedAi` faux ; une tâche IA sans clé qualifiée renvoie `AI_UNAVAILABLE` (SPEC-504) ; révisions et quiz déjà générés restent accessibles.
- **CL-8** — Stripe indisponible pendant `checkout` : `503 SERVICE_UNAVAILABLE`, aucune ligne partielle.
- **CL-9** — Webhook pour un client inconnu : `200`, événement consigné `processed_at` avec erreur journalisée, aucune création d'utilisateur.

## 8. Instructions d'implémentation

1. Migration `stripe_events` et `stripe_event_at`, contrats Zod, codes d'erreur. Commit `feat(SPEC-210): stockage des événements Stripe`.
2. `StripeGateway` réel et mock, sélection par `STRIPE_MODE`. Commit `feat(SPEC-210): passerelle Stripe et faux client`.
3. Service `billing` : `startCheckout`, `openPortal`, `getSubscription`, `hasManagedAi`, `handleWebhook`, correspondance des statuts. Commit `feat(SPEC-210): service d'abonnement`.
4. Routes API et page mock `/_dev/stripe/checkout`. Commit `feat(SPEC-210): routes de facturation et webhook`.
5. Page SDD, tests e2e et visuels. Commit `test(SPEC-210): démontre le cycle d'abonnement`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/billing.ts`, `packages/services/src/billing/{index,stripe-client,mock-stripe,status,webhook,entitlement}.ts`, `packages/services/src/billing/status.test.ts`, `packages/services/test/integration/billing.test.ts`, migration `packages/db/migrations/<n>_stripe_events.sql`, `apps/web/app/api/v1/billing/{checkout,portal,subscription}/route.ts`, `apps/web/app/api/v1/webhooks/stripe/route.ts`, `apps/web/app/%5Fdev/stripe/checkout/page.tsx`, `apps/web/components/sdd-demos/spec-210.tsx`, `apps/web/e2e/specs/p2/spec-210.spec.ts`.
- **Modifiés** : `packages/db/src/schema/billing.ts`, `packages/core/src/errors.ts`, `packages/jobs/src/events.ts`, `packages/contracts/src/index.ts`, `docs/architecture/data-model.md` §9, registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `subscriptions` (SPEC-110), `handler` (SPEC-201), horloge (SPEC-207), boîte d'envoi (SPEC-203).

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-210`, `h1` « SPEC-210 — Abonnement Stripe (service) ». Régions :
1. « Statut » (`spec-210-status`, `role="status"`) : badge du statut en français (« Aucun abonnement », « Actif », « Paiement en retard », « Résilié », « Incomplet »), fin de période, « IA fournie : disponible / indisponible ».
2. « Actions » (`spec-210-actions`) : « S'abonner (simulé) », « Simuler un échec de paiement », « Résilier », « Rejouer le dernier webhook ».
3. « Événements » (`spec-210-events`) : tableau type, date, résultat (« Appliqué », « Doublon ignoré », « Ancien ignoré »).
La page mock `/_dev/stripe/checkout` porte la mention « Paiement simulé — aucun débit ». Clavier, 390 px, jetons SPEC-301. Contrôles : jetons, ordre, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Le parcours Checkout mock (création du client, paiement, webhook signé) fait passer le statut à `active` et `hasManagedAi` à vrai ; la résiliation le fait passer à `canceled` et `hasManagedAi` à faux.
- **CA-2** — Un webhook à signature invalide ou expirée est refusé `400` ; un doublon ou un événement plus ancien n'a aucun effet.
- **CA-3** — `hasManagedAi` est faux pour `past_due`, `incomplete`, `canceled`, `none` et pour une période échue.
- **CA-4** — Les contrats attendus par SPEC-602 (`checkout` → `{ url }`, `subscription` → `{ status }`) sont respectés, chemins externes refusés, idempotence et concurrence sans double client.
- **CA-5** — Aucune clé Stripe ni identifiant complet n'apparaît dans les réponses, journaux ou preuves.
- **CA-6** — La page SDD démontre statut, actions et événements ; vidéo, axe et captures ≤ 1 %.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/billing/status.test.ts`, `describe('[SPEC-210] statuts et droit')` : correspondance des statuts Stripe, `hasManagedAi` selon statut et période, validation des chemins (CA-3, CA-4).
- **Intégration** — `packages/services/test/integration/billing.test.ts`, `describe('[SPEC-210] service d'abonnement')` : faux client, cycle complet, signature invalide/expirée, doublon, ordre inversé, client inconnu, deux checkouts concurrents, recherche de secrets dans les journaux (CA-1 à CA-5).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-210.spec.ts`, `test('cycle d'abonnement simulé @SPEC-210')` : « S'abonner (simulé) » → page « Paiement simulé » → « Payer » → statut « Actif » → « Résilier » → « Résilié » ; vidéo (CA-1, CA-6).
- **Visuel** — `test('abonnement conforme @SPEC-210 @visual')` : régions, jetons, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — `[SPEC-110]`, `[SPEC-201]` / `@SPEC-201`.

| Critère | Tests |
|---|---|
| CA-1 | intégration cycle ; e2e |
| CA-2 | intégration signature, doublon, ordre |
| CA-3 | unitaires droit |
| CA-4 | unitaires chemins ; intégration concurrence |
| CA-5 | intégration recherche de secrets |
| CA-6 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-210/` : rapports, journal des événements du cycle mock, sortie des cas de signature, vidéo, captures desktop/mobile, `checks.json`, `acceptance.md`. Si des clés `STRIPE_MODE=test` sont disponibles, rapport du test réel ; sinon mention explicite « test Stripe réel non exécuté : clés absentes ».

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7 ; en plus : `STRIPE_MODE=mock` refusé en production par la validation de configuration, `hasManagedAi` seul point de décision du droit (aucune autre lecture de `subscriptions.status` pour l'accès à l'IA), et la page mock inaccessible si `ENABLE_SDD_PAGES` est faux.

## 15. Décisions et hypothèses

- ADR-0011 (gratuit avec sa clé, IA fournie payante, un seul prix), ADR-0061 (Checkout, portail, webhooks, mode mock).
- ADR-0215 (créé pour cette spécification) : correspondance des statuts, absence de délai de grâce, déduplication par `event.id`, ordre par `event.created`, relecture de l'abonnement, client créé paresseusement, mode mock.
- Le montant de l'abonnement est une configuration Stripe hors code (ADR-0011) ; le plafond quotidien est appliqué par SPEC-507 à partir de `daily_cap_usd`.
- SPEC-725 et `docs/architecture/api.md` utilisent la route `GET /api/v1/billing/subscription` fournie ici.
