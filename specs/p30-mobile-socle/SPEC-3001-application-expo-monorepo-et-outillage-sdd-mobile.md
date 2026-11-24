---
id: SPEC-3001
title: Application Expo, intégration au monorepo et outillage SDD mobile
phase: P30
priority: mobile
depends_on: []
business_rules: [BR-PLA-03]
screens: []
adrs: [ADR-1004, ADR-1007, ADR-3001, ADR-3003, ADR-3004, ADR-3005]
visual: demo
---

# SPEC-3001 — Application Expo, intégration au monorepo et outillage SDD mobile

## 1. Objectif

Créer l'application `apps/mobile` (Expo, React Native, TypeScript strict) intégrée au monorepo
pnpm/Turborepo, et rendre la boucle SDD capable de valider une spécification mobile : tests
Jest, flux Maestro avec vidéo, comparaison visuelle et preuves, localement et en CI.

## 2. Contexte

Lire `docs/architecture/mobile/README.md` (canevas normatif), ADR-3001 (piste et branche), ADR-3004
(socle technique et méthode de test), ADR-3005 (paquets partagés), ADR-3003 §4 (comparaison
visuelle). `tools/sdd/validate.mjs` n'exécute aujourd'hui que Vitest (unit, intégration) et
Playwright (e2e, visuel) ; il échoue si `test:e2e` ne produit aucun test étiqueté. La maquette
`design/app-mobile/` sert de référence aux écrans suivants ; cette spécification ne livre qu'une
page de démonstration. Branche de base : `mobile` (ADR-3001).

## 3. Dépendances

- Aucune spécification préalable de la piste. Utilise les paquets existants `@learny/core`,
  `@learny/contracts`, `@learny/api-client`, `@learny/i18n`, `@learny/ui` (sous-chemin `tokens`).
- Outils : Expo SDK stable le plus récent (version consignée dans `docs/architecture/mobile/README.md`
  § 1 lors de l'installation), `jest-expo`, `@testing-library/react-native`, Maestro CLI ≥ 1.39,
  Android SDK avec émulateur API ≥ 35 (Pixel 9) ; Xcode et simulateur iPhone 16 Pro pour iOS (CI
  macOS). Sans émulateur disponible : `fail.mjs SPEC-3001 "émulateur indisponible" --external`
  après avoir livré tout le reste.

## 4. Règles métier couvertes

- BR-PLA-03 — Les fondations d'accessibilité sont posées : `testID`, rôles et libellés
  vérifiés par un utilitaire de test commun (`expectAccessible`) utilisé par toutes les
  spécifications suivantes ; respect de la réduction des animations (`AccessibilityInfo.isReduceMotionEnabled`).

## 5. Exigences fonctionnelles

- **EF-1** — `apps/mobile` démarre sur Android et iOS en build de développement
  (`pnpm --filter @learny/mobile start`, `expo run:android`, `expo run:ios`) et affiche l'écran
  `/_dev/sdd/SPEC-3001`.
- **EF-2** — La page `/_dev/sdd/SPEC-3001` (présente seulement si `EXPO_PUBLIC_ENABLE_SDD_PAGES=1`)
  affiche : titre « SPEC-3001 · socle mobile », version de l'application et du runtime, URL de
  l'API, horloge courante (`clock.now()` formatée en Europe/Paris, `13:20` en test), résultat de
  `GET /api/v1/health` (« API joignable » ou « API injoignable » avec le code d'erreur), plateforme.
- **EF-3** — Scripts racine : `dev:mobile`, `test:mobile` (Jest, rapport JSON au format Jest avec
  `--json --outputFile`), `test:e2e:mobile` (lanceur Maestro), `build:mobile:e2e` (build de test
  local). `pnpm lint` et `pnpm typecheck` couvrent `apps/mobile`.
- **EF-4** — `tools/sdd/validate.mjs`, pour une spécification de la piste `mobile` : exécute en
  plus `pnpm test:mobile` et compte les tests `[SPEC-3xxx]` réussis dans l'étape `unit` (Vitest +
  Jest) ; remplace l'étape `e2e` par `pnpm test:e2e:mobile --tags SPEC-3xxx` et l'étape `visual`
  par le décompte des flux `visual` réussis de cette campagne ; collecte vidéos et captures dans
  `evidence/SPEC-3xxx/`. Le comportement pour les autres pistes est inchangé (tests unitaires de
  `tools/sdd/test/unit` le prouvant).
- **EF-5** — `apps/mobile/e2e/run-maestro.mjs` : démarre ou vérifie l'émulateur (`MOBILE_PLATFORM`
  = `android` par défaut, `ios`), installe le build `e2e`, fige la barre d'état (canevas § 5),
  lance `maestro test --format junit` filtré par étiquette, écrit
  `test-results/sdd/<SPEC>/e2e-mobile.json` `{ passed, failed, videos, visual, flows[] }` et copie
  les vidéos `.mp4` et captures `.png`.
- **EF-6** — `apps/mobile/e2e/visual/compare.mjs <capture> <référence> --mask <zones>` :
  redimensionne la capture aux dimensions de la référence, masque les zones natives (barre
  d'état, barre d'onglets, barre de navigation système), calcule l'écart de pixels (pixelmatch,
  seuil couleur 0,1) et échoue au-delà de 12 % ; écrit l'image de différence.
- **EF-7** — CI : workflow `mobile.yml` déclenché sur la branche `mobile` et les branches
  `spec/SPEC-3*` : lint, typecheck, Vitest, Jest, build Android `e2e`, Maestro Android sur
  émulateur ; job iOS (macOS) manuel et aux checkpoints.

## 6. Exigences techniques

- **ET-1** — `apps/mobile/package.json` nommé `@learny/mobile`, `"private": true`, dépendances
  `workspace:*` vers les paquets partagés ; Expo Router comme point d'entrée ; nouvelle
  architecture activée ; TypeScript `strict`, `noUncheckedIndexedAccess` comme le reste du dépôt.
- **ET-2** — `metro.config.js` compatible pnpm (canevas § 6) ; un test Jest importe
  `@learny/core`, `@learny/contracts` et `@learny/i18n` pour prouver la résolution.
- **ET-3** — Règle ESLint d'ADR-1007 étendue : `apps/mobile` ne peut importer aucun paquet serveur
  (`db`, `services`, `jobs`, `llm`, `tutor`, `ingestion`, `automations`, `notifications`, `http`,
  `api-routes`) ni `next/*`, `react-dom`, `node:*`.
- **ET-4** — `src/lib/clock.ts` expose l'horloge de `@learny/core`, fixée si
  `EXPO_PUBLIC_CLOCK_FIXED_AT` est défini ; règle ESLint interdisant `Date.now()` et `new Date()`
  sans argument ailleurs dans `apps/mobile`.
- **ET-5** — `app.config.ts` lit `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_ENABLE_SDD_PAGES`,
  `EXPO_PUBLIC_CLOCK_FIXED_AT` ; valeurs validées par Zod au démarrage (écran d'erreur explicite
  si invalide) ; aucun secret serveur n'est lu.
- **ET-6** — Identifiants : `fr.learny.app` (iOS `bundleIdentifier`, Android `package`), schéma
  `learny`. `eas.json` avec profils `development`, `e2e`, `preview`, `production`.
- **ET-7** — Ajout dans `docs/architecture/python-backend/P23-plan.md`, étape 2 point 3, de la
  prise en compte du graphe d'imports de `apps/mobile` (ADR-3005), si ce n'est pas déjà fait.

## 7. Comportements attendus et cas limites

- **CL-1** — API injoignable au démarrage : la page de démonstration affiche « API injoignable »
  et `API_UNAVAILABLE` ou `NETWORK_ERROR`, sans plantage.
- **CL-2** — Variable `EXPO_PUBLIC_*` manquante : écran « Configuration invalide » listant les
  clés manquantes (jamais leur valeur).
- **CL-3** — Aucun flux Maestro ne porte l'étiquette demandée : l'étape `e2e` échoue avec le
  message « aucun flux SPEC-3xxx ».
- **CL-4** — Émulateur absent : `run-maestro.mjs` sort en code 2 avec « émulateur indisponible »
  et `validate.mjs` marque `e2e` en échec (pas de faux succès).
- **CL-5** — Réduction des animations activée : les transitions de la page utilisent la durée 0.

## 8. Instructions d'implémentation

1. `npx create-expo-app` (gabarit vide TypeScript) dans `apps/mobile`, puis aligner
   `package.json`, `tsconfig.json` (extension de `tsconfig.base.json`), ESLint et Prettier du dépôt.
2. Configurer Metro pour pnpm ; écrire le test de résolution des paquets partagés.
3. Installer Expo Router ; créer `app/_layout.tsx` (polices, thème minimal, fournisseur Query) et
   `app/_dev/sdd/SPEC-3001.tsx`.
4. Écrire `src/lib/clock.ts`, `src/config.ts` (Zod) et l'utilitaire `test/utils/expectAccessible.ts`.
5. Ajouter Jest (`jest-expo`) et RNTL ; scripts racine ; `turbo.json` (tâches `lint`,
   `typecheck`, `test:mobile`).
6. Écrire `e2e/run-maestro.mjs`, `e2e/visual/compare.mjs`, le flux
   `e2e/flows/SPEC-3001-demo.yaml` (tags `SPEC-3001`, `visual`).
7. Étendre `tools/sdd/validate.mjs` et `tools/sdd/lib.mjs` (`summarizeMaestro`), avec tests
   unitaires dans `tools/sdd/test/unit/validate-mobile.test.ts`.
8. Ajouter le workflow CI ; compléter le canevas (version Expo exacte) ; amender `P23-plan.md`.

Commits atomiques `feat|test|chore|docs(SPEC-3001): …`.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/**` (structure du canevas § 1), `apps/mobile/e2e/run-maestro.mjs`,
  `apps/mobile/e2e/visual/compare.mjs`, `apps/mobile/e2e/flows/SPEC-3001-demo.yaml`,
  `.github/workflows/mobile.yml`, `tools/sdd/test/unit/validate-mobile.test.ts`.
- **Modifiés** — `package.json` (scripts), `pnpm-workspace.yaml` si nécessaire, `turbo.json`,
  `eslint.config.mjs`, `tools/sdd/validate.mjs`, `tools/sdd/lib.mjs`, `vitest.config.ts` (projets
  incluant `apps/mobile/src/**/*.test.ts` et `apps/mobile/test/integration`),
  `docs/architecture/mobile/README.md`, `docs/architecture/python-backend/P23-plan.md`.
- **Lus** — `packages/core`, `packages/api-client`, `packages/ui/src/tokens`, `design/app-mobile/`.
- **Intouchables** — `apps/web`, `apps/api`, `design/maquettes/`, `design/app-mobile/`.

## 10. Interface et conformité visuelle

Mode `demo` : la page `/_dev/sdd/SPEC-3001` (fond crème `#F4F4F1`, titre Space Grotesk, cartes
blanches rayon 22) affiche les informations d'EF-2 avec `testID` `sdd-title`, `sdd-version`,
`sdd-api-url`, `sdd-clock`, `sdd-health`, `sdd-platform`. Le flux visuel capture la page et la
compare à une ligne de base générée et versionnée dans `apps/mobile/e2e/visual/baselines/`
(seule exception à la référence maquette, la page n'étant pas maquettée). Les contrôles de jetons
vérifient fond, encre et police.

## 11. Critères d'acceptation

- **CA-1** — L'application démarre sur l'émulateur Android et affiche la page de démonstration
  avec l'horloge à 13:20 et « API joignable » contre l'API locale.
- **CA-2** — `pnpm lint`, `pnpm typecheck`, `pnpm test:mobile` et `pnpm test:unit` passent et
  couvrent `apps/mobile` ; un import interdit (paquet serveur, `Date.now()`) fait échouer le lint.
- **CA-3** — `node tools/sdd/validate.mjs SPEC-3001` exécute Jest et Maestro, produit une vidéo et
  une comparaison visuelle dans `evidence/SPEC-3001/`, et une spécification d'une autre piste est
  validée exactement comme avant (tests de `tools/sdd`).
- **CA-4** — `compare.mjs` échoue sur une image modifiée de plus de 12 % et réussit sur une image
  identique à zones natives différentes.
- **CA-5** — Le workflow CI mobile est vert sur la branche de la spécification.

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3001]` : `apps/mobile/src/config.test.ts` (validation des
  variables), `apps/mobile/src/lib/clock.test.ts` (horloge figée), `tools/sdd/test/unit/validate-mobile.test.ts`
  (sélection des commandes par piste, `summarizeMaestro`), `apps/mobile/e2e/visual/compare.test.ts`
  (seuil, masques). Jest `[SPEC-3001]` : `apps/mobile/test/dev-sdd-page.test.tsx` (rendu, états
  joignable/injoignable, accessibilité). Couvre CA-2, CA-3, CA-4.
- **Intégration** — Vitest `[SPEC-3001]` `apps/mobile/test/integration/health.int.test.ts` :
  instance `api-client` du mobile contre l'API locale, `/health` 200. Couvre CA-1.
- **End-to-end** — Maestro `@SPEC-3001` `apps/mobile/e2e/flows/SPEC-3001-demo.yaml` (vidéo) :
  lancement, attente de `sdd-health`, assertion « API joignable » et « 13:20 ». Couvre CA-1, CA-3.
- **Visuel** — `@SPEC-3001 @visual` : capture de la page, comparaison à la ligne de base, seuil
  12 %. Couvre CA-3, CA-4.
- **Non-régression** — suite `tools/sdd/test/unit` complète ; `pnpm lint` et `typecheck` du web.
  CA-5 est prouvé par le lien du run CI.

| Critère | Tests |
|---|---|
| CA-1 | health.int, SPEC-3001-demo.yaml |
| CA-2 | config.test, clock.test, lint |
| CA-3 | validate-mobile.test, SPEC-3001-demo.yaml |
| CA-4 | compare.test, flux visuel |
| CA-5 | run CI `mobile.yml` |

## 13. Preuves attendues

Dans `evidence/SPEC-3001/` : `acceptance.md`, rapports Vitest et Jest, rapport JUnit Maestro,
vidéo du flux, capture et image de différence, journal de `validate.mjs`, lien du run CI. Chaque
preuve indique date, plateforme, version de l'émulateur, commande et commit.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) adaptée par ADR-3004 : lint, typecheck,
build `e2e`, tests `[SPEC-3001]` (Vitest et Jest), intégration, flux Maestro `@SPEC-3001` avec
vidéo, un flux `@visual`, tous les CA prouvés, aucune régression du web ni de l'outillage. Puis
`node tools/sdd/complete.mjs SPEC-3001`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-1004, ADR-1007, ADR-3001, ADR-3003, ADR-3004, ADR-3005.
- La page de démonstration a une ligne de base propre (pas de maquette) ; c'est la seule.
- Hypothèse : la CI GitHub dispose de runners Linux avec accélération KVM pour l'émulateur ; sinon
  le job Android tourne sur macOS.
