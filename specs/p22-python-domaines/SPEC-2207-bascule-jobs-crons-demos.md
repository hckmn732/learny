---
id: SPEC-2207
title: Bascule des jobs, des crons et des routes de démonstration vers Python
phase: P22
priority: migration
depends_on: [SPEC-2206]
business_rules: []
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-2006, ADR-2014]
visual: demo
---

# SPEC-2207 — Bascule des jobs, des crons et des routes de démonstration vers Python

## 1. Objectif

Faire exécuter tout le travail asynchrone par le worker Python et porter les dernières routes, de sorte que la façade ne relaie plus rien vers Hono.

## 2. Contexte

Après SPEC-2206, toutes les opérations métier sont à `py` et tous les cas d'usage appelés par les jobs sont portés ; les consommateurs et crons sont encore exécutés par Inngest (ADR-2014). La table de correspondance des fonctions Inngest est dans le plan P22.

**Canevas technique normatif (ADR-2011)** : `docs/architecture/python-backend/00-conventions.md` puis la section SPEC-2207 de `docs/architecture/python-backend/P22-plan.md`, à suivre pas à pas ; les prototypes validés sont décrits dans `docs/architecture/python-backend/spikes.md`. Le code Python est rédigé en anglais ; les textes vus par l'utilisateur restent en français, copiés à l'identique.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2206** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Toutes les règles couvertes par le code porté restent actives ; leurs tests sont rejoués via la façade ou portés selon ADR-2008.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque fonction Inngest de l'inventaire a un consommateur Python ou une tâche du planificateur équivalente, appelant le cas d'usage porté.
- **EF-2** — `step.sleepUntil` est remplacé par `run_at` ; le résumé quotidien passe par l'événement interne `job/daily-digest` ajouté au contrat d'événements.
- **EF-3** — Tous les consommateurs et crons passent à `py` en une fois ; Hono tourne sans `/api/inngest` ; le pont inline et la route de dispatch éventuelle sont supprimés.
- **EF-4** — Les routes `dev`, `dev-migration`, `dev-sdd-migration` et les routes spéciales restantes sont servies par Python ; la façade ne relaie plus aucune entrée.

## 6. Exigences techniques

- **ET-1** — Consommateurs idempotents : la concurrence de limite 1 est garantie par des gardes de transition d'état ; les limites de débit supérieures sont abandonnées (ADR-2014).
- **ET-2** — Tests d'intégration du worker pour chaque consommateur (succès, reprise, échec définitif, livraison dupliquée).
- **ET-3** — Horloge injectable pour `run_at` et pour les échéances des crons.

## 7. Comportements attendus et cas limites

- **CL-1** — Événement à charge invalide : livraison en échec définitif, journalisée, sans reprise.
- **CL-2** — Deux instances du planificateur : un seul tick par échéance grâce au verrou consultatif et à l'identifiant d'événement.
- **CL-3** — Consommateur dépassant son délai : annulation, reprise selon le backoff, aucun double effet.

## 8. Instructions d'implémentation

Le détail technique (structure, motifs, extraits de code, pièges) est dans la section SPEC-2207 de `docs/architecture/python-backend/P22-plan.md` ; les étapes ci-dessous en sont le résumé.

1. Brancher les consommateurs dans `learny_worker/consumers.py` selon la table du plan P22.
2. Porter les tâches des crons horaires et nocturnes dans le planificateur.
3. Basculer `consumers` et `crons` à `py`, configurer Hono sans Inngest dans Playwright, supprimer le pont.
4. Porter les routes de démonstration et spéciales restantes, puis rejouer la suite complète.

Commits atomiques `feat|test|refactor(SPEC-2207): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `apps/worker-py/src/learny_worker/consumers.py` complété, `apps/api-py/src/learny_api/special/dev_*.py`.
- **Modifiés** — `api/ownership.yaml`, `api/events.schema.json`, `apps/web/playwright.config.ts`.
- **Lus/réutilisés** — `packages/jobs/src/functions/*`, `packages/api-routes/src/special/*`, `packages/contracts/src/dev*.ts`.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — Toutes les entrées de `api/ownership.yaml` (opérations, routes spéciales, consommateurs, crons) sont à `py` et la façade ne relaie plus rien.
- **CA-2** — Chaque consommateur a des tests d'intégration verts (succès, reprise, doublon, échec définitif).
- **CA-3** — La suite e2e, visuelle et cross-browser complète passe avec Hono sans Inngest.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2207]` : calcul de run_at, échéances des crons, sélection par propriétaire. Couvre CA-1, CA-2, CA-3.
- **Intégration** — `[SPEC-2207]` sur Supabase local, sérialisé par verrou de base : chaque consommateur sur Supabase local, planificateur à deux instances. Couvre CA-1, CA-2, CA-3.
- **E2E** — Playwright `@SPEC-2207` avec vidéo : suite complète avec jobs exécutés par Python en mode inline. Couvre CA-1, CA-2, CA-3.
- **Visuel** — `@SPEC-2207 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2207/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2207]`, e2e `@SPEC-2207` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2207` puis `complete.mjs SPEC-2207`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2207 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-2006, ADR-2014.
- ADR-2014 (événement interne `job/daily-digest`, abandon des limites de débit).
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.

## Amendements

- **2026-11-23, ADR-2039** — les compteurs du tableau de bord sont alignés sur `api/ownership.yaml` : 201 opérations Python sur 217 et 19 entrées encore relayées ; les deux libellés devenus faux sont remplacés.
