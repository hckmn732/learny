# `@learny/mobile` — application mobile Learny

Application Android et iOS en React Native + Expo, client pur de l'API `/api/v1`
(`docs/architecture/mobile/README.md`, ADR-3001, ADR-3004).

- **Expo SDK 58** (`expo ~58.0.26`), **React Native 0.88.1**, React 19.3, nouvelle architecture,
  Hermes, TypeScript strict, Expo Router.
- Identifiants : `fr.learny.app` (Android `package`, iOS `bundleIdentifier`), schéma `learny`.

## Démarrage

```sh
pnpm install
cp apps/mobile/e2e/e2e.env.example apps/mobile/e2e/e2e.env   # puis renseigner les valeurs
pnpm dev:mobile                       # expo start --dev-client
pnpm --filter @learny/mobile android  # expo run:android
pnpm --filter @learny/mobile ios      # expo run:ios (macOS)
```

Les six variables `EXPO_PUBLIC_*` sont obligatoires et validées par Zod dans `src/config.ts` : une
valeur absente ou mal formée affiche l'écran « Configuration invalide » (les clés fautives, jamais
leur valeur). `EXPO_PUBLIC_ENABLE_SDD_PAGES=1` ouvre les pages de démonstration SDD.

## Tests

| Niveau       | Commande                                             | Emplacement                            |
| ------------ | ---------------------------------------------------- | -------------------------------------- |
| Logique pure | `pnpm test:unit` (Vitest)                            | `src/**/*.test.ts`, `e2e/**/*.test.ts` |
| Composants   | `pnpm test:mobile` (Jest `jest-expo/android` + RNTL) | `test/**/*.test.tsx`                   |
| Intégration  | `pnpm test:int` (Vitest, API locale)                 | `test/integration/*.int.test.ts`       |
| Bout en bout | `pnpm test:e2e:mobile --tags SPEC-3001` (Maestro)    | `e2e/flows/*.yaml`                     |
| Visuel       | flux étiquetés `visual` + `e2e/visual/compare.mjs`   | `e2e/visual/baselines/`                |

## Campagne e2e sur l'émulateur

1. `pnpm build:mobile:e2e` construit l'APK `e2e` (`android/app/build/outputs/apk/release/`).
2. `pnpm test:e2e:mobile --tags SPEC-3001` installe l'APK, fige la barre d'état, lance Maestro,
   copie vidéo et captures dans `test-results/sdd/SPEC-3001/`, compare l'écran à sa ligne de base
   et écrit `e2e-mobile.json`.
3. Sans émulateur, le lanceur sort en **code 2** (« émulateur indisponible ») : aucun faux succès.

Quand l'émulateur vit sur une autre machine, y lancer `node apps/mobile/e2e/device-agent.mjs` et
renseigner `MOBILE_DEVICE_AGENT_URL` (ADR-3012) ; le transport est alors distant, le contrat
identique.

## Règles

- Aucune couleur, taille ou rayon en dur : tout vient de `src/theme` et de `@learny/ui/tokens`.
- Aucune lecture de l'heure hors de `src/lib/clock.ts` (`Date.now()` est refusé par ESLint).
- Aucun paquet serveur, `next/*`, `react-dom` ni `node:*` (ESLint, ADR-1007).
- Textes visibles en français via `@learny/i18n` (espace `mobile`).
