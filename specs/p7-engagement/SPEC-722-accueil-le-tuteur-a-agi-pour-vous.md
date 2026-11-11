---
id: SPEC-722
title: "Accueil : le tuteur a agi pour vous"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-603]
business_rules: [BR-AUT-13]
screens: [SCR-03]
adrs: []
visual: mockup
---

# SPEC-722 — Accueil : le tuteur a agi pour vous

## 1. Objectif

Carte de l'accueil listant les actions récentes (annuler, confirmer, ouvrir) et lien Régler ; mise à jour en direct après action. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-03 : `/accueil` (`/` redirige). Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-603** — Accueil ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-AUT-13** — Accueil : bandeau « Le tuteur propose · votre accord est demandé » pour les actions en attente (accepter, autre créneau, annuler) ; carte « Le tuteur a agi pour vous » (actions récentes avec annuler/confirmer) ; carte « Bilan de la semaine ».

## 5. Exigences fonctionnelles

- **EF-1** — L’accueil affiche le bandeau « Le tuteur propose · votre accord est demandé » lorsqu’une action `pending_consent` existe, avec explication, « Accepter », « Autre créneau » si l’action le permet et « Pas maintenant » ; l’action choisie suit le moteur SPEC-711.
- **EF-2** — La carte « Le tuteur a agi pour vous » liste les actions récentes appliquées avec résumé daté, accès à la cible et « Annuler » seulement si l’action n’est pas consommée. Le lien « Régler » ouvre `#automatismes`.
- **EF-3** — Après accepter, refuser ou annuler, la carte et le compteur se mettent à jour depuis l’API sans rechargement complet, en préservant le focus et en annonçant le nouvel état.
- **EF-4** — Les règles métier BR-AUT-13 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `GET /me/automation-actions` est appelé avec filtres `pending_consent` pour le bandeau et `applied|consumed` pour la carte, pagination stable et ordre décroissant par date ; les résumés viennent de `automation_actions.summary` calculé par `explain` (ADR-0190).
- **ET-4** — Les mutations utilisent `accept|decline|undo` de SPEC-711 avec version de l’action et `choice` validé par le `kind`. L’UI ne modifie pas directement le planning et ne suppose pas qu’une action annulée peut toujours être reproposée.
- **ET-5** — Le bandeau suit ADR-0191 : afficher le sur-titre et les boutons de la maquette seulement quand une action réelle les justifie ; l’action déjà consommée n’offre pas « Annuler ».

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Action acceptée dans un autre onglet : 409, recharger la carte et retirer les boutons devenus caducs.
- **CL-4** — Aucune action en attente ni récente : bandeau absent du DOM, carte en état vide explicite.
- **CL-5** — Une cible supprimée : afficher l’explication historique sans lien cassé.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-AUT-13 ; définir les schémas Zod et types DTO dans `packages/contracts/src/accueil-le-tuteur-a-agi-pour-vous.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-722): définit les contrats`.
2. Écrire `packages/services/src/accueil-le-tuteur-a-agi-pour-vous.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-722): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-722): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-722): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-722`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-722/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/accueil-le-tuteur-a-agi-pour-vous.ts`, `packages/services/src/accueil-le-tuteur-a-agi-pour-vous.ts`, `packages/services/src/accueil-le-tuteur-a-agi-pour-vous.test.ts`, `packages/services/test/integration/accueil-le-tuteur-a-agi-pour-vous.test.ts`, `apps/web/e2e/specs/p7/spec-722.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-03, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`, `specs/p6-parcours/SPEC-603-accueil.md`.

## 10. Interface et conformité visuelle

`Main.dc.html` : bandeau de proposition, carte « Le tuteur a agi pour vous », boutons Accepter/Autre créneau/Pas maintenant, résumés et lien Régler. `data-testid` : `tutor-proposal`, `tutor-acted`, `automation-action`, `automation-settings-link`.

- **Contrôles** — Utiliser la référence du SCR-03 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Une action `pending_consent` du seed apparaît dans le bandeau ; Accepter l’applique une fois, met la carte à jour et annonce le changement.
- **CA-2** — Une action `consumed` garde son résumé mais n’a pas de bouton Annuler ; le lien Régler mène à `/parametres#automatismes`.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-722.test.ts`, `describe('[SPEC-722] règles et calculs')` : pour CA-1 : Une action `pending_consent` du seed apparaît dans le bandeau ; Accepter l’applique une fois, met la carte à jour et annonce le changement. ; CA-2 : Une action `consumed` garde son résumé mais n’a pas de bouton Annuler ; le lien Régler mène à `/parametres#automatismes`. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-722.test.ts`, `describe('[SPEC-722] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-722.spec.ts`, `test('parcours SPEC-722 @SPEC-722')` : partir du seed SPEC-115, ouvrir SCR-03, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-722 @SPEC-722 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-711]` et `@SPEC-711`, `[SPEC-603]` et `@SPEC-603` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-722 @visual` |

## 13. Preuves attendues

`evidence/SPEC-722/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.
