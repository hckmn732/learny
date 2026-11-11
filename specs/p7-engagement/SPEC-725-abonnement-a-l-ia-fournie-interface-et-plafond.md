---
id: SPEC-725
title: "Abonnement à l'IA fournie : interface et plafond"
phase: P7
priority: V1
depends_on: [SPEC-210, SPEC-507, SPEC-709]
business_rules: [BR-SET-06, BR-IA-06, BR-IA-07]
screens: [SCR-15]
adrs: [ADR-0011, ADR-0012]
visual: tokens
---

# SPEC-725 — Abonnement à l'IA fournie : interface et plafond

## 1. Objectif

Bloc Abonnement dans Paramètres (Modèles d'IA) : état, souscrire (Checkout), gérer (portail), consommation du jour/plafond ; messages AI_UNAVAILABLE et AI_CAP_REACHED dans l'interface ; alerte 80 %. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-210** — Abonnement Stripe (service) ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-507** — Garde-fou de coût et journal des appels ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-709** — Paramètres : Modèles d'IA ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-SET-06** — Abonnement : état de l'abonnement à l'IA fournie, souscription (Stripe Checkout), gestion (portail Stripe), consommation du jour par rapport au plafond.
- **BR-IA-06** — Modèle économique : l'outil est **gratuit avec sa propre clé** ; l'**IA fournie** nécessite un abonnement mensuel payant (Stripe). Sans abonnement actif ni clé qualifiée pour une tâche, les fonctions IA de cette tâche sont indisponibles (message explicite + lien vers Paramètres) ; tout ce qui ne demande pas d'IA (révisions, quiz déjà générés, agenda) reste disponible.
- **BR-IA-07** — Plafond quotidien de dépense de l'IA fournie par apprenant : 1,50 USD par jour (réglable par l'exploitant via configuration). Alerte in-app à 80 %. Au plafond, toutes les tâches basculent sur `claude-haiku-5-5` jusqu'à minuit (fuseau de l'utilisateur). Les tâches qui exigent un modèle supérieur et ne peuvent être faites par Haiku (conception du programme) sont reportées au lendemain avec notification.

## 5. Exigences fonctionnelles

- **EF-1** — Dans l’onglet Modèles d’IA, afficher l’état de l’abonnement à l’IA fournie, l’action « Souscrire » vers Stripe Checkout si inactif, « Gérer l’abonnement » vers le portail si actif et la consommation du jour par rapport au plafond.
- **EF-2** — Sans abonnement ni clé personnelle qualifiée pour une tâche, montrer `AI_UNAVAILABLE` avec lien vers Paramètres ; révisions, quiz déjà générés et agenda restent utilisables. Une clé personnelle qualifiée permet le mode gratuit sans forcer l’abonnement.
- **EF-3** — À 80 % du plafond géré, afficher l’alerte in-app ; au plafond, annoncer `AI_CAP_REACHED`, la bascule Haiku ou le report du programme au lendemain selon SPEC-507, avec date locale de remise à zéro.
- **EF-4** — Les règles métier BR-SET-06, BR-IA-06, BR-IA-07 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `GET /billing/subscription` de SPEC-210 et `GET /me/ai/usage` de SPEC-507 alimentent l’UI ; les boutons demandent des URL de session/portail au serveur, jamais une clé Stripe côté client.
- **ET-4** — Le droit `hasManagedAi` est vérifié côté service à chaque tâche IA et non déduit d’une pastille client. Les montants viennent du journal `ai_calls`, en USD, et le jour suit le fuseau utilisateur.
- **ET-5** — Le bloc affiche prix/produit seulement depuis la configuration Stripe officielle disponible ; un tarif absent est un état indisponible, pas une somme inventée.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Webhook Stripe en retard après retour Checkout : afficher « Activation en cours » et rafraîchir l’état, sans donner le droit IA avant confirmation serveur.
- **CL-4** — Portail ou Checkout indisponible : message et « Réessayer » ; les fonctions déterministes restent ouvertes.
- **CL-5** — Passage du plafond à minuit local : la consommation redémarre sur le nouveau jour selon le journal, pas l’heure du navigateur.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-SET-06, BR-IA-06, BR-IA-07 ; définir les schémas Zod et types DTO dans `packages/contracts/src/abonnement-a-l-ia-fournie-interface-et-plafond.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-725): définit les contrats`.
2. Écrire `packages/services/src/abonnement-a-l-ia-fournie-interface-et-plafond.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-725): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-725): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-725): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-725`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-725/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/abonnement-a-l-ia-fournie-interface-et-plafond.ts`, `packages/services/src/abonnement-a-l-ia-fournie-interface-et-plafond.ts`, `packages/services/src/abonnement-a-l-ia-fournie-interface-et-plafond.test.ts`, `packages/services/test/integration/abonnement-a-l-ia-fournie-interface-et-plafond.test.ts`, `apps/web/e2e/specs/p7/spec-725.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p2-backend/SPEC-210-abonnement-stripe-service.md`, `specs/p5-ia/SPEC-507-garde-fou-de-cout-et-journal-des-appels.md`, `specs/p7-engagement/SPEC-709-parametres-modeles-d-ia.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html`, onglet Modèles d’IA : bloc Abonnement, badge d’état, bouton Souscrire/Gérer, jauge de consommation et alerte 80 %. `data-testid` : `managed-ai-subscription`, `managed-ai-usage`, `managed-ai-cap-alert`.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Un utilisateur avec clé qualifiée et sans abonnement peut lancer la tâche associée ; sans les deux, `AI_UNAVAILABLE` s’affiche tandis que l’agenda reste utilisable.
- **CA-2** — À 80 % du plafond, la jauge et l’alerte concordent avec `/me/ai/usage` ; au plafond, le programme est reporté et la date locale de reprise est affichée.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-725.test.ts`, `describe('[SPEC-725] règles et calculs')` : pour CA-1 : Un utilisateur avec clé qualifiée et sans abonnement peut lancer la tâche associée ; sans les deux, `AI_UNAVAILABLE` s’affiche tandis que l’agenda reste utilisable. ; CA-2 : À 80 % du plafond, la jauge et l’alerte concordent avec `/me/ai/usage` ; au plafond, le programme est reporté et la date locale de reprise est affichée. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-725.test.ts`, `describe('[SPEC-725] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-725.spec.ts`, `test('parcours SPEC-725 @SPEC-725')` : partir du seed SPEC-115, ouvrir SCR-15, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-725 @SPEC-725 @visual')` : jetons, régions, textes, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-210]` et `@SPEC-210`, `[SPEC-507]` et `@SPEC-507`, `[SPEC-709]` et `@SPEC-709` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-725 @visual` |

## 13. Preuves attendues

`evidence/SPEC-725/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0011 — Modèle économique : gratuit avec sa clé, IA fournie payante** : Sans abonnement, l'utilisateur doit configurer une clé qualifiée pour chaque tâche IA qu'il veut utiliser. L'abonnement mensuel Stripe (un seul prix, `STRIPE_PRICE_ID`) donne accès à l'IA fournie. Le montant est une configuration Stripe hors code.
- **ADR-0012 — Plafond quotidien de l'IA fournie** : Plafond par défaut 1,50 USD/jour/apprenant (`subscriptions.daily_cap_usd`, configurable par l'exploitant). Alerte à 80 %. Au plafond : bascule sur `claude-haiku-5-5` jusqu'à minuit (fuseau utilisateur) ; la conception de programme est reportée au lendemain. Le plafond ne s'applique pas aux clés personnelles.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.
