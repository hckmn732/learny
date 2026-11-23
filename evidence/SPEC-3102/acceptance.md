# SPEC-3102 — Coquille, onglets natifs, compte et centre de notifications

- **Branche** : `spec/SPEC-3102-coquille-onglets-natifs-et-notifications` (base `81e96653`)
- **Plateforme de validation** : émulateur Android 15 / API 35 (ADR-3004 § 6) ; iOS non exécutable
  ici (pas de macOS).
- **Décisions et écarts** : § 15 de la spécification (ET-1 : `Tabs` d'Expo Router derrière
  `AppTabs`).

## Critères d'acceptation

| Critère | Preuve |
|---|---|
| CA-1 ✅ Cinq onglets, libellés exacts, une pile par onglet, appui sur l'onglet actif → racine | `test/shell/tabs.test.tsx` (6 tests : libellés, rôles, état sélectionné, cible 48 dp, sélection, `POP_TO_TOP` sur l'onglet actif) ; `src/navigation/tabs.test.ts` (configuration) ; flux Maestro `SPEC-3102-navigation` |
| CA-2 ✅ Pastille 3 pour Alex Perrin, ouverture = lecture + destination de la table, « Tout marquer comme lu » vide la pastille | `src/features/notifications/destinations.test.ts` (seize types) ; `test/integration/notifications.int.test.ts` (liste, filtre, lecture idempotente, tout lire) ; `test/notifications/notifications-sheet.test.tsx` ; flux `SPEC-3102-notifications` |
| CA-3 ✅ Un compte sans onboarding terminé ne voit que l'écran de garde | `test/shell/onboarding-gate.test.tsx` (garde : redirection, coquille libérée, attente, erreur, « Continuer sur le web », « J'ai terminé ») |
| CA-4 ✅ « Apprenant · 3 formations en cours » ; déconnexion confirmée → connexion | `test/shell/account-sheet.test.tsx` (sous-titre, lignes, confirmation, annulation) ; flux `SPEC-3102-compte` |
| CA-5 ✅ Hors ligne : bandeau affiché, feuille notifications sur le cache, lectures désactivées | `test/shell/common-states.test.tsx` (bandeau), `test/notifications/notifications-sheet.test.tsx` (cache + « Disponible une fois en ligne ») — Maestro 2.12.1 ne coupe pas la radio (précédent SPEC-3003), voir § 15 |
| CA-6 ✅ Feuille notifications et en-tête conformes à la maquette (écart ≤ 12 %) | flux `@visual` `SPEC-3102-navigation` : zone haute de `android-02-aujourdhui.png`, `e2e/visual/masks/spec-3102-navigation.json` (contenu reporté à SPEC-3201) ; comparaison dans `test-results/sdd/SPEC-3102/e2e-mobile.json` |

## Livré

- `app/(app)/_layout.tsx` : `AppTabs`, garde d'onboarding, bandeau hors ligne, liens profonds.
- `app/(app)/{aujourdhui,programme,reviser,agenda,profil}/` : une pile (`TabStack`) et l'écran
  racine de chaque onglet ; Aujourd'hui avec l'en-tête natif (cloche, pastille, compte).
- `app/notifications.tsx`, `app/compte.tsx` (feuilles modales), `app/terminer-sur-le-web.tsx`.
- `src/navigation/{tabs,AppTabs,AppTabBar,TabStack,use-deep-links}`.
- `src/features/shell/{AppHeader,TodayScreen,PlaceholderTabScreen,AccountSheet,OnboardingGuard,
  OnboardingGateScreen,RouteSheet,AppErrorScreen,use-shell}`.
- `src/features/notifications/{destinations,group-by-day,use-notifications,NotificationsView,
  NotificationsSheet}` ; `src/lib/{web,web-browser,deep-links}` ; `src/lib/dates.ts` (jour long et
  jour court en français).
- Libellés mobiles dans `packages/i18n/src/fr/mobile.ts` (espaces `shell` et `notifications`) ; les
  libellés identiques au web sont importés de `fr.shell` (ADR-3002 § 4).
- Tests : 6 fichiers Vitest `[SPEC-3102]` (27 tests), 5 fichiers Jest `[SPEC-3102]` (32 tests),
  1 fichier d'intégration (4 tests), 3 flux Maestro + le masque du flux visuel.

## Non livré / limites

- iOS : aucun simulateur sur cette plateforme ; la comparaison visuelle porte sur l'export Android.
- Flux Maestro « hors ligne » : impossible (radio non pilotable par Maestro 2.12.1) ; CA-5 est
  prouvé par Jest.
- Les écrans « cours » et « quiz » (SPEC-3202/3203) n'existent pas encore : la table des
  destinations ouvre la page web de la ligne pour ces deux types (ADR-3002 § 3).

## Reproductibilité

```sh
cd /root/learny-mobile
export ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk
export ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64
pnpm dev:up && pnpm db:seed:demo
pnpm build:mobile:e2e                      # APK e2e (x86_64)
pnpm test:e2e:mobile --tags SPEC-3102      # campagne Maestro + vidéo + comparaison
node tools/sdd/validate.mjs SPEC-3102 --skip-build
```

## Pré-existants (hors périmètre, non réparés)

- `packages/config/src/commit-rules.test.ts`, `apps/web/test/unit/bundle-split.test.ts`,
  `tools/migration/test/unit/report.test.ts` (décision du porteur, SPEC-3001).
- `pnpm build` du web échoue hors périmètre (`/_global-error`, `useContext`) : `--skip-build`.
