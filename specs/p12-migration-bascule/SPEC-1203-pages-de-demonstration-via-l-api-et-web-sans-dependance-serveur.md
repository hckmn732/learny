---
id: SPEC-1203
title: Pages de démonstration via l'API et web sans dépendance serveur
phase: P12
priority: migration
depends_on: [SPEC-1202]
business_rules: []
screens: []
adrs: [ADR-0338, ADR-0049, ADR-0341, ADR-0342]
visual: demo
---

# SPEC-1203 — Pages de démonstration via l'API et web sans dépendance serveur

## 1. Objectif

Terminer la séparation : les pages de démonstration SDD (`/_dev/sdd/*`) n'appellent plus les services directement mais des routes `dev.sdd.*` de `apps/api`, `apps/web` ne dépend plus d'aucun paquet serveur, et la règle « le web est un client » s'applique sans aucune exception.

## 2. Contexte

ADR-0049 amendé (ADR-0338, ADR-0341) : une page de démonstration ne lit ni n'écrit la base elle-même. À l'issue de SPEC-1202, la liste de référence ne contient plus que des fichiers de `apps/web/app/%5Fdev/**` (28 au démarrage de la piste, dont 6 fichiers d'actions serveur `spec-102-actions.ts`, `spec-501-actions.ts`, `spec-504-actions.ts`, `spec-505-actions.ts`, `spec-506-actions.ts`, `spec-512-actions.ts`) et de `apps/web/components/sdd-demos/**`. Ces pages servent de preuve aux spécifications déjà terminées : leurs tests `@SPEC-xxx` existants doivent continuer de passer. Lire ADR-0049, ADR-0338, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/lib/api/dev-guard.ts` (déplacé dans `@learny/http`).

## 3. Dépendances

- **SPEC-1202** : écrans produit découplés, `serverApi()`.
- Garde de développement (`ENABLE_SDD_PAGES`) de `@learny/http`.

## 4. Règles métier couvertes

Aucune règle `BR-*`.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque page de démonstration encore couplée obtient ses données et déclenche ses actions par des routes `dev.sdd.<spec>.<action>` sous `/api/v1/dev/sdd/<SPEC-xxx>/…`, déclarées dans `packages/contracts/src/dev-*.ts`, implémentées dans `@learny/api-routes`, protégées par la garde de développement (404 sans `ENABLE_SDD_PAGES=true`, jamais en production).
- **EF-2** — Les six fichiers d'actions serveur sont remplacés par des appels à ces routes (formulaires client ou actions serveur qui n'appellent que `serverApi()`).
- **EF-3** — Les tests e2e existants des pages de démonstration (`@SPEC-102`, `@SPEC-501`, `@SPEC-504`, `@SPEC-505`, `@SPEC-506`, `@SPEC-512` et toutes les autres pages de la liste) passent sans modification d'assertion.
- **EF-4** — `apps/web/package.json` ne déclare plus en `dependencies` `@learny/db`, `@learny/services`, `@learny/jobs`, `@learny/llm`, `@learny/tutor`, `@learny/ingestion`, `@learny/automations`, `@learny/notifications`, `@learny/http`, `@learny/api-routes`, `inngest`, `ai` côté serveur ; seuls les tests (`devDependencies`) peuvent encore utiliser `@learny/db` et `@learny/testing` pour leurs données.
- **EF-5** — `tools/migration/web-boundary-baseline.json` est supprimé ; la règle `learny/web-is-a-client` n'a plus d'exception hors `apps/web/test/**` et `apps/web/e2e/**`.
- **EF-6** — La page `/_dev/sdd/SPEC-1203` affiche le rapport final : 0 fichier couplé, liste des dépendances de `apps/web`, et le résultat du contrôle de la construction (aucun module de paquet serveur dans la sortie Next).

## 6. Exigences techniques

- **ET-1** — Contrôle de construction `tools/migration/web-bundle.test.ts` : après `pnpm --filter @learny/web build`, les fichiers de trace (`.next/**/*.nft.json`) et la sortie `standalone` ne référencent aucun fichier de `packages/(db|services|jobs|llm|tutor|ingestion|automations|notifications|http|api-routes)/`.
- **ET-2** — `SERVICE_DB_ALLOWED` (ESLint) ne contient plus aucun chemin de `apps/web` hors tests.
- **ET-3** — `pnpm migration:report` indique 0 dans toutes les catégories et reste disponible jusqu'à SPEC-1302.
- **ET-4** — Les routes `dev.sdd.*` sont inscrites dans l'inventaire de `docs/architecture/api.md` (une ligne regroupée « Démonstrations SDD de la piste de migration », `ENABLE_SDD_PAGES` seulement).

## 7. Comportements attendus et cas limites

- **CL-1** — `ENABLE_SDD_PAGES` absent → les pages et les routes `dev.sdd.*` répondent 404 (pages : comportement ADR-0049 ; routes : garde de développement).
- **CL-2** — Production : aucune route `dev.sdd.*` n'est montée même si la variable est présente (contrôle de configuration existant, rejoué contre `apps/api`).
- **CL-3** — Démonstration qui a besoin d'un compte de démonstration → l'API utilise la session transmise par `serverApi()`, jamais une clé de service exposée au web.
- **CL-4** — Action de démonstration non idempotente → elle exige `Idempotency-Key` comme toute création (ADR-0120).

## 8. Instructions d'implémentation

1. Inventaire des pages restantes (`pnpm migration:report`), regroupement par spécification d'origine.
2. Pour chaque spécification d'origine : contrats `dev.sdd.*`, implémentations, bascule de la page, rejeu de `@SPEC-xxx`. Un commit par spécification d'origine : `refactor(SPEC-1203): démontre SPEC-xxx par l'API`.
3. Retrait des dépendances serveur de `apps/web/package.json`, suppression de la liste de référence, règle sans exception, `SERVICE_DB_ALLOWED`. Commit `build(SPEC-1203): fait du web un client sans dépendance serveur`.
4. Contrôle de construction, démonstration, e2e, visuel ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/dev-sdd-*.ts`, `packages/api-routes/src/implementations/dev-sdd-*.ts`, `tools/migration/web-bundle.test.ts`, `apps/web/components/sdd-demos/spec-1203.tsx`, `apps/web/e2e/specs/p12/spec-1203.spec.ts`.
- **Supprimés** : `apps/web/app/%5Fdev/sdd/spec-{102,501,504,505,506,512}-actions.ts` (remplacés), `tools/migration/web-boundary-baseline.json`.
- **Modifiés** : fichiers couplés de `apps/web/app/%5Fdev/**` et `apps/web/components/sdd-demos/**`, `packages/contracts/src/routes.ts`, `apps/web/package.json`, `eslint.config.mjs`, `tools/migration/report.mjs`, `docs/architecture/api.md`, `apps/web/app/%5Fdev/sdd/registry.ts`, `pnpm-lock.yaml`.

## 10. Interface et conformité visuelle

Les pages de démonstration existantes gardent leur rendu : leurs tests `@visual` passent sans nouvelle ligne de base. Démonstration `/_dev/sdd/SPEC-1203` : `h1` « Web sans dépendance serveur » ; tableau `data-testid="spec-1203-coupling"` (toutes catégories à 0) ; liste `spec-1203-dependencies` ; carte `spec-1203-bundle` (« Modules serveur dans la construction : 0 »). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — `pnpm migration:report` renvoie 0 fichier couplé dans toutes les catégories ; la liste de référence n'existe plus.
- **CA-2** — `apps/web/package.json` ne déclare aucun paquet serveur en `dependencies` ; la construction du web ne référence aucun fichier de paquet serveur.
- **CA-3** — Tous les tests e2e et `@visual` des pages de démonstration existantes passent sans modification d'assertion ni nouvelle ligne de base.
- **CA-4** — Sans `ENABLE_SDD_PAGES`, toutes les routes `dev.sdd.*` répondent 404 ; en configuration de production, elles ne sont pas montées.
- **CA-5** — La démonstration affiche 0 partout.

## 12. Plan de tests

- **Unitaires** — `tools/migration/test/unit/boundary.test.ts`, `describe('[SPEC-1203] no exception')` : aucune exception hors tests (CA-1) ; `tools/migration/web-bundle.test.ts`, `describe('[SPEC-1203] web bundle')` (CA-2).
- **Intégration** — `apps/api/test/integration/dev-sdd-routes.test.ts`, `describe('[SPEC-1203] dev sdd routes')` : 404 sans variable, non montées en production, idempotence des créations (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p12/spec-1203.spec.ts`, `test('montre un web sans dépendance serveur @SPEC-1203')` (CA-5), vidéo ; rejeu de toutes les pages de démonstration (CA-3).
- **Visuel** — `test('démonstration du web client pur @SPEC-1203 @visual')` (CA-5).
- **Non-régression** — `pnpm test:e2e` complet (inclut toutes les démonstrations), `[SPEC-006]`, `@SPEC-006`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire frontière ; rapport |
| CA-2 | unitaire construction |
| CA-3 | e2e complète |
| CA-4 | intégration routes de démonstration |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1203/` : sortie de `migration:report`, sortie du contrôle de construction, rapports e2e complets, vidéo, captures, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : CP-12 exécutable (toutes les spécifications de P12 terminées) avec suite complète, cross-browser et performances.

## 15. Décisions et hypothèses

ADR-0049 amendé, ADR-0338. Décision : les tests du web gardent l'accès aux fabriques de données (`@learny/db`, `@learny/testing`) en `devDependencies` ; ce n'est pas du code livré. Aucune question ouverte.
