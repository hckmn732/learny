---
id: SPEC-908
title: Version 2.0.0
phase: P9
priority: V2
depends_on: [SPEC-901, SPEC-902, SPEC-903, SPEC-904, SPEC-905, SPEC-906, SPEC-907]
business_rules: []
screens: []
adrs: [ADR-0051]
visual: demo
---

# SPEC-908 — Version 2.0.0

## 1. Objectif

Préparer la livraison vérifiable de la V2 : un parcours de bout en bout qui enchaîne les sept fonctions V2, la non-régression complète V1 + V2, un `CHANGELOG.md` fidèle aux spécifications terminées et un rapport de préparation. Le tag `v2.0.0` est créé par le checkpoint CP-9 après sa réussite, jamais par cette spécification.

## 2. Contexte

Lire `docs/engineering/sdd-process.md` §1–§3, `docs/engineering/git.md`, `docs/engineering/testing.md` §5–§7, `specs/checkpoints.md` CP-8 et CP-9, ADR-0051 (versionnement, tags), ADR-0074 (fonctions V2 livrées en P9), ADR-0073 (tarifs IA à revérifier), ADR-0205 (limites audio/vidéo), puis SPEC-807 (parcours V1 et non-régression globale) et SPEC-808 (préparation V1, preflight, smoke), dont cette spécification reprend les outils. Les fonctions V2 sont : import audio (SPEC-901) et vidéo (SPEC-902) avec transcription, liens entre ressources et modules (SPEC-903), « Explique à un débutant » (SPEC-904), mises en situation (SPEC-905), projet fil rouge (SPEC-906), détection fine de la baisse d'engagement (SPEC-907).

## 3. Dépendances

- **SPEC-901 à SPEC-907** : fonctions V2 `done`, chacune avec ses tests `[SPEC-90x]`, `@SPEC-90x` et ses preuves.
- **SPEC-807** (transitive, V1) : suite e2e V1 complète, cross-browser, sécurité, accessibilité, performances ; script `pnpm test:regression`.
- **SPEC-808** (transitive, V1) : `tools/release/preflight.mjs`, `tools/release/smoke.mjs`, `docs/operations/release-v1.md`, procédure de déploiement SPEC-013.
- **Outillage SDD** : `tools/sdd/checkpoint.mjs` (seul propriétaire des tags `cp-9` et `v2.0.0`), `tools/sdd/changelog.mjs`, `tools/sdd/audit.mjs`.
- **Externe** : en local et en CI, `LLM_MODE=mock`, `STRIPE_MODE=mock`, `EMAIL_MODE=memory` ; transcription audio/vidéo simulée par fixtures. Un déploiement de production V2 suit les prérequis externes de SPEC-808 ; s'ils manquent, blocage consigné par `fail.mjs --external`, sans invention.

## 4. Règles métier couvertes

Aucune règle propre (catalogue : `business_rules: []`). La spécification vérifie que les règles V2 déjà couvertes par SPEC-901 à SPEC-907 (dont BR-AUT-14 pour SPEC-907 et BR-PRA-07 pour SPEC-906) restent satisfaites dans un parcours combiné, et que toutes les règles V1 restent vertes (contrôle de traçabilité de `tools/sdd/audit.mjs`).

## 5. Exigences fonctionnelles

- **EF-1** — Parcours V2 de bout en bout, `apps/web/e2e/specs/p9/spec-908-parcours-v2.spec.ts`, avec l'apprenante de démonstration « Alex Perrin » (SPEC-115) : créer une formation avec objectifs `project` et `dialogue` ; importer une note audio (fixture de 2 minutes) et une vidéo (fixture de 3 minutes) ; vérifier la transcription horodatée et les liens détectés entre ressources et modules ; lancer « Explique à un débutant » sur une notion ; réaliser une mise en situation ; soumettre la première étape du projet fil rouge ; simuler 14 jours de réponses rapides et séances courtes et accepter la pause proposée ; ouvrir le bilan. Chaque étape est filmée et vérifiée par assertions.
- **EF-2** — Non-régression : `pnpm test:regression` exécute toutes les suites unitaires, d'intégration, e2e (Chromium, Firefox, WebKit, mobile), visuelles, accessibilité, sécurité et performances de V1 et V2 ; un seul échec bloque la spécification. Le rapport liste, pour chaque spécification `done`, ses étiquettes rejouées et leur résultat.
- **EF-3** — Aucune fonction V2 ne modifie un comportement V1 hors de ce que ses spécifications décrivent : les références visuelles V1 (`design/references/`) sont rejouées sans mise à jour ; une différence > 1 % bloque, sauf si elle est justifiée par une spécification V2 et documentée dans le rapport.
- **EF-4** — `CHANGELOG.md` reçoit une section `## [2.0.0] — <date du checkpoint>` générée par `tools/sdd/changelog.mjs` à partir des spécifications P9 `done` et des commits depuis `v1.0.0` ; rubriques « Ajouts », « Modifications », « Corrections ». Une fonction dont la spécification n'est pas `done` n'y figure pas.
- **EF-5** — `docs/operations/release-v2.md` reprend la checklist de SPEC-808 (états `non vérifié`, `réussi`, `échec`, `bloqué externe`) en ajoutant les éléments V2 : service de transcription et sa région (UE ou avertissement hors UE selon BR-IA-04), limites audio/vidéo d'ADR-0205, coûts IA des nouvelles tâches revérifiés (ADR-0073), migrations V2 et leur empreinte. Aucun item n'est coché par défaut.
- **EF-6** — `pnpm release:preflight --target v2` et, si l'environnement est disponible, `pnpm release:smoke --target v2` exécutent les contrôles V1 plus les contrôles V2 (transcription simulée en preview, job de détection de liens, automatisme `engagement` enregistré). Sans prérequis externes, la spécification conserve les rapports dry-run et consigne le blocage ; elle ne publie rien.
- **EF-7** — La spécification ne crée, ne déplace ni ne supprime aucun tag ; CP-9, après SPEC-908 `done`, exécute ses contrôles (`specs/checkpoints.md` CP-9) et crée `cp-9` et `v2.0.0` sur `main` (ADR-0051).
- **EF-8** — Page `/_dev/sdd/SPEC-908` « Préparation V2 » : commit, liste des sept fonctions V2 avec statut et lien vers leurs preuves, résumé de la non-régression (suites, total, échecs), état du preflight V2 et des tags (`v1.0.0` présent, `v2.0.0` attendu après CP-9).

## 6. Exigences techniques

- **ET-1** — `tools/release/preflight.mjs` et `smoke.mjs` acceptent `--target v1|v2` (défaut `v1`, comportement V1 inchangé) ; les contrôles V2 sont dans `tools/release/checks/v2.mjs`. Les sorties restent expurgées : aucune valeur secrète, seulement noms, présence, régions et versions.
- **ET-2** — `tools/release/regression-report.mjs` agrège les rapports JUnit/JSON de Vitest et Playwright en `evidence/SPEC-908/regression.json` : `{ spec, tags: string[], unit, integration, e2e, visual, status }[]` pour les 132 spécifications ; le statut global est `failed` si une entrée l'est.
- **ET-3** — Le parcours V2 utilise uniquement `LLM_MODE=mock` (fixtures nommées `v2-journey-*`) et l'horloge figée au 2026-11-11T12:20:00Z, avancée explicitement pour les 14 jours de SPEC-907 ; il est déterministe sur trois exécutions consécutives (contrôlé en CI).
- **ET-4** — `tools/sdd/changelog.mjs` lit `progress/state.json` et `specs/catalog.json` ; il refuse d'écrire une entrée pour une spécification non `done` et n'écrase pas la section `1.0.0`.
- **ET-5** — Les performances d'ADR-0041 sont remesurées par `pnpm test:perf` sur les écrans touchés par la V2 (module avec ressources audio/vidéo, projet, accueil avec proposition d'engagement) ; un dépassement de budget bloque.
- **ET-6** — L'audit `node tools/sdd/audit.mjs` doit renvoyer 0 erreur avant validation (toutes les règles `BR-*`, y compris V2, sont couvertes).

## 7. Comportements attendus et cas limites

- **CL-1** — Une suite V1 échoue après l'intégration V2 : la spécification reste `in_progress`, correction sur `fix/<SPEC>-<slug>`, relance complète ; jamais de test affaibli.
- **CL-2** — Référence visuelle V1 changée par une fonction V2 (ex. nouveau bouton dans Module) : la différence est attribuée à sa spécification V2 dans le rapport ; une différence non attribuée bloque.
- **CL-3** — Service de transcription réel indisponible : parcours et tests en mock verts ; item live `bloqué externe` ; pas de déploiement présenté comme fait.
- **CL-4** — Tag `v2.0.0` déjà présent localement : la spécification échoue en signalant l'anomalie ; aucun tag n'est déplacé (ADR-0051).
- **CL-5** — `CHANGELOG.md` modifié à la main depuis `v1.0.0` : le générateur conserve le texte existant et ajoute la section `2.0.0` au-dessus.
- **CL-6** — Pas de `origin` : travail et preuves locaux, aucun remote créé ou modifié.
- **CL-7** — Parcours instable (résultat différent sur une des trois exécutions) : échec, cause recherchée (horloge, ordre, fixture) avant revalidation.

## 8. Instructions d'implémentation

1. Écrire le parcours V2 e2e et ses fixtures mock ; le faire passer trois fois de suite. Commit `test(SPEC-908): parcours V2 de bout en bout`.
2. Ajouter `regression-report.mjs`, l'option `--target v2` et `checks/v2.mjs`, avec tests. Commit `feat(SPEC-908): contrôles de préparation V2`.
3. Écrire `docs/operations/release-v2.md` (tout à `non vérifié`). Commit `docs(SPEC-908): checklist de publication V2`.
4. Générer la section `2.0.0` du `CHANGELOG.md`. Commit `docs(SPEC-908): notes de version 2.0.0`.
5. Page SDD, tests e2e et visuel. Commit `test(SPEC-908): démontre la préparation V2`.
6. Lancer `pnpm test:regression`, l'audit et le preflight ; consigner les blocages externes ; `validate.mjs` puis `complete.mjs`. CP-9 crée ensuite les tags.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/e2e/specs/p9/spec-908-parcours-v2.spec.ts`, `apps/web/e2e/specs/p9/spec-908.spec.ts`, `packages/llm/fixtures/v2-journey-*.json`, `tools/release/checks/v2.mjs`, `tools/release/regression-report.mjs`, `tools/release/test/unit/v2-checks.test.ts`, `tools/release/test/integration/regression-report.test.ts`, `docs/operations/release-v2.md`, `apps/web/components/sdd-demos/spec-908.tsx`.
- **Modifiés** : `tools/release/{preflight,smoke}.mjs` (option `--target`), `tools/sdd/changelog.mjs` (garde `done`), `CHANGELOG.md`, `package.json` (`test:regression` inclut V2), registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : preuves SPEC-807/808 et SPEC-901 à SPEC-907, `tools/sdd/checkpoint.mjs`, `specs/checkpoints.md`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-908`, `h1` « SPEC-908 — Version 2.0.0 ». Régions :
1. « Fonctions V2 » (`spec-908-features`) : sept lignes (identifiant, titre, statut, lien « Preuves »).
2. « Non-régression » (`spec-908-regression`) : total de spécifications rejouées, réussies, échouées ; lien vers `regression.json`.
3. « Préparation » (`spec-908-preflight`) : catégories de la checklist V2 avec `non vérifié`, `réussi`, `échec` ou `bloqué externe`.
4. « Tags » (`spec-908-tags`) : `v1.0.0` et `v2.0.0` (« attendu après CP-9 » tant qu'absent).
Sans rapport, tout est « non vérifié ». Aucune valeur secrète dans le DOM. Contrôles : `expectTokens`, ordre, axe, `toHaveScreenshot('spec-908-demo.png', { maxDiffPixelRatio: 0.01 })` à 1440×900 et 390×844 avec un rapport simulé marqué comme tel.

## 11. Critères d'acceptation

- **CA-1** — Le parcours V2 enchaîne les sept fonctions avec IA simulée, passe trois fois de suite et est filmé.
- **CA-2** — `pnpm test:regression` est vert pour les 132 spécifications V1 + V2 en cross-browser ; aucune référence visuelle V1 ne diffère de plus de 1 % sans attribution documentée.
- **CA-3** — `CHANGELOG.md` contient une section `2.0.0` limitée aux spécifications `done`, sans altérer la section `1.0.0`.
- **CA-4** — La checklist V2 et le preflight `--target v2` couvrent transcription, limites, coûts IA et migrations sans imprimer de secret ; un prérequis externe absent est `bloqué externe`.
- **CA-5** — Aucun tag n'est créé ou déplacé par la spécification ; l'audit renvoie 0 erreur.
- **CA-6** — La page SDD affiche statuts réels ou « non vérifié », passe axe, captures desktop/mobile ≤ 1 % et vidéo.

## 12. Plan de tests

- **Unitaires** — `tools/release/test/unit/v2-checks.test.ts`, `describe('[SPEC-908] contrôles V2')` : région de transcription, limites ADR-0205, tarif non revérifié bloquant, expurgation, refus si tag `v2.0.0` existe (CA-4, CA-5).
- **Intégration** — `tools/release/test/integration/regression-report.test.ts`, `describe('[SPEC-908] rapport de non-régression')` : agrégation de rapports factices, statut global, attribution des écarts visuels ; génération du changelog depuis un état SDD de test, refus d'une spec non `done` (CA-2, CA-3).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-908-parcours-v2.spec.ts`, `test('parcours V2 complet @SPEC-908')` : scénario d'EF-1, vidéo (CA-1). `apps/web/e2e/specs/p9/spec-908.spec.ts`, `test('inspecte la préparation V2 @SPEC-908')` : régions, statuts, absence de secret (CA-6).
- **Visuel** — `test('préparation V2 conforme @SPEC-908 @visual')` : jetons, structure, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — toutes les étiquettes `[SPEC-xxx]` et `@SPEC-xxx` de SPEC-001 à SPEC-907 via `pnpm test:regression`, plus `pnpm test:perf` (CA-2).

| Critère | Tests |
|---|---|
| CA-1 | e2e parcours V2 (3 exécutions) |
| CA-2 | `test:regression` ; intégration rapport |
| CA-3 | intégration changelog |
| CA-4 | unitaires contrôles V2 ; preflight |
| CA-5 | unitaires tag ; audit |
| CA-6 | e2e page SDD et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-908/` : vidéo du parcours V2, `regression.json` et rapports Vitest/Playwright, rapport de performances, preflight V2 expurgé, checklist `release-v2.md`, extrait `CHANGELOG.md`, sortie d'audit, captures desktop/mobile, `checks.json`, `acceptance.md`. Les éléments live absents sont marqués absents ; aucune URL, région ou mesure n'est inventée.

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7, non-régression V1 + V2 complète et audit sans erreur. SPEC-908 prépare la livraison ; CP-9 vérifie ses critères (`specs/checkpoints.md`) puis crée `cp-9` et `v2.0.0`. Tant que CP-9 n'a pas réussi, la V2 n'est pas présentée comme publiée.

## 15. Décisions et hypothèses

- ADR-0051 : branches, fusions, tags posés uniquement par le checkpoint. ADR-0074 : fonctions V2 livrées en P9. ADR-0073 : tarifs IA revérifiés avant publication. ADR-0205 : limites audio/vidéo contrôlées par la checklist.
- Réutilisation des outils de SPEC-808 par une option `--target v2` plutôt que des scripts dupliqués ; le comportement V1 par défaut est inchangé.
- Hypothèse : la publication V2 en production dépend des mêmes comptes externes que la V1 plus le service de transcription ; leur absence est un blocage externe documenté, pas un échec de la spécification en local.
