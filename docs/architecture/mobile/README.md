# Application mobile Learny (piste `mobile`)

Canevas technique **normatif** de la piste mobile (ADR-3001 à ADR-3008). Avant toute
spécification `SPEC-3xxx`, lire ce fichier en entier, puis la spécification, puis la maquette
`design/app-mobile/` (ouvrir `index.html` dans Chrome ou Edge ; `view.html#screen=<id>&platform=ios|android`
pour un écran seul).

Priorité : ADR > `docs/product/business-rules.md` > spécification > maquette mobile (lue avec les
corrections d'ADR-3003) > ce canevas > autres documents.

## 0. Versions installées par SPEC-3001 (2026-11-22)

Expo **SDK 58** — `expo ~58.0.26`, React Native **0.88.1**, React **19.3.0**, Expo Router
**58.0.32**, `expo-constants ~58.0.16`, `expo-font ~58.0.12`, `expo-linking ~58.0.17`,
`expo-status-bar ~58.0.5`, `expo-system-ui ~58.0.7`, `react-native-screens ~4.30.1`,
`react-native-safe-area-context ~5.11.1`, Jest **30.5.2** et `jest-expo ~58.0.15`,
`@testing-library/react-native` **14.1.0** (rendu asynchrone). Nouvelle architecture et Hermes sont
les seuls modes de React Native 0.88 : aucune option `newArchEnabled` ni `jsEngine` n'existe plus
dans `app.config.ts` (ADR-3012).

Commandes : `pnpm dev:mobile`, `pnpm test:mobile` (Jest), `pnpm test:e2e:mobile --tags SPEC-3xxx`
(Maestro), `pnpm build:mobile:e2e` (APK de test local).

## 1. Périmètre et architecture

- Une application `apps/mobile` (Expo, React Native, TypeScript strict) pour Android et iOS,
  **client pur** de l'API `/api/v1` (Bearer, ADR-1005, ADR-3008). Aucune logique métier serveur
  n'est dupliquée : le mobile affiche, saisit, met en cache et rejoue ; le serveur décide.
- Périmètre V1 « compagnon » : ADR-3002. Tout le reste ouvre le web (« Continuer sur le web »).
- Paquets partagés importés (ADR-1007, ADR-3005) : `@learny/core` (horloge, erreurs),
  `@learny/contracts` (types et schémas Zod des DTO), `@learny/api-client`, `@learny/domain`,
  `@learny/learning-engine` (indirectement), `@learny/i18n`, `@learny/ui/tokens`, `@learny/bricks`
  (types et charges publiques uniquement). **Aucun** paquet serveur.

```
apps/mobile/
├─ app.config.ts            configuration Expo (variables EXPO_PUBLIC_*, schéma learny, liens universels)
├─ eas.json                 profils development / preview / production / e2e
├─ app/                     routes Expo Router (fichiers en français, comme le web, ADR-0046)
│  ├─ _layout.tsx           fournisseurs (Query, session, thème), polices, garde d'authentification
│  ├─ (auth)/connexion.tsx, inscription.tsx, verifier-email.tsx, auth/callback.tsx
│  ├─ (app)/_layout.tsx     AppTabs : aujourdhui, programme, reviser, agenda, profil
│  ├─ (app)/aujourdhui/…  (app)/programme/…  (app)/reviser/…  (app)/agenda/…  (app)/profil/…
│  ├─ cours/[courseId].tsx  quiz/[attemptId].tsx  quiz/[attemptId]/resultat.tsx
│  ├─ tuteur.tsx            feuille (formSheet)
│  ├─ notifications.tsx     feuille
│  └─ _dev/                 galerie et pages de démonstration SDD (builds de test seulement)
├─ src/
│  ├─ theme/                jetons → thème RN (couleurs, typo iOS/Android, rayons, espacements, ombres)
│  ├─ ui/                   composants natifs (Button, Card, Chip, StatCard, Segmented, Switch, ListRow,
│  │                        ProgressBar, Sheet, Toast, EmptyState, ErrorState, Skeleton, Icon…)
│  ├─ api/                  instance api-client, fetch, en-têtes, erreurs → messages
│  ├─ auth/                 client Supabase, stockage sécurisé, session
│  ├─ data/                 hooks TanStack Query par domaine (useHome, useProgramme, useAgenda…)
│  ├─ offline/              persistance, file des réponses, synchronisation
│  ├─ bricks/               rendus natifs des briques (registre par type)
│  ├─ features/<domaine>/   composants d'écran (aujourdhui, programme, cours, tuteur, quiz, reviser…)
│  └─ lib/                  horloge, formatage des dates (fuseau utilisateur), liens web
├─ assets/fonts, assets/images
├─ e2e/flows/*.yaml         flux Maestro (étiquettes SPEC-3xxx, visual)
├─ e2e/visual/compare.mjs   comparaison visuelle (ADR-3003 §4)
└─ test/                    Jest (composants) ; Vitest pour la logique pure (*.test.ts hors JSX)
```

## 2. Règles d'écriture (contraignantes)

**Autorisé** : composants fonctionnels ; hooks TanStack Query par domaine ; `StyleSheet.create`
avec valeurs du thème ; fichiers `.ios.tsx` / `.android.tsx` pour un contrôle dont la maquette
montre deux formes (ADR-3004 §5) ; `Platform.select` pour une valeur ; Reanimated pour toute
animation ; `testID` stables `kebab-case` sur tout élément vérifié par un test.

**Interdit** : logique métier serveur (calcul de score, de planning, FSRS hors `@learny/domain`) ;
`Date.now()` / `new Date()` hors de `src/lib/clock.ts` (horloge `@learny/core`) ; couleur, taille
ou rayon en dur hors du thème ; texte visible en dur hors de `@learny/i18n` ; état global
(Redux, Zustand, contexte de données) ; bibliothèque UI tierce ; WebView pour un écran entier ;
`console.log` en production ; stockage d'un jeton hors de `src/auth/secure-storage.ts`.

**Textes** : français uniquement (BR-ACC-06). Libellés identiques au web importés de
`@learny/i18n` ; libellés propres au mobile dans `packages/i18n/src/fr/mobile.ts` (espace
`mobile`), ajoutés par la spécification qui les utilise. Ton vous/tu selon le profil
(BR-ACC-05) via les helpers existants de `@learny/i18n`.

**Dates** : toujours affichées dans le fuseau de l'utilisateur (`/me`, BR-ACC-07), jamais celui
de l'appareil.

## 3. Plateformes et chrome

| Élément | iOS (HIG) | Android (Material 3) |
|---|---|---|
| Onglets | onglets natifs (UITabBar), 5 entrées | barre de navigation native, pastille active |
| En-tête | grand titre 34 pt, sur-titre | top app bar, headline 31 sp, sur-titre en capitales |
| Feuille | `formSheet`, poignée, hauteurs `[0.5, 0.92]` | bottom sheet native, rayon 28 dp, poignée |
| Action de création | bouton dans l'en-tête | FAB 56 dp (Programme) |
| Contrôle segmenté | segmented control | segmented buttons |
| Cible minimale | 44 × 44 pt | 48 × 48 dp |
| Retour | chevron + balayage du bord | retour système et geste prédictif |

Typographie : Space Grotesk (titres, chiffres) et Inter (texte) ; échelles de
`design/app-mobile/README.md` § Choix de conception. Taille de texte système respectée
(`allowFontScaling`), plafonnée à `maxFontSizeMultiplier = 1.6` pour les titres et
illimitée pour le texte courant ; aucune troncature d'information à 200 %.

## 4. Données, cache et hors ligne

- Une clé de requête par route : `['home']`, `['formation', fid, 'programme']`,
  `['agenda', from, to, formation]`… définies dans `src/data/keys.ts`.
- `staleTime` 30 s par défaut ; rafraîchissement au retour au premier plan (`AppState`) et au
  retour du réseau (`@react-native-community/netinfo` via `onlineManager`).
- Cache persisté (MMKV chiffrée, ADR-3004) pour la lecture hors ligne des écrans déjà vus ;
  purge à la déconnexion. Le paquet hors ligne du jour (`GET /offline/pack`) et la file des
  réponses (`POST /sync/offline-answers`) sont gérés par `src/offline/` (SPEC-3305).
- Mutations : `Idempotency-Key` (UUID v4 généré une fois par intention et conservé jusqu'au
  succès) sur toute création, comme exigé par l'API.
- Erreurs `problem+json` → `AppError` (`@learny/api-client`) → message français par `code`
  (catalogue `@learny/i18n`) ; `401` géré par la session (ADR-3008) ; `429` → toast avec délai
  `Retry-After` ; réseau absent → bandeau « Hors ligne » et données en cache.

## 5. Tests et preuves (ADR-3004 §6)

| Niveau | Outil | Emplacement | Étiquette |
|---|---|---|---|
| Logique pure | Vitest (`pnpm test:unit`) | `apps/mobile/src/**/*.test.ts` | `[SPEC-3xxx]` dans `describe` |
| Composants, écrans | Jest + RNTL (`pnpm test:mobile`) | `apps/mobile/test/**/*.test.tsx` | `[SPEC-3xxx]` dans `describe` |
| Intégration | Vitest (`pnpm test:int`) | `apps/mobile/test/integration/*.int.test.ts` | `[SPEC-3xxx]` |
| Bout en bout + vidéo | Maestro (`pnpm test:e2e:mobile`) | `apps/mobile/e2e/flows/SPEC-3xxx-*.yaml` | tag `SPEC-3xxx` (écrit `@SPEC-3xxx`) |
| Visuel | Maestro + `compare.mjs` | flux avec tag `visual` (écrit `@visual`) | `@SPEC-3xxx @visual` |

- Environnement e2e : tout sur la **VM de développement**, émulateur Android local compris
  (ADR-3018). `pnpm dev:up`, `pnpm db:reset && pnpm db:seed:demo`, API locale avec
  `LLM_MODE=mock` et `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` ; émulateur `learny` démarré par
  `bash tools/dev/emulator-up.sh` (Pixel 6, API 35, démarrage à froid) ; build `e2e` de
  l'application (`EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`,
  `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`,
  `EXPO_PUBLIC_CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, animations coupées) ; compte de
  démonstration d'Alex Perrin (SPEC-115).
- Campagne : `pnpm test:e2e:mobile --tags SPEC-3xxx` pilote l'appareil **local** ; le préflight
  vérifie disque ≥ 4 Go, `adb devices`, `sys.boot_completed`, API 200 et Supabase 200. Plus de
  transport distant, plus d'agent ni de port public (ADR-3018) : `MOBILE_DEVICE_AGENT_URL` n'est
  plus lu. Le build e2e autorise le HTTP en clair vers `10.0.2.2` (plugin
  `plugins/with-e2e-cleartext.cjs`, activé par `LEARNY_E2E_CLEARTEXT=1`) et rejoue `expo prebuild`
  à chaque build ; les builds EAS restent en HTTPS.
- Lecture des ADR : ADR-3004 § 6 fixe les **niveaux** de test et reste valide ; l'exécution décrite
  ici est locale à la VM de développement depuis ADR-3018, qui remplace le volet transport
  d'ADR-3012 et le contrat asynchrone d'ADR-3015 § 1 (l'historique de ces ADR n'est pas réécrit).
- Barre d'état figée : Android `adb shell settings put global sysui_demo_allowed 1` puis mode démo
  (horloge 1320) ; iOS `xcrun simctl status_bar booted override --time 13:20`.
- Comparaison visuelle : ADR-3003 §4 (zones natives masquées, écart ≤ 12 %, contrôles
  structurels et jetons). Références `design/app-mobile/exports/screens/` et `exports/states/`.
- Accessibilité : chaque test d'écran vérifie `accessibilityRole`, `accessibilityLabel` des
  icônes seules et les cibles minimales (`hitSlop` compris) ; audit lecteur d'écran en SPEC-3502.
- Preuves dans `evidence/SPEC-3xxx/` : rapports Vitest/Jest, vidéos Maestro, captures et
  comparaisons, `acceptance.md`.

## 6. Publication (SPEC-3502, ADR-3004 § 8, ADR-3006)

| Étape | Commande | Prérequis |
|---|---|---|
| Configuration | `app.config.ts` (identifiants, liens universels, permissions, `ios.privacyManifests`), `eas.json` (profils `development`, `e2e`, `preview`, `production`) | — |
| Build de production | `eas build --profile production --platform all` | projet EAS lié (`eas init`), comptes Apple Developer et Google Play, secrets de signature |
| Soumission test interne | `eas submit --profile production --platform android` (piste `internal`) et `--platform ios` (`ascAppId` fourni par le porteur) | identifiants des consoles |
| Fiches | `apps/mobile/store/` : textes FR générés depuis `store/metadata.ts`, icône 1024², captures Android 1080 × 2160 | captures iOS : macOS requis |
| Licences affichées | `node --experimental-strip-types apps/mobile/scripts/generate-licenses.mjs` puis écran Profil → À propos | — |
| Manifeste de confidentialité | produit par `expo prebuild` depuis `ios.privacyManifests` (`PrivacyInfo.xcprivacy`) | macOS pour compiler iOS |
| EAS Update | canal `production` déclaré, **aucun update publié** en V1 (`expo-updates` n'est pas une dépendance) | ADR pour ajouter le client |

- Le profil `production` ne pose **aucune** variable de démonstration : `extra.enableSddPages` y vaut
  `false`, le plugin du HTTP local (`with-e2e-cleartext.cjs`) reste inactif sans `LEARNY_E2E_CLEARTEXT`,
  et `test/integration/release-config.int.test.ts` vérifie cette absence.
- Les numéros de build sont gérés par EAS (`cli.appVersionSource = "remote"`, `autoIncrement`).
- Ce qui n'est pas prouvable dans cet environnement (pas de compte Apple/Google/EAS, pas de macOS)
  est consigné dans `evidence/SPEC-3502/acceptance.md` : builds signés, TestFlight, Play test
  interne, captures et manifeste iOS compilé.

## 7. Pièges connus

- **pnpm et Metro** : configurer `metro.config.js` (`watchFolders` sur la racine,
  `resolver.unstable_enableSymlinks`, `disableHierarchicalLookup` si nécessaire) ; vérifier que
  les paquets partagés sont transpilés depuis leurs sources TypeScript.
- **Flux SSE** : le `fetch` global de React Native ne fournit pas `response.body` en flux ;
  utiliser `fetch` de `expo/fetch` (injection dans `@learny/api-client`).
- **SecureStore** : ~2 Ko par valeur ; d'où MMKV chiffrée (ADR-3008).
- **Émulateur Android** : il tourne sur la même VM que l'API (ADR-3018) ; `10.0.2.2` y désigne la
  VM de développement elle-même, c'est-à-dire `localhost` de l'hôte de l'émulateur. Un seul
  émulateur à la fois, toujours en démarrage à froid (`tools/dev/emulator-up.sh` /
  `emulator-down.sh`).
- **Horloge** : les composants de date (calendriers) lisent `clock.now()` ; jamais l'heure système.
