---
id: SPEC-708
title: "Paramètres : Notifications"
phase: P7
priority: V1
depends_on: [SPEC-707, SPEC-209]
business_rules: [BR-SET-03, BR-NOT-04]
screens: [SCR-15]
adrs: []
visual: mockup
---

# SPEC-708 — Paramètres : Notifications

## 1. Objectif

Onglet Notifications : canaux (application verrouillé, e-mail, navigateur avec demande de permission), six types avec compteur, programme du jour, heures calmes, week-end ; persistance immédiate. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-707** — Paramètres : onglets et Profil ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-209** — Service unifié de notifications ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-SET-03** — Notifications : canaux (application verrouillé, e-mail, navigateur), types (6 interrupteurs : révisions et quiz global [recommandé], quiz de validation à venir, cours prêt, nouvelle lacune, planning réajusté, relance après une pause) avec compteur « N sur 6 activés », quand (programme du jour, heures calmes de/à, week-end).
- **BR-NOT-04** — Réglages par défaut : e-mail et navigateur activés ; tous les types activés ; programme du jour envoyé à 08:00 ; heures calmes 21:00-08:00 ; « Rien le week-end, sauf les révisions dues » activé.

## 5. Exigences fonctionnelles

- **EF-1** — Le canal application est toujours activé et non désactivable ; e-mail et navigateur sont activés par défaut, mais le navigateur demande la permission avant enregistrement. Permission refusée : interrupteur désactivé et message clair.
- **EF-2** — Six interrupteurs de types couvrent révisions/quiz global, quiz de validation, cours prêt, nouvelle lacune, planning réajusté et relance après pause ; tous sont activés par défaut, avec compteur « N sur 6 activés ».
- **EF-3** — Programme du jour à 08:00 par défaut, heures calmes 21:00–08:00 et week-end « Rien sauf révisions dues » activé par défaut ; chaque modification persiste immédiatement et influence SPEC-209.
- **EF-4** — Les règles métier BR-SET-03, BR-NOT-04 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `PATCH /me/notification-settings` accepte un patch partiel Zod et retourne les réglages normalisés ; un changement de canal/type est idempotent et n’efface pas les abonnements push sans demande explicite.
- **ET-4** — Les heures calmes qui chevauchent minuit sont interprétées dans le fuseau IANA du profil par SPEC-207 ; le programme du jour est planifié à l’heure locale même lors d’un changement d’heure.
- **ET-5** — Le navigateur appelle le helper de SPEC-205 seulement après geste utilisateur ; une permission `denied` n’est pas relancée automatiquement.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Permission push refusée ou navigateur sans Push API : afficher « Notifications navigateur indisponibles » ; les autres canaux restent configurables.
- **CL-4** — Échec réseau pendant persistance immédiate : restaurer l’état serveur, afficher réessayer, ne pas afficher un compteur optimiste mensonger.
- **CL-5** — Heures calmes début=fin : appliquer la règle de SPEC-207 et montrer clairement la plage effective.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-SET-03, BR-NOT-04 ; définir les schémas Zod et types DTO dans `packages/contracts/src/parametres-notifications.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-708): définit les contrats`.
2. Écrire `packages/services/src/parametres-notifications.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-708): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-708): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-708): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-708`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-708/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/parametres-notifications.ts`, `packages/services/src/parametres-notifications.ts`, `packages/services/src/parametres-notifications.test.ts`, `packages/services/test/integration/parametres-notifications.test.ts`, `apps/web/e2e/specs/p7/spec-708.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-707-parametres-onglets-et-profil.md`, `specs/p2-backend/SPEC-209-service-unifie-de-notifications.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html`, onglet Notifications : canaux, six types et compteur, programme du jour, heures calmes, week-end. `data-testid` : `notification-channels`, `notification-type-count`, `quiet-hours`, `weekend-rule`.

- **Contrôles** — Utiliser la référence du SCR-15 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Par défaut les six types affichent « 6 sur 6 activés » ; en désactiver deux donne « 4 sur 6 activés » après rechargement.
- **CA-2** — Une permission navigateur refusée n’enregistre aucun abonnement et n’éteint pas le canal application.
- **CA-3** — Les réglages 08:00, 21:00–08:00 et week-end sont persistés et appliqués à une notification de test.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-708.test.ts`, `describe('[SPEC-708] règles et calculs')` : pour CA-1 : Par défaut les six types affichent « 6 sur 6 activés » ; en désactiver deux donne « 4 sur 6 activés » après rechargement. ; CA-2 : Une permission navigateur refusée n’enregistre aucun abonnement et n’éteint pas le canal application. ; CA-3 : Les réglages 08:00, 21:00–08:00 et week-end sont persistés et appliqués à une notification de test. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-708.test.ts`, `describe('[SPEC-708] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-708.spec.ts`, `test('parcours SPEC-708 @SPEC-708')` : partir du seed SPEC-115, ouvrir SCR-15, effectuer les actions des CA-1 à CA-3, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-708 @SPEC-708 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-5).
- **Non-régression** — Rejouer les étiquettes `[SPEC-707]` et `@SPEC-707`, `[SPEC-209]` et `@SPEC-209` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-4 | intégration RLS, invalides et idempotence |
| CA-5 | e2e et `@SPEC-708 @visual` |

## 13. Preuves attendues

`evidence/SPEC-708/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

