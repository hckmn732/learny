---
id: SPEC-004
title: Socle de tests complet et collecte des preuves
phase: P0
priority: V1
depends_on: [SPEC-001, SPEC-003]
business_rules: []
screens: []
adrs: [ADR-0047, ADR-0048, ADR-0050, ADR-0070]
visual: demo
---

# SPEC-004 — Socle de tests complet et collecte des preuves

## 1. Objectif

Compléter le harnais minimal de SPEC-001 pour que chaque spécification puisse produire des preuves vérifiables, répétables et visuellement comparables. Fournir `@learny/testing`, la configuration Playwright desktop/mobile et les helpers de comparaison ; relier leurs résultats à `tools/sdd/validate.mjs` et `evidence.mjs`.

## 2. Contexte

Lire `docs/engineering/testing.md` intégralement, `docs/engineering/conventions.md` §1–§4, `docs/architecture/overview.md` §3, `tools/sdd/validate.mjs`, `tools/sdd/evidence.mjs`, `apps/web/playwright.config.ts`, ADR-0047, ADR-0048, ADR-0050 et ADR-0070. SPEC-001 installe Vitest/Playwright et un premier test filmé ; SPEC-003 rend les commandes de validation accessibles. SPEC-005 créera les références de maquettes ; cette spécification fournit leur lecteur et leur comparateur sans présumer de leur existence au moment du test de SPEC-004.

## 3. Dépendances

- **SPEC-001** : monorepo, horloge `@learny/core`, projet Vitest `unit` et `integration`, Chromium et page de démonstration.
- **SPEC-003** : exécution et collecte par les commandes SDD ; `evidence.mjs` reste propriétaire de l'arborescence de preuve.
- **Bibliothèques** : `@axe-core/playwright`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `msw`, `pixelmatch`, `pngjs`, `@vitest/coverage-v8` de même version que Vitest. Verrouiller les versions dans `pnpm-lock.yaml` ; aucun service réel ni fournisseur IA n'est appelé en test.
- **Navigateur** : Chromium obligatoire. Firefox/WebKit sont installés pour le projet `cross-browser` des checkpoints ; si le téléchargement est inaccessible, consigner le blocage externe pour cette capacité sans déclarer les tests concernés réussis.

## 4. Règles métier couvertes

Aucune règle produit `BR-*`. Le socle applique les exigences transverses de tests déterministes, preuves et conformité visuelle des ADR-0047, ADR-0048, ADR-0050 et ADR-0070.

## 5. Exigences fonctionnelles

- **EF-1** — `@learny/testing` exporte `createFixedClock(iso?)` ; sans argument, l'instant est `2026-11-11T12:20:00Z`. Les fixtures navigateur fixent la même heure côté page via `page.clock.setFixedTime` et côté serveur via `CLOCK_FIXED_AT`. Le fuseau d'affichage reste `Europe/Paris`.
- **EF-2** — Chaque test Playwright reçoit une base de données isolée et réinitialisée par le harnais prévu dans `docs/engineering/testing.md` §3 ; les tests de composants utilisent une fabrique de rendu, MSW et des réponses déterministes. Les fixtures IA n'activent que `LLM_MODE=mock` ; une suite CI échoue si le mode est `live`.
- **EF-3** — Playwright produit simultanément JSON, JUnit et HTML, traces, captures et vidéos pour chaque test `@SPEC-xxx`. Les projets `desktop` (1440×900) et `mobile` (390×844) utilisent `fr-FR`, `Europe/Paris` ; `cross-browser` ajoute Firefox et WebKit aux checkpoints sans ralentir la validation locale filtrée d'une spécification.
- **EF-4** — `expectTokens(page, selectors)` compare les styles calculés des éléments désignés avec les jetons exportés par `@learny/ui` lorsqu'ils existent. Pour SPEC-004, les jetons provisoires de SPEC-001 servent au test de démonstration ; SPEC-301 les remplacera par le design system sans changer l'API du helper.
- **EF-5** — `compareWithReference(actual, reference, outputDir)` produit image côte à côte, diff et métriques : dimensions, nombre et ratio de pixels différents. Une référence manquante échoue explicitement pour le mode `mockup`; les modes `tokens` et `demo` n'appellent pas ce comparateur. Le seuil de conformité structurelle est ≤ 12 % ; la ligne de base de non-régression `toHaveScreenshot` est ≤ 1 % (ADR-0034 et `testing.md` §6).
- **EF-6** — `tools/sdd/evidence.mjs` copie uniquement les rapports et pièces jointes réellement produits, écrit les empreintes SHA-256 des vidéos et prépare `acceptance.md` avec les CA extraits de la spécification. Git LFS présent : vidéos suivies ; absent : vidéos exclues de Git selon ADR-0050, empreinte conservée. Aucune preuve manquante n'est présentée comme acquise.
- **EF-7** — Les seuils de couverture sont contrôlés aux checkpoints : `learning-engine`, `bricks`, `core`, `llm/budget` ≥ 80 % de lignes ; `services` ≥ 70 %. Le rapport `coverage` indique la couverture par paquet et échoue si l'un de ces seuils n'est pas atteint à partir du checkpoint où le paquet existe.
- **EF-8** — Une page de démonstration `/_dev/sdd/SPEC-004` montre l'instant fixé, les projets navigateur, un exemple de jeton conforme, un écart de référence volontaire illustré et la liste des artefacts attendus. Elle ne prétend jamais afficher un rapport qui n'existe pas.

## 6. Exigences techniques

- **ET-1** — `packages/testing/src/clock.ts` fournit `createFixedClock(iso = '2026-11-11T12:20:00Z'): Clock`, valide l'ISO et retourne toujours un nouvel objet `Date` pour éviter qu'un appelant ne déplace l'horloge partagée. Ne pas appeler `Date.now()` directement dans le paquet.
- **ET-2** — `packages/testing/src/playwright.ts` étend `test` avec `fixedTime`, `consoleErrors`, `axeCheck` et `captureEvidence`. La fixture serveur exige `CLOCK_FIXED_AT`, `LLM_MODE=mock` et `TZ=UTC` ; elle refuse une incohérence entre heure serveur et heure page.
- **ET-3** — `packages/testing/src/visual.ts` expose `expectTokens` et `compareWithReference`. Utiliser `pngjs` pour décoder, `pixelmatch` avec dimensions strictement égales ; le résultat typé contient `diffPixels`, `totalPixels`, `ratio`, `sideBySidePath`, `diffPath`. Ne jamais redimensionner silencieusement une capture, car cela masquerait une erreur de viewport.
- **ET-4** — `apps/web/playwright.config.ts` reprend exactement les paramètres du §4 de `docs/engineering/testing.md`, dont `video: 'on'`, `trace: 'on'`, `screenshot: 'on'`, `fullyParallel: false`, `workers: 1`, `retries: 0` pour les validations déterministes. Le reporter JSON respecte `PLAYWRIGHT_JSON_OUTPUT_FILE` et `PLAYWRIGHT_JSON_OUTPUT_NAME` fournis par `validate.mjs`.
- **ET-5** — Le projet Vitest `unit` prend les tests voisins du code ; `integration` prend `test/integration/` avec base Supabase locale. `--outputFile.json` reste compatible avec l'analyseur de `validate.mjs` ; `pnpm test:unit --coverage` émet `coverage/coverage-summary.json`.
- **ET-6** — Les captures jointes à un test ont des noms stables ; le collecteur conserve leur type et les sépare dans `screenshots/` et `visual/`. Le fichier `checks.json` porte les statuts réels des étapes, pas un résultat recalculé à partir du seul code de sortie global.

## 7. Comportements attendus et cas limites

- **CL-1** — ISO invalide pour `createFixedClock` : erreur explicite ; aucune date du jour système en repli.
- **CL-2** — Capture et référence de dimensions différentes : comparaison en échec avec les deux tailles, sans redimensionnement.
- **CL-3** — Capture identique à la référence : ratio 0 ; un pixel différent est compté une seule fois.
- **CL-4** — Référence absente en mode `mockup` : test visuel en échec ; en mode `demo`, seules structure, jetons et capture de non-régression sont exigés.
- **CL-5** — IA réelle configurée accidentellement en CI : démarrage des tests refusé avant tout appel réseau.
- **CL-6** — Vidéo Playwright absente malgré un test e2e vert : `validate.mjs` conserve `e2e=failed` ; pas de `complete`.
- **CL-7** — Git LFS absent : empreinte SHA-256 et exclusion locale des `.webm` enregistrées, sans supprimer les vidéos du disque.
- **CL-8** — Projet `cross-browser` échoue : checkpoint en échec ; les résultats Chromium d'une spécification ne deviennent pas automatiquement rouges si elle n'exige pas ce projet.

## 8. Instructions d'implémentation

1. Créer le paquet `@learny/testing` (manifest, exports, TS strict, README) et ses fabriques d'horloge ; installer les dépendances listées en section 3. Commit `build(SPEC-004): installe le paquet de tests`.
2. Compléter les projets Vitest et les fixtures MSW ; ajouter un test qui vérifie `LLM_MODE=mock` et l'horloge identique côté serveur/navigateur. Commit `test(SPEC-004): fixe le temps et les services simulés`.
3. Compléter `playwright.config.ts`, les projets et reporters ; fournir la fixture `test` et les helpers axe, captures, jetons, diff. Commit `feat(SPEC-004): ajoute les comparaisons visuelles et l'accessibilité`.
4. Intégrer les pièces jointes à `evidence.mjs` ; vérifier les deux branches Git LFS présent/absent sur dépôt temporaire ; documenter le schéma de sortie. Commit `feat(SPEC-004): collecte les preuves réelles`.
5. Ajouter la page de démonstration, les tests unitaires, d'intégration, e2e et visuels ; créer la ligne de base du seul écran de démonstration. Commit `test(SPEC-004): vérifie le harnais complet`.
6. Valider, renseigner `acceptance.md` à partir des fichiers produits et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/testing/package.json`, `packages/testing/tsconfig.json`, `packages/testing/README.md`, `packages/testing/src/index.ts`, `packages/testing/src/clock.ts`, `packages/testing/src/clock.test.ts`, `packages/testing/src/playwright.ts`, `packages/testing/src/visual.ts`, `packages/testing/src/visual.test.ts`, `packages/testing/src/msw.ts`, `packages/testing/test/integration/evidence.test.ts`, `apps/web/components/sdd-demos/spec-004.tsx`, `apps/web/e2e/specs/p0/spec-004.spec.ts`.
- **Modifiés** : `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `apps/web/playwright.config.ts`, `tools/sdd/evidence.mjs`, `tools/sdd/validate.mjs` si un contrôle obligatoire manque, `apps/web/app/%5Fdev/sdd/registry.ts` et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `packages/core/src/clock.ts`, `docs/engineering/testing.md`, `specs/catalog.json`, configuration Playwright et tests SPEC-001.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-004` affiche `h1` « Socle de tests et preuves », puis « Horloge de test » avec `2026-11-11 13:20 Europe/Paris`, « Navigateurs » avec desktop 1440 × 900 et mobile 390 × 844, « Contrôle des jetons » avec un composant conforme, « Comparaison visuelle » avec une image de référence factice et un diff étiqueté comme exemple, puis « Artefacts » listant rapports, vidéo et captures. `data-testid` : `spec-004-clock`, `spec-004-projects`, `spec-004-tokens`, `spec-004-diff`, `spec-004-artifacts`. L'exemple de diff reste statique et ne se confond pas avec une preuve d'acceptation.

Vérifier l'ordre des régions, les contrastes et les jetons, une capture desktop/mobile par `toHaveScreenshot('spec-004-demo.png', { maxDiffPixelRatio: 0.01 })`, et axe sans violation `serious` ou `critical`.

## 11. Critères d'acceptation

- **CA-1** — L'horloge figée donne exactement `2026-11-11T12:20:00Z` en unitaire, serveur et navigateur ; aucune requête IA réelle n'est faite en test.
- **CA-2** — Les projets desktop/mobile produisent JSON, JUnit, vidéo, trace et capture ; `validate.mjs` détecte au moins un test `@SPEC-004 @visual` et refuse une vidéo absente.
- **CA-3** — Une comparaison identique renvoie 0 % de différence, une comparaison altérée produit un diff et le ratio mesuré, une taille différente échoue.
- **CA-4** — Le collecteur copie les artefacts existants et enregistre l'empreinte SHA-256 d'une vidéo ; il ne crée aucune vidéo fictive.
- **CA-5** — La page de démonstration expose les cinq régions prescrites, passe axe et les captures de non-régression desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/testing/src/clock.test.ts`, `describe('[SPEC-004] fixed clock')` : valeur par défaut, ISO explicite, ISO invalide, deux retours `Date` indépendants (CA-1). `packages/testing/src/visual.test.ts`, `describe('[SPEC-004] visual comparison')` : PNG égaux, pixel modifié, dimensions différentes, absence de référence (CA-3).
- **Intégration** — `packages/testing/test/integration/evidence.test.ts`, `describe('[SPEC-004] evidence')` : lancer Playwright avec heure fixe sur page de démonstration, lire ses rapports, collecter dans un dossier temporaire, vérifier empreinte SHA-256, noms et absence de pièce jointe inventée ; simuler vidéo absente et vérifier l'échec de validation (CA-1, CA-2, CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-004.spec.ts`, `test('inspecte le socle de tests @SPEC-004')` : ouvrir la page, vérifier heure/projets/artefacts, lancer axe ; conserver sa vidéo et ses pièces jointes (CA-2, CA-5).
- **Visuel** — `test('démonstration de tests conforme @SPEC-004 @visual')` : `expectTokens`, ordre des cinq régions, captures desktop/mobile à 1 % maximum (CA-3, CA-5).
- **Non-régression** — `[SPEC-001]`, `[SPEC-003]`, `@SPEC-001`, `@SPEC-003`.

| Critère | Tests |
|---|---|
| CA-1 | `clock.test.ts` ; `evidence.test.ts` |
| CA-2 | `evidence.test.ts` ; e2e `@SPEC-004` |
| CA-3 | `visual.test.ts` ; `@visual` |
| CA-4 | `evidence.test.ts` |
| CA-5 | e2e `@SPEC-004 @visual` |

## 13. Preuves attendues

`evidence/SPEC-004/` : `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, vidéo réelle, captures desktop/mobile et `acceptance.md` coché avec les chemins des tests. Le rapport d'intégration enregistre les ratios réels mesurés des PNG de test et l'empreinte de la vidéo. Aucune capture de maquette n'est exigée avant SPEC-005.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 sont vérifiées. La suite complète de SPEC-001 reste verte, les pièces jointes sont retrouvables depuis le JSON Playwright, et les comparaisons échouent sur une référence absente ou incompatible. Les seuils de couverture des paquets futurs sont configurés sans prétendre les mesurer avant leur existence.

## 15. Décisions et hypothèses

ADR-0047 fixe l'instant, ADR-0048 le mode IA simulé, ADR-0050 les vidéos et ADR-0070 les outils de test. ADR-0034 et `testing.md` §6 fixent les seuils visuels. Les références de maquette arrivent avec SPEC-005 ; l'outil de comparaison est testé sur de petits PNG déterministes créés par le test, sans les présenter comme des preuves produit. ADR créé pendant l'implémentation : **ADR-0224** (projets Playwright, gardes IA et horloge, `expectScreenshotBaseline`, collecte des pièces jointes réelles, base de données reportée à SPEC-101).
