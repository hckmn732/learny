---
id: SPEC-1001
title: Démarrage de la piste de migration et garde-fous de séparation
phase: P10
priority: migration
depends_on: [SPEC-003, SPEC-011]
business_rules: []
screens: []
adrs: [ADR-1001, ADR-1003, ADR-1006, ADR-0049]
visual: demo
---

# SPEC-1001 — Démarrage de la piste de migration et garde-fous de séparation

## 1. Objectif

Rendre la branche `migration` exécutable et sûre : intégration continue sur la branche, aucun déploiement accidentel, synchronisation quotidienne avec `main` sans conflit de suivi, page de démonstration à identifiant à 4 chiffres, et une règle de lint qui **interdit toute nouvelle dépendance** du web vers les paquets serveur tout en mesurant l'existant qui doit disparaître.

## 2. Contexte

Première spécification de la piste « migration » (ADR-1006) qui sépare le backend et le frontend (ADR-1001, ADR-1003). Le commit d'amorçage de la branche a déjà rendu l'outillage SDD conscient des pistes (`tools/sdd/core.mjs` : `track`, `requires`, `activeTrack`, `tracks.<piste>.baseBranch`) et accepté les portées `SPEC-\d{3,4}` et `CP-\d{1,2}`. Lire : `docs/adr/ADR-1001…`, `ADR-1003…`, `ADR-1006…`, `docs/engineering/sdd-process.md` (section « Pistes »), `docs/engineering/git.md`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `eslint.config.mjs` (zones `boundaryZones`, `SERVICE_DB_ALLOWED`), `apps/web/lib/sdd-pages.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`.

État mesuré au démarrage de la piste (commit 773a4859) : 79 fichiers de `apps/web` hors `app/api` importent un paquet serveur (8 pages, 28 modules `lib/`, 15 composants, 28 fichiers `app/_dev`, `proxy.ts`), dont 4 composants client ; 154 fichiers `route.ts`.

## 3. Dépendances

- **SPEC-003** (outillage SDD) et **SPEC-011** (CI) : `done` sur `main`.
- Aucune dépendance externe nouvelle. `git` ≥ 2.40 pour la synchronisation.

## 4. Règles métier couvertes

Aucune règle `BR-*` : spécification technique, aucun comportement produit modifié (ADR-1001 §4).

## 5. Exigences fonctionnelles

- **EF-1** — La CI (`.github/workflows/ci.yml`) se déclenche sur les poussées vers `migration` en plus des branches existantes. `node tools/ci/check-workflows.mjs` reste vert.
- **EF-2** — `.github/workflows/deploy.yml` ne déploie **ni prévisualisation ni production** pour `migration` ni pour les branches `spec/SPEC-1*` ; la condition est explicite et testée (SPEC-1103 la lèvera).
- **EF-3** — `node tools/sdd/sync-main.mjs` fusionne `main` dans la branche courante (`git merge --no-ff main`) : si les seuls conflits portent sur `progress/state.json` ou `progress/PROGRESS.md`, il les résout selon ADR-1006 §4 (entrées de `main` pour la piste « produit », entrées de la branche pour la piste « migration », `updatedAt` le plus récent), régénère `progress/PROGRESS.md`, puis committe `merge(sdd): synchronise main dans migration`. S'il reste un conflit de code, il s'arrête avec la liste des fichiers en conflit et un code de sortie 2, sans committer.
- **EF-4** — Règle `learny/web-is-a-client` : tout fichier de `apps/web` qui importe `@learny/db`, `@learny/services`, `@learny/jobs`, `@learny/llm`, `@learny/tutor`, `@learny/ingestion`, `@learny/automations` ou `@learny/notifications` (chemin racine ou sous-chemin) est une erreur de lint **sauf** s'il figure dans `tools/migration/web-boundary-baseline.json`. Les tests (`apps/web/test/**`, `apps/web/e2e/**`) sont exemptés.
- **EF-5** — La liste de référence ne peut que **diminuer** : un test échoue si elle contient un fichier qui n'importe plus aucun paquet serveur (entrée périmée à retirer) ou un fichier inexistant.
- **EF-6** — `pnpm migration:report` (`tools/migration/report.mjs`) affiche et écrit `progress/migration.json` : nombre de fichiers web couplés par catégorie (`pages`, `lib`, `components`, `dev`, `proxy`, `apiRoutes`), nombre de routes du registre `ROUTES`, nombre de fichiers `route.ts`, et la liste des composants client couplés.
- **EF-7** — La page `/_dev/sdd/SPEC-1001` affiche ce rapport : titre « Piste de migration », tableau « Couplage du web » (une ligne par catégorie, valeurs du rapport), tableau « Routes » et liste « Composants client couplés ».

## 6. Exigences techniques

- **ET-1** — `SDD_SPEC_ID_PATTERN` (`apps/web/lib/sdd-pages.ts`) devient `/^SPEC-\d{3,4}$/` ; `proxy.ts` et `app/%5Fdev/sdd/[specId]` acceptent donc les identifiants de la piste.
- **ET-2** — La règle EF-4 est implémentée dans `eslint.config.mjs` par un bloc `no-restricted-imports` (motifs `@learny/db`, `@learny/db/*`, etc.) sur `apps/web/**/*.{ts,tsx}` avec `ignores` = contenu de la liste de référence + `apps/web/test/**` + `apps/web/e2e/**` ; message : « apps/web est un client de l'API (ADR-1003) : passer par @learny/api-client. »
- **ET-3** — `tools/migration/web-boundary-baseline.json` : `{ "files": [ "apps/web/…" ], "globs": [ "apps/web/app/api/**" ] }`, chemins triés, générés par `node tools/migration/report.mjs --write-baseline` (option utilisable **uniquement** si la liste est vide ou à la création ; ensuite, seules les suppressions sont permises — vérifié par EF-5).
- **ET-4** — `tools/sdd/sync-main.mjs` réutilise `lib.mjs` (`loadCatalog`, `specTrack`, `writeJsonAtomic`) ; la fusion des états est une fonction pure `mergeTrackStates(catalog, ours, theirs, track)` exportée par `tools/sdd/core.mjs` et testée.
- **ET-5** — `tools/migration/report.mjs` n'a aucune dépendance externe (Node 24) ; il analyse les imports par expression régulière sur `from '…'` et `import('…')`.
- **ET-6** — Script racine `migration:report` dans `package.json`.

## 7. Comportements attendus et cas limites

- **CL-1** — Nouveau fichier web qui importe `@learny/services/home/derive` → erreur de lint, même via un sous-chemin.
- **CL-2** — Fichier de la liste qui n'importe plus de paquet serveur → test EF-5 en échec avec le message « entrée périmée : <fichier> ».
- **CL-3** — `sync-main.mjs` sans branche `main` locale → sortie 1 « branche main introuvable ».
- **CL-4** — Conflit sur `progress/state.json` **et** sur un fichier de code → résolution du suivi appliquée, arrêt code 2 sur le fichier de code, aucun commit.
- **CL-5** — Spécification présente dans les deux états avec des statuts différents → la piste de la spécification décide de la source (jamais de mélange champ par champ).
- **CL-6** — `ENABLE_SDD_PAGES` absent → `/_dev/sdd/SPEC-1001` répond 404 (comportement existant ADR-0049).

## 8. Instructions d'implémentation

1. Modifier `ci.yml` (déclencheur `migration`) et `deploy.yml` (exclusion `migration`, `spec/SPEC-1*`), adapter `tools/ci/check-workflows.mjs` et ses tests si nécessaire. Commit `ci(SPEC-1001): exécute la CI sur la branche migration sans déployer`.
2. Écrire `mergeTrackStates` dans `core.mjs` (+ type dans `core.d.mts`) et `tools/sdd/sync-main.mjs` ; tests unitaires et d'intégration (dépôt Git temporaire). Commit `feat(SPEC-1001): synchronise main dans la piste de migration`.
3. Écrire `tools/migration/report.mjs`, générer la liste de référence, ajouter la règle ESLint et le test EF-5. Commit `build(SPEC-1001): interdit tout nouvel import serveur dans apps/web`.
4. Élargir `SDD_SPEC_ID_PATTERN`, ajouter l'entrée `SPEC-1001` au registre et `components/sdd-demos/spec-1001.tsx` (Server Component qui lit `progress/migration.json`, régénéré au build SDD). Commit `feat(SPEC-1001): ajoute la démonstration de la piste de migration`.
5. Tests e2e et visuels, `validate.mjs`, `complete.mjs` (fusion dans `migration`).

## 9. Fichiers et composants concernés

- **Créés** : `tools/sdd/sync-main.mjs`, `tools/sdd/test/unit/merge-states.test.ts`, `tools/sdd/test/integration/sync-main.test.ts`, `tools/migration/report.mjs`, `tools/migration/web-boundary-baseline.json`, `tools/migration/test/unit/boundary.test.ts`, `apps/web/components/sdd-demos/spec-1001.tsx`, `apps/web/e2e/specs/p10/spec-1001.spec.ts`.
- **Modifiés** : `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `tools/ci/check-workflows.mjs` (si nécessaire), `tools/sdd/core.mjs`, `tools/sdd/core.d.mts`, `eslint.config.mjs`, `apps/web/lib/sdd-pages.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`, `package.json`, `vitest.config.ts` (inclure `tools/migration/test/unit`), `.gitignore` (aucun : `progress/migration.json` est versionné).
- **Lus** : `specs/catalog.json`, `packages/contracts/src/routes.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-1001` : `h1` « Piste de migration » ; région `data-testid="spec-1001-coupling"` (tableau, colonnes « Catégorie », « Fichiers ») ; région `spec-1001-routes` (« Routes du registre », « Fichiers route.ts ») ; région `spec-1001-client-components` (liste). Composants de `@learny/ui` uniquement, jetons du thème. Aucun état de chargement (rendu serveur). Contrôles : `expectTokens`, ordre des trois régions, axe sans violation sérieuse, capture `spec-1001-demo.png` à 1440×900 et 390×844, `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Une poussée sur `migration` déclenche la CI ; `deploy.yml` ne contient aucun chemin de déploiement exécutable pour `migration` ou `spec/SPEC-1*` (vérifié par test du workflow).
- **CA-2** — Ajouter un import `@learny/services` dans un nouveau fichier de `apps/web` fait échouer `pnpm lint` ; la liste de référence initiale fait passer le lint sur l'existant.
- **CA-3** — Une entrée périmée dans la liste de référence fait échouer le test de frontière.
- **CA-4** — `sync-main.mjs` résout automatiquement un conflit limité au suivi et s'arrête (code 2, sans commit) sur un conflit de code.
- **CA-5** — La page de démonstration affiche les nombres réels du rapport (79 fichiers couplés au démarrage, ou moins si `main` a évolué) et passe les contrôles visuels.

## 12. Plan de tests

- **Unitaires** — `tools/sdd/test/unit/merge-states.test.ts`, `describe('[SPEC-1001] merge track states')` : sources par piste, `updatedAt`, CL-5 (CA-4). `tools/migration/test/unit/boundary.test.ts`, `describe('[SPEC-1001] web boundary')` : liste exacte, entrée périmée, fichier absent, rapport par catégorie (CA-2, CA-3). Test de workflow dans `tools/ci/*.test.ts` étiqueté `[SPEC-1001]` (CA-1).
- **Intégration** — `tools/sdd/test/integration/sync-main.test.ts`, `describe('[SPEC-1001] sync main')` : dépôt temporaire avec deux branches, conflit de suivi seul → commit ; conflit de code → code 2 (CA-4). Lint d'un fichier temporaire hors liste → erreur (CA-2).
- **End-to-end** — `apps/web/e2e/specs/p10/spec-1001.spec.ts`, `test('affiche le couplage du web @SPEC-1001')` : ouvrir la page, lire les trois régions, comparer aux valeurs de `progress/migration.json` (CA-5), vidéo conservée.
- **Visuel** — `test('démonstration de la piste conforme @SPEC-1001 @visual')` : jetons, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-003]`, `@SPEC-006`, `[SPEC-011]`, `pnpm lint` complet.

| Critère | Tests |
|---|---|
| CA-1 | unitaire workflow |
| CA-2 | unitaire frontière ; intégration lint |
| CA-3 | unitaire frontière |
| CA-4 | unitaire fusion ; intégration sync |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1001/` : rapports Vitest et Playwright, vidéo de la page, captures, sortie de `pnpm migration:report`, sortie d'un essai de lint en échec (CA-2), journal du test `sync-main` (CA-4), `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes de `docs/engineering/testing.md` §7, plus : la liste de référence est générée depuis l'état réel, la CI de `migration` est verte et aucun déploiement n'a été déclenché par la branche.

## 15. Décisions et hypothèses

ADR-1006 fixe la piste, la branche et la résolution du suivi ; ADR-1003 fixe la règle « le web est un client ». Hypothèse : les fichiers `apps/web/app/api/**` restent couverts par le motif global de la liste jusqu'à leur suppression (SPEC-1201). Aucune question ouverte.
