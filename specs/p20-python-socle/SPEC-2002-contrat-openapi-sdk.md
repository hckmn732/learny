---
id: SPEC-2002
title: Contrat OpenAPI source unique et SDK TypeScript généré
phase: P20
priority: migration
depends_on: [SPEC-2001]
business_rules: []
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2004]
visual: demo
---

# SPEC-2002 — Contrat OpenAPI source unique et SDK TypeScript généré

## 1. Objectif

Faire d'`api/openapi.yaml` la source unique du contrat, consommée par le web via un SDK généré et vérifiée contre les deux runtimes.

## 2. Contexte

Le contrat vit aujourd'hui en Zod dans `packages/contracts` et est exporté dans `apps/api/openapi.json` (217 opérations). Le web consomme `packages/api-client`.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2001** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Toutes les règles couvertes par le code porté restent actives ; leurs tests sont rejoués via la façade ou portés selon ADR-2008.

## 5. Exigences fonctionnelles

- **EF-1** — Générer une fois `api/openapi.yaml` (OpenAPI 3.1) depuis le registre Zod, avec schémas d'erreur, pagination, sécurité cookie/Bearer, idempotence et description des événements SSE.
- **EF-2** — Générer le SDK TypeScript depuis ce fichier et faire passer `packages/api-client` sur ces types sans changement de comportement du web.
- **EF-3** — Ajouter le contrôle CI de dérive Zod ↔ OpenAPI tant que le runtime TypeScript existe.
- **EF-4** — Ajouter l'outil de comparaison de compatibilité (opérations, paramètres, corps, statuts, erreurs, sécurité) utilisé par la façade Python et chaque spec de domaine, avec `api/contract-exceptions.yaml`.

## 6. Exigences techniques

- **ET-1** — Lint OpenAPI en CI ; génération reproductible (même sortie sur deux exécutions).
- **ET-2** — Le SDK généré est commité et vérifié à jour en CI.
- **ET-3** — Aucune modification de chemin, statut ou code d'erreur.

## 7. Comportements attendus et cas limites

- **CL-1** — Schéma Zod non exprimable en OpenAPI : extension documentée dans le fichier, test de non-régression ajouté.
- **CL-2** — Différence entre `apps/api/openapi.json` et `api/openapi.yaml` : la CI échoue jusqu'à alignement.
- **CL-3** — Exception de contrat sans ADR : refusée par la CI.

## 8. Instructions d'implémentation

1. Écrire l'export Zod → OpenAPI 3.1 et figer `api/openapi.yaml`.
2. Choisir le générateur de SDK, l'ajouter au workspace pnpm et générer le client.
3. Raccorder `packages/api-client` au SDK généré ; rejouer typecheck, unitaires et e2e du web.
4. Écrire l'outil de compatibilité et ses tests.

Commits atomiques `feat|test|refactor(SPEC-2002): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `api/openapi.yaml`, `api/contract-exceptions.yaml`, `packages/api-sdk/` (généré), `tools/contract/*`.
- **Modifiés** — `packages/api-client`, CI.
- **Lus/réutilisés** — `packages/contracts`, `apps/api/openapi.json`.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — `api/openapi.yaml` est valide, contient 217 opérations et la CI vérifie l'absence de dérive avec le registre Zod.
- **CA-2** — Le web compile et ses tests passent sur le SDK généré sans modification d'assertion.
- **CA-3** — L'outil de compatibilité détecte une rupture injectée dans un test et accepte une exception reliée à un ADR.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2002]` : export OpenAPI, outil de compatibilité, génération reproductible. Couvre CA-1, CA-2, CA-3.
- **Intégration** — `[SPEC-2002]` sur Supabase local, sérialisé par verrou de base : appels du SDK généré contre l'API TypeScript locale. Couvre CA-1, CA-2, CA-3.
- **E2E** — Playwright `@SPEC-2002` avec vidéo : parcours web existants inchangés via le SDK généré. Couvre CA-1, CA-2, CA-3.
- **Visuel** — `@SPEC-2002 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2002/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2002]`, e2e `@SPEC-2002` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2002` puis `complete.mjs SPEC-2002`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2002 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2004.
- ADR-2004. Le choix précis du générateur est consigné par ADR déduit si plusieurs options sont équivalentes.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
