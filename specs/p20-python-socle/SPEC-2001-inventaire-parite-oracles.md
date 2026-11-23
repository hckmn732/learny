---
id: SPEC-2001
title: Inventaire, matrice de parité et oracles de référence
phase: P20
priority: migration
depends_on: []
business_rules: []
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-2004]
visual: demo
---

# SPEC-2001 — Inventaire, matrice de parité et oracles de référence

## 1. Objectif

Établir la base de référence complète et vérifiable du backend TypeScript de `main` avant toute ligne de Python : ce qui existe, qui y accède, ce que cela modifie et comment on prouve qu'un portage est identique.

## 2. Contexte

L'audit `docs/architecture/python-headless-migration/` donne une première image (documents 02, 02b et 03). L'écart 217/219 est expliqué par ADR-2004 : `countRegistryRoutes` compte les deux `defineRoute(` internes aux fabriques de `dev-sdd-migration.ts`.

**Canevas technique normatif (ADR-2011)** : `docs/architecture/python-backend/00-conventions.md` puis la section SPEC-2001 de `docs/architecture/python-backend/P20-plan.md`, à suivre pas à pas ; les prototypes validés sont décrits dans `docs/architecture/python-backend/spikes.md`. Le code Python est rédigé en anglais ; les textes vus par l'utilisateur restent en français, copiés à l'identique.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- Aucune spécification ; point de départ de la piste depuis `main` (ADR-2001).
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Toutes les règles couvertes par le code porté restent actives ; leurs tests sont rejoués via la façade ou portés selon ADR-2008.

## 5. Exigences fonctionnelles

- **EF-1** — Produire `evidence/SPEC-2001/inventory.md` et `inventory.json` : chaque opération (217), flux SSE, webhook, événement d'outbox, fonction de job et tâche planifiée, avec acteur, authentification, entrées/sorties, erreurs, idempotence, tables lues/écrites, événements émis, règles `BR-*`, tests existants et contexte cible (ADR-2003).
- **EF-2** — Générer automatiquement l'inventaire depuis le registre de contrats, l'application Hono et les définitions de jobs, avec un test qui échoue si une entrée apparaît ou disparaît sans mise à jour.
- **EF-3** — Exporter des oracles JSON déterministes (horloge figée, IA simulée) : réponses HTTP de référence par opération et scénario d'accès, sorties du moteur d'apprentissage, effets en base et événements.
- **EF-4** — Produire `evidence/SPEC-2001/test-port-map.md` listant chaque fichier de test TypeScript backend et son futur équivalent pytest (ADR-2008).
- **EF-5** — Corriger l'heuristique `countRegistryRoutes` pour compter 217 opérations réelles, sans changer d'autre comportement.

## 6. Exigences techniques

- **ET-1** — Outillage d'export en TypeScript sous `tools/migration/`, exécuté contre Supabase local seedé ; aucune donnée de production.
- **ET-2** — Oracles stockés sous `api/oracles/`, versionnés, sans secret ni donnée personnelle réelle.
- **ET-3** — Inventaire des politiques RLS, fonctions SQL, triggers et chemins Storage avec leur table propriétaire.

## 7. Comportements attendus et cas limites

- **CL-1** — Opération sans test existant : signalée comme lacune ; un test de caractérisation HTTP est ajouté (contre le TypeScript) avant toute migration de cette opération.
- **CL-2** — Sortie non déterministe (horodatage, identifiant) : normalisée par une règle explicite et documentée dans l'oracle, jamais ignorée en silence.
- **CL-3** — Entrée classée hors périmètre (routes de démonstration SDD) : listée avec la justification et l'ADR applicable.

## 8. Instructions d'implémentation

Le détail technique (structure, motifs, extraits de code, pièges) est dans la section SPEC-2001 de `docs/architecture/python-backend/P20-plan.md` ; les étapes ci-dessous en sont le résumé.

1. Écrire l'extracteur d'inventaire à partir de `packages/contracts/src/routes.ts`, de `apps/api/src/mount.ts` et de `packages/jobs`/`packages/automations`.
2. Croiser avec les tests existants (étiquettes `[SPEC-xxx]`/`@SPEC-xxx`) pour relier chaque entrée à ses preuves.
3. Écrire le capteur d'oracles HTTP et moteur, et le figer dans `api/oracles/`.
4. Rédiger la carte de portage des tests et la matrice des contextes cibles.

Commits atomiques `feat|test|refactor(SPEC-2001): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `tools/migration/inventory.mjs`, `tools/migration/oracles/*`, `api/oracles/`, preuves sous `evidence/SPEC-2001/`.
- **Modifiés** — `tools/migration/report.mjs` (comptage corrigé) et son test.
- **Lus/réutilisés** — `packages/contracts`, `packages/api-routes`, `packages/jobs`, `packages/automations`, `packages/db/migrations`, `apps/api`, tous les tests backend.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — `inventory.md` couvre 217 opérations et tous les SSE, webhooks, événements et tâches ; chaque entrée a un contexte cible, un acteur, des tables et au moins un test.
- **CA-2** — Le test de dérive d'inventaire échoue si une opération est ajoutée ou retirée sans mise à jour.
- **CA-3** — Les oracles se rejouent deux fois de suite à l'identique contre le TypeScript.
- **CA-4** — `test-port-map.md` liste tous les fichiers de test backend avec un équivalent cible.
- **CA-5** — `report.mjs --check` affiche 217 routes.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2001]` : extraction d'inventaire, normalisation des oracles, comptage corrigé. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Intégration** — `[SPEC-2001]` sur Supabase local, sérialisé par verrou de base : capture des oracles contre Supabase local, rejeu identique. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **E2E** — Playwright `@SPEC-2001` avec vidéo : parcours de démonstration de l'inventaire servi par la façade. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Visuel** — `@SPEC-2001 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2001/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2001]`, e2e `@SPEC-2001` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2001` puis `complete.mjs SPEC-2001`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2001 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-2004.
- ADR-2004 explique l'écart 217/219. Aucune décision d'architecture nouvelle.
- ADR-2016 — normalisation de parité (identifiants, horodatages, e-mails, durées, plans EXPLAIN) et scénarios de lecture générés depuis l inventaire.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
