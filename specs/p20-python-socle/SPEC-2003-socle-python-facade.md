---
id: SPEC-2003
title: Socle Python FastAPI, outillage SDD et façade de coexistence
phase: P20
priority: migration
depends_on: [SPEC-2001]
business_rules: [BR-PLA-08]
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-2002, ADR-2003, ADR-2007, ADR-2012, ADR-2015]
visual: demo
---

# SPEC-2003 — Socle Python FastAPI, outillage SDD et façade de coexistence

## 1. Objectif

Mettre en place le runtime Python et la façade de coexistence sans changer aucun comportement : à la fin, tout le trafic du web passe par FastAPI, qui relaie 100 % des opérations vers Hono.

## 2. Contexte

Playwright démarre aujourd'hui l'API par `pnpm --filter @learny/api dev` (`apps/web/playwright.config.ts`) ; c'est le point de branchement de la façade. `validate.mjs` n'exécute que Vitest et Playwright.

**Canevas technique normatif (ADR-2011)** : `docs/architecture/python-backend/00-conventions.md` puis la section SPEC-2003 de `docs/architecture/python-backend/P20-plan.md`, à suivre pas à pas ; les prototypes validés sont décrits dans `docs/architecture/python-backend/spikes.md`. Le code Python est rédigé en anglais ; les textes vus par l'utilisateur restent en français, copiés à l'identique.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2001** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle nouvelle. Règles directement concernées : BR-PLA-08. Toutes les règles `BR-*` couvertes par le code porté restent actives et leurs tests sont rejoués.

## 5. Exigences fonctionnelles

- **EF-1** — Workspace uv à la racine (`pyproject.toml`, `uv.lock`) avec `apps/api-py`, `apps/worker-py` et `packages-py/learny` (ADR-2003).
- **EF-2** — Application FastAPI : fabrique d'app, configuration typée, `/health/live` et `/health/ready`, format d'erreur du contrat, identifiant de requête, journaux structurés avec masquage des secrets et prompts.
- **EF-3** — Relais de toutes les opérations vers Hono selon `api/ownership.yaml` (toutes à `ts` ici), y compris cookies, en-têtes, codes de statut et flux SSE sans mise en tampon.
- **EF-4** — Playwright démarre Hono puis la façade, et le web appelle la façade ; toute la suite e2e et visuelle passe sans modification.
- **EF-5** — `validate.mjs` exécute aussi `uv run pytest -k "[SPEC-xxxx]"` et ruff/mypy ; `pnpm lint`, `typecheck` et `test:*` incluent les commandes Python.

## 6. Exigences techniques

- **ET-1** — Image Docker multi-étapes reproductible, utilisateur non root, une image pour api et worker (ADR-2007).
- **ET-2** — CI : installation uv avec cache, ruff, mypy, import-linter, pytest ; le build web ne dépend pas du venv.
- **ET-3** — En-têtes de sécurité et limitation de débit conservés à l'identique (BR-PLA-08).
- **ET-4** — Horloge injectable et mode mock disponibles dès le socle.

## 7. Comportements attendus et cas limites

- **CL-1** — Hono indisponible : la façade renvoie l'erreur stable du contrat avec délai borné.
- **CL-2** — Flux SSE coupé côté client : la façade ferme la connexion amont.
- **CL-3** — Entrée absente de `api/ownership.yaml` : démarrage refusé.

## 8. Instructions d'implémentation

Le détail technique (structure, motifs, extraits de code, pièges) est dans la section SPEC-2003 de `docs/architecture/python-backend/P20-plan.md` ; les étapes ci-dessous en sont le résumé.

1. Créer le workspace uv et les trois projets, la configuration ruff/mypy/import-linter et les scripts.
2. Écrire la façade et ses tests de relais (statuts, cookies, SSE, erreurs).
3. Brancher Playwright sur la façade et rejouer toute la suite.
4. Étendre `validate.mjs` et la CI ; écrire le Dockerfile.

Commits atomiques `feat|test|refactor(SPEC-2003): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `pyproject.toml`, `uv.lock`, `apps/api-py/`, `apps/worker-py/`, `packages-py/learny/`, `api/ownership.yaml`, `Dockerfile`, `.importlinter`.
- **Modifiés** — `apps/web/playwright.config.ts`, `tools/sdd/validate.mjs`, `package.json`, CI.
- **Lus/réutilisés** — `apps/api`, `packages/http`.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — `uv sync --frozen`, ruff, mypy, import-linter et pytest passent en local et en CI.
- **CA-2** — La suite e2e et visuelle complète passe à travers la façade sans modification de test ni de ligne de base.
- **CA-3** — `validate.mjs SPEC-2003` exécute les tests pytest étiquetés et échoue si l'un d'eux échoue.
- **CA-4** — L'image Docker se construit deux fois avec le même résultat et démarre api et worker.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2003]` : configuration, erreurs, journaux masqués, chargement de la table de propriété. Couvre CA-1, CA-2, CA-3, CA-4.
- **Intégration** — `[SPEC-2003]` sur Supabase local, sérialisé par verrou de base : relais HTTP et SSE vers Hono, cookies et statuts. Couvre CA-1, CA-2, CA-3, CA-4.
- **E2E** — Playwright `@SPEC-2003` avec vidéo : suite complète via la façade. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-2003 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2003/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2003]`, e2e `@SPEC-2003` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2003` puis `complete.mjs SPEC-2003`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2003 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-2002, ADR-2003, ADR-2007, ADR-2012, ADR-2015.
- ADR-2002, ADR-2003, ADR-2005, ADR-2007.
- ADR-2019 — CA-2 interprété comme « aucune régression introduite par la façade » : la suite complète est déjà rouge sur `main` (SPEC-006), ses deux oracles se contredisant.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
