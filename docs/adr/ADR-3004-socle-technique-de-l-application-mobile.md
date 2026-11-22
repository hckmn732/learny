# ADR-3004 — Socle technique de l'application mobile

- **Statut** : Acceptée — précise ADR-1004
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0047, ADR-0048, ADR-1004, ADR-1005, ADR-1007, ADR-3003, SPEC-3001, SPEC-3002, SPEC-3003

## Contexte

ADR-1004 fixe React Native + Expo, Expo Router et le Bearer Supabase, sans arrêter les
bibliothèques, l'organisation du code, ni la façon de tester et de prouver une spécification
mobile dans la boucle SDD (Vitest et Playwright aujourd'hui). La maquette exige deux grammaires
natives (HIG et Material 3) sur une base de code unique.

## Décision

1. **Base** : `apps/mobile`, Expo SDK stable le plus récent au démarrage de SPEC-3001 (version
   exacte consignée dans `apps/mobile/package.json` et dans `docs/architecture/mobile/README.md`),
   nouvelle architecture, Hermes, TypeScript strict, builds de développement (`expo-dev-client`) ;
   Expo Go n'est pas une cible.
2. **Navigation** : Expo Router, routes typées. Les cinq destinations utilisent les **onglets
   natifs** d'Expo Router (UITabBar sur iOS, barre de navigation Material sur Android) ; une pile
   par onglet ; cours, quiz et quiz global sont des écrans empilés au-dessus des onglets ; le
   tuteur et les fiches sont des feuilles natives (`presentation: 'formSheet'` avec hauteurs
   d'arrêt). Si l'API des onglets natifs est encore marquée expérimentale, elle est utilisée
   derrière un composant unique `AppTabs` remplaçable par `Tabs` (JS) sans toucher aux écrans.
3. **Données** : `@learny/api-client` avec `fetch` injecté depuis `expo/fetch` (corps en flux pour
   le SSE du tuteur) ; TanStack Query ; cache persistant et file hors ligne dans
   `react-native-mmkv` (instance chiffrée, clé dans `expo-secure-store`).
4. **Interface** : `StyleSheet` et un thème construit depuis `@learny/ui/tokens` ; polices Inter et
   Space Grotesk embarquées (`expo-font`, fichiers dans `apps/mobile/assets/fonts`) ;
   `react-native-svg` pour les icônes (portées depuis `design/app-mobile/assets/icons.js`) ;
   Reanimated et Gesture Handler pour les animations et gestes ; `expo-haptics`.
   **Interdits** : NativeWind/Tailwind, bibliothèques de composants (Paper, Tamagui, gluestack…),
   gestionnaire d'état global (Redux, Zustand) : l'état serveur est dans TanStack Query, l'état
   d'écran dans les composants.
5. **Variantes de plateforme** : un composant n'a de fichiers `.ios.tsx` / `.android.tsx` que si
   la maquette montre un contrôle différent (segmented control, interrupteur, ligne de liste,
   bouton d'action flottant, en-tête) ; la logique reste dans un fichier commun.
6. **Tests et preuves** :
   - logique pure et client d'API : Vitest (projet `unit`), étiquette `[SPEC-3xxx]` ;
   - composants et écrans : Jest (`jest-expo`) + React Native Testing Library, commande
     `pnpm test:mobile`, étiquette `[SPEC-3xxx]` dans le `describe`, rapport JSON au format Jest ;
   - intégration : Vitest (projet `integration`), client d'API contre l'API locale seedée
     (`pnpm db:seed:demo`, `LLM_MODE=mock`, `CLOCK_FIXED_AT`), sérialisée par le verrou de base ;
   - bout en bout : **Maestro**, flux YAML sous `apps/mobile/e2e/flows/`, étiquette Maestro
     `SPEC-3xxx` (notée `@SPEC-3xxx` dans les spécifications), enregistrement vidéo
     (`startRecording`/`stopRecording`), commande `pnpm test:e2e:mobile` ;
   - visuel : flux étiquetés `visual` qui capturent l'écran, comparé par
     `apps/mobile/e2e/visual/compare.mjs` selon ADR-3003 §4.
   `tools/sdd/validate.mjs` exécute ces commandes pour toute spécification de la piste `mobile`
   (SPEC-3001). Plateforme par défaut de la validation : Android (émulateur Pixel 9, API 35 ou
   supérieure) ; iOS (simulateur iPhone 16 Pro) est exécuté dans la CI macOS et aux checkpoints.
7. **Déterminisme** : horloge injectable de `@learny/core` fixée par
   `EXPO_PUBLIC_CLOCK_FIXED_AT=2026-11-11T12:20:00Z` dans les builds de test (ADR-0047), IA
   simulée côté API (ADR-0048), animations désactivées en test, barre d'état en mode démo
   (13:20, réseau et batterie pleins).
8. **Livraison** : EAS Build et EAS Submit ; EAS Update avec `runtimeVersion` calculée par
   empreinte ; canaux `development`, `preview`, `production`.

## Conséquences

- Toute bibliothèque supplémentaire exige un ADR de la piste mobile.
- Une machine sans émulateur Android ni simulateur iOS ne peut pas valider une spécification
  mobile : `fail.mjs SPEC-3xxx "raison" --external` (aucune preuve inventée).
