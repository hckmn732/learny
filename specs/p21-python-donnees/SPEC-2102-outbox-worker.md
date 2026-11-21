---
id: SPEC-2102
title: Outbox et worker Python remplaçant Inngest
phase: P21
priority: migration
depends_on: [SPEC-2101]
business_rules: []
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-2006, ADR-2014]
visual: demo
---

# SPEC-2102 — Outbox et worker Python remplaçant Inngest

## 1. Objectif

Fournir l'exécution asynchrone durable qui remplacera Inngest, prête à recevoir les consommateurs des specs de domaine.

## 2. Contexte

Les jobs et automatismes tournent sur Inngest (ADR-0017) ; l'outbox transactionnelle existe déjà en base. ADR-2006 fixe le remplacement par un worker maison.

**Canevas technique normatif (ADR-2011)** : `docs/architecture/python-backend/00-conventions.md` puis la section SPEC-2102 de `docs/architecture/python-backend/P21-plan.md`, à suivre pas à pas ; les prototypes validés sont décrits dans `docs/architecture/python-backend/spikes.md`. Le code Python est rédigé en anglais ; les textes vus par l'utilisateur restent en français, copiés à l'identique.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2101** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Toutes les règles couvertes par le code porté restent actives ; leurs tests sont rejoués via la façade ou portés selon ADR-2008.

## 5. Exigences fonctionnelles

- **EF-1** — Migration additive : table `job_deliveries` et colonne `event_outbox.dispatched_at` (ADR-2014), ignorées par le TypeScript.
- **EF-2** — Répartition de l'outbox vers une livraison par consommateur Python, réclamation avec bail, appel direct des cas d'usage, backoff exponentiel borné et échecs définitifs.
- **EF-3** — Déduplication (événement, consommateur) garantissant un seul effet par livraison répétée.
- **EF-4** — Planificateur singleton des tâches périodiques, horloge injectable ; inactif tant que les crons sont à `ts`.
- **EF-5** — Mode `inline` pour les tests avec pont vers Hono pour les consommateurs encore TypeScript ; les 4 routes `dev-jobs` et le consommateur de démonstration basculent à `py`.

## 6. Exigences techniques

- **ET-1** — Arrêt gracieux (fin du lot en cours), reprise après crash sans perte.
- **ET-2** — Métriques : âge du plus vieil événement, taux d'échec, lettres mortes.
- **ET-3** — Aucun appel HTTP interne vers l'API.

## 7. Comportements attendus et cas limites

- **CL-1** — Worker tué en cours de traitement : l'événement est repris, un seul effet.
- **CL-2** — Deux workers concurrents : aucun double traitement.
- **CL-3** — Deux instances du planificateur : une seule exécute.

## 8. Instructions d'implémentation

Le détail technique (structure, motifs, extraits de code, pièges) est dans la section SPEC-2102 de `docs/architecture/python-backend/P21-plan.md` ; les étapes ci-dessous en sont le résumé.

1. Implémenter `learny.shared.outbox` et `apps/worker-py`.
2. Écrire les tests de crash, concurrence et doublons sur Supabase local.
3. Documenter le runbook de lettres mortes.

Commits atomiques `feat|test|refactor(SPEC-2102): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `apps/worker-py/`, `packages-py/learny/shared/outbox/`, runbook.
- **Modifiés** — `api/ownership.yaml` (aucune bascule).
- **Lus/réutilisés** — `packages/jobs`, `packages/automations`, tables d'outbox.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — Les tests de crash, concurrence et livraison dupliquée passent avec un seul effet par événement.
- **CA-2** — Le planificateur ne s'exécute qu'une fois avec deux instances.
- **CA-3** — Aucun événement possédé par Inngest n'est consommé par le worker Python.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2102]` : backoff, déduplication, sélection par propriétaire. Couvre CA-1, CA-2, CA-3.
- **Intégration** — `[SPEC-2102]` sur Supabase local, sérialisé par verrou de base : outbox réelle, crash, concurrence, planificateur. Couvre CA-1, CA-2, CA-3.
- **E2E** — Playwright `@SPEC-2102` avec vidéo : démonstration d'un événement traité de bout en bout. Couvre CA-1, CA-2, CA-3.
- **Visuel** — `@SPEC-2102 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2102/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2102]`, e2e `@SPEC-2102` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2102` puis `complete.mjs SPEC-2102`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2102 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-2006, ADR-2014.
- ADR-2006.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
