---
id: SPEC-710
title: "Paramètres : Automatismes"
phase: P7
priority: V1
depends_on: [SPEC-707, SPEC-711]
business_rules: [BR-SET-04, BR-AUT-12]
screens: [SCR-15]
adrs: []
visual: mockup
---

# SPEC-710 — Paramètres : Automatismes

## 1. Objectif

Onglet Automatismes : bandeau et compteur, trois groupes, interrupteurs et réglages (options construites sans élément dans les select), dernière action, carte Mode pause, garde-fous, journal avec Annuler. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-15 : route du catalogue. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-707** — Paramètres : onglets et Profil ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-711** — Moteur d'automatismes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-SET-04** — Automatismes : bandeau de principe et compteur ; trois groupes (Contre le décrochage : 1, 2, 9 ; Mémorisation : 3, 6, 7 ; Quiz et jeux : 4, 5, 8) ; chaque automatisme : interrupteur, règle, réglages (visibles si activé), dernière action ; carte Mode pause (10) ; garde-fous (plafond de notifications, grands changements « toujours sur accord », heures calmes) ; journal de la semaine.
- **BR-AUT-12** — Journal de la semaine : liste datée des actions automatiques avec explication et « Annuler » ; compteur « N actions cette semaine ».

## 5. Exigences fonctionnelles

- **EF-1** — L’onglet Automatismes présente le bandeau de principe, compteur d’actions de la semaine, groupes « Contre le décrochage » (1,2,9), « Mémorisation » (3,6,7), « Quiz et jeux » (4,5,8), puis la carte Mode pause (10).
- **EF-2** — Chaque automatisme a interrupteur, règle explicite, réglages affichés seulement s’il est activé et dernière action datée ; les options de `select` sont de vrais éléments `option`, accessibles au clavier.
- **EF-3** — Afficher les garde-fous : plafond de notifications, heures calmes et grands changements toujours sur accord. Le journal daté de la semaine permet « Annuler » uniquement sur une action non consommée.
- **EF-4** — Les règles métier BR-SET-04, BR-AUT-12 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.
- **ET-2** — Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.
- **ET-3** — `GET/PATCH /me/automations` et `GET /me/automation-actions` de SPEC-711 alimentent compteur, paramètres et journal ; une mutation retourne l’état serveur et invalide la vue.
- **ET-4** — Les composants lisent la définition du registre SPEC-711 : groupes, schéma de paramètres, défaut, explication et capacité d’annulation ; aucun tableau divergent d’automatismes n’est codé dans l’écran.
- **ET-5** — Le journal filtre la semaine dans le fuseau du profil et reçoit une pagination stable ; une action consommée affiche son état et pas de bouton Annuler.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Automatisme désactivé avec action déjà appliquée : la désactivation affecte les futurs déclenchements, pas l’historique.
- **CL-4** — Paramètre hors schéma : erreur de champ, réglages précédents conservés.
- **CL-5** — Annulation arrivée après consommation : 409/422 avec état actualisé, bouton retiré.

## 8. Instructions d'implémentation

1. Relire les contrats des dépendances et les règles BR-SET-04, BR-AUT-12 ; définir les schémas Zod et types DTO dans `packages/contracts/src/parametres-automatismes.ts`. Ajouter les valeurs métier à `packages/config/src/product.ts` uniquement si elles viennent d’une règle ou d’un ADR. Commit `feat(SPEC-710): définit les contrats`.
2. Écrire `packages/automations/src/parametres-automatismes.ts` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit `feat(SPEC-710): implémente la capacité`.
3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser `@learny/ui` et ajouter les libellés à `apps/web/messages/fr.ts`. Commit `feat(SPEC-710): expose le parcours`.
4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit `test(SPEC-710): vérifie le parcours et les limites`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-710`, corriger les erreurs, lier les preuves réelles aux CA dans `evidence/SPEC-710/acceptance.md` puis terminer avec `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/parametres-automatismes.ts`, `packages/automations/src/parametres-automatismes.ts`, `packages/automations/src/parametres-automatismes.test.ts`, `packages/services/test/integration/parametres-automatismes.test.ts`, `apps/web/e2e/specs/p7/spec-710.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, exports des paquets, routes `apps/web/app/api/v1/**` correspondant à ET-6, composants de l’écran SCR-15, catalogue d’événements si la capacité en émet.
- **Lus / réutilisés** : `specs/p7-engagement/SPEC-707-parametres-onglets-et-profil.md`, `specs/p7-engagement/SPEC-711-moteur-d-automatismes.md`.

## 10. Interface et conformité visuelle

`Parametres.dc.html`, onglet Automatismes : trois groupes et ordre 1/2/9, 3/6/7, 4/5/8, Mode pause, garde-fous, journal. `data-testid` : `automation-count`, `automation-group`, `automation-switch`, `automation-history`, `automation-undo`.

- **Contrôles** — Utiliser la référence du SCR-15 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Les dix automatismes apparaissent exactement une fois dans les groupes et carte prévus ; un réglage désactivé n’est pas éditable.
- **CA-2** — Le compteur hebdomadaire correspond aux actions du journal ; une action consommée n’offre pas Annuler et une action annulable change d’état après clic.
- **CA-3** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-4** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/spec-710.test.ts`, `describe('[SPEC-710] règles et calculs')` : pour CA-1 : Les dix automatismes apparaissent exactement une fois dans les groupes et carte prévus ; un réglage désactivé n’est pas éditable. ; CA-2 : Le compteur hebdomadaire correspond aux actions du journal ; une action consommée n’offre pas Annuler et une action annulable change d’état après clic. Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.
- **Intégration** — `packages/services/test/integration/spec-710.test.ts`, `describe('[SPEC-710] service et API')` : exécuter les mêmes cas sur Supabase local avec `LLM_MODE=mock`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p7/spec-710.spec.ts`, `test('parcours SPEC-710 @SPEC-710')` : partir du seed SPEC-115, ouvrir SCR-15, effectuer les actions des CA-1 à CA-2, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.
- **Visuel** — `test('conformité SPEC-710 @SPEC-710 @visual')` : jetons, régions, textes, comparaison de référence ≤ 12 %, captures desktop/mobile ≤ 1 % et axe (CA-4).
- **Non-régression** — Rejouer les étiquettes `[SPEC-707]` et `@SPEC-707`, `[SPEC-711]` et `@SPEC-711` en plus des suites unitaires/intégration complètes.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-2 | unitaires ciblés ; intégration service ; e2e parcours |
| CA-3 | intégration RLS, invalides et idempotence |
| CA-4 | e2e et `@SPEC-710 @visual` |

## 13. Preuves attendues

`evidence/SPEC-710/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-4. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

