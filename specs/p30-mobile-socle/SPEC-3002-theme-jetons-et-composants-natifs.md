---
id: SPEC-3002
title: Thème, jetons et composants natifs iOS et Android
phase: P30
priority: mobile
depends_on: [SPEC-3001]
business_rules: [BR-PLA-02, BR-PLA-03]
screens: []
adrs: [ADR-3003, ADR-3004, ADR-0131]
visual: demo
---

# SPEC-3002 — Thème, jetons et composants natifs iOS et Android

## 1. Objectif

Livrer le thème de l'application (couleurs, typographies iOS et Android, rayons, espacements,
ombres, mouvements) dérivé de `@learny/ui/tokens`, les polices embarquées, le jeu d'icônes et la
bibliothèque de composants natifs utilisés par tous les écrans, avec une galerie de
démonstration dans l'application.

## 2. Contexte

Références : `design/app-mobile/assets/app.css` (jetons, composants des deux plateformes),
`design/app-mobile/assets/icons.js` (icônes à trait 1,8 px), `design/app-mobile/README.md`
§ Choix de conception et § Apports de la référence Figma (échelles, rayons, cibles),
`design/app-mobile/index.html` § Jetons et § Typographie, `packages/ui/src/tokens/*` (source des
valeurs), canevas `docs/architecture/mobile/README.md` § 2 et § 3, ADR-3004 §4–5 (interdits et
variantes de plateforme). Le web a une galerie `/_dev/ui` (ADR-0131) ; le mobile en reprend le
principe.

## 3. Dépendances

- **SPEC-3001** : application, Jest, Maestro, comparaison visuelle.
- Bibliothèques : `expo-font`, `react-native-svg`, `react-native-reanimated`,
  `react-native-gesture-handler`, `expo-haptics`, `react-native-safe-area-context`.
- Polices Inter (400, 500, 600, 700) et Space Grotesk (500, 600, 700), licence OFL, fichiers
  `.ttf` versionnés dans `apps/mobile/assets/fonts/`.

## 4. Règles métier couvertes

- BR-PLA-02 — Cibles tactiles minimales : 44 × 44 pt (iOS) et 48 × 48 dp (Android) imposées par
  les composants interactifs (taille ou `hitSlop`), vérifiées en test.
- BR-PLA-03 — Contrastes AA vérifiés par test sur toutes les paires texte/fond du thème
  (réutilisation de `packages/ui/src/tokens/contrast`), rôles et libellés d'accessibilité
  fournis par chaque composant, réduction des animations respectée.

## 5. Exigences fonctionnelles

- **EF-1** — `src/theme/` exporte `theme` : couleurs (crème `#F4F4F1`, encre `#111113`, citron
  `#C6F432`, indigo `#5B5BD6`, orange `#F97316`, vert `#0F9F7F`, gris et bordures de `tokens`),
  typographie par plateforme (iOS : titre large 34 pt, titre de section 20, corps 16, libellé 12 ;
  Android : headline 31 sp, titre 20, corps 16, libellé 11 en capitales), rayons (carte 22,
  option 20, feuille Android 28, bouton pilule), espacements, ombres, durées de mouvement.
- **EF-2** — Composants (`src/ui/`), chacun avec `testID` transmis et props typées :
  `Text` (variantes typographiques), `Button` (citron, encre, contour, texte ; tailles ;
  chargement ; désactivé), `IconButton`, `Card` (blanche, encre), `Chip` (neutre, citron, indigo,
  vert « Validé », orange), `StatCard`, `ProgressBar` (linéaire, segments), `Segmented`
  (`.ios.tsx` segmented control, `.android.tsx` segmented buttons), `Switch` (natif par
  plateforme), `ListRow` (`.ios.tsx` liste insérée à chevron, `.android.tsx` icône et en-tête de
  groupe), `Sheet` (feuille de contenu non routée, utilisée par les fiches), `Toast`,
  `Banner` (hors ligne, information), `EmptyState`, `ErrorState` (bouton « Réessayer »),
  `Skeleton`, `Avatar` (initiales sur indigo), `Badge` (pastille de compteur), `Fab`
  (`.android.tsx` uniquement), `LargeTitleHeader` (sur-titre et titre, deux plateformes),
  `Icon` (jeu complet porté de `icons.js`).
- **EF-3** — La galerie `/_dev/ui` (builds de test) présente chaque composant dans tous ses états
  (pressé, sélectionné, désactivé, chargement, erreur) avec un sélecteur de plateforme simulée
  désactivé (la plateforme réelle s'applique) et une section « Jetons » (pastilles et échelles).
- **EF-4** — Retours haptiques légers à la sélection (`Segmented`, options de réponse) et à la
  confirmation (`Button` principal) ; ils suivent le réglage système de l'appareil, sans réglage
  propre à l'application.

## 6. Exigences techniques

- **ET-1** — Aucune valeur de couleur, taille ou rayon hors de `src/theme/` (règle ESLint
  `no-restricted-syntax` sur les littéraux `#` et sur `fontSize` numérique dans `src/features` et
  `app/`).
- **ET-2** — `src/theme/tokens.ts` importe les valeurs de `@learny/ui/tokens` ; un test vérifie
  l'égalité avec `design/references/tokens.json` pour les couleurs de marque.
- **ET-3** — Les polices sont chargées avant l'affichage (`SplashScreen.preventAutoHideAsync`
  jusqu'au chargement) ; repli système si le chargement échoue, sans blocage.
- **ET-4** — Animations Reanimated exécutées sur le thread UI ; durée ramenée à 0 si
  `AccessibilityInfo.isReduceMotionEnabled()`.
- **ET-5** — Texte : `allowFontScaling` actif ; `maxFontSizeMultiplier` 1,6 pour les titres
  (canevas § 3) ; les composants s'étirent verticalement sans tronquer à 200 %.
- **ET-6** — Accessibilité : `Button` → rôle `button`, `Switch` → `switch` avec `accessibilityState.checked`,
  `Segmented` → `tablist`/`tab` avec état sélectionné, `ProgressBar` → `progressbar` avec
  `accessibilityValue`, `IconButton` exige `accessibilityLabel` (type obligatoire).

## 7. Comportements attendus et cas limites

- **CL-1** — Texte système à 200 % : boutons et cartes s'agrandissent, aucun texte coupé ni
  chevauchement (test de rendu avec multiplicateur simulé).
- **CL-2** — Double appui rapide sur `Button` : une seule invocation de `onPress` pendant
  l'état chargement.
- **CL-3** — Libellé long dans `Chip` ou `Segmented` : retour à la ligne contrôlé, jamais de
  débordement.
- **CL-4** — `IconButton` sans `accessibilityLabel` : erreur de typage à la compilation.
- **CL-5** — Mode sombre système : l'application reste claire (`userInterfaceStyle: light`) ; le
  mode sombre est hors périmètre (maquette, § Ce qui n'est pas couvert).

## 8. Instructions d'implémentation

1. Ajouter les polices et les charger dans `app/_layout.tsx`.
2. Écrire `src/theme/` (tokens, typographie par `Platform.select`, ombres iOS/élévation Android).
3. Porter `icons.js` en composants SVG (`src/ui/icons/`), un composant `Icon name=…` typé.
4. Écrire les composants dans l'ordre : Text, Button, IconButton, Card, Chip, StatCard,
   ProgressBar, Segmented, Switch, ListRow, Sheet, Toast, Banner, EmptyState, ErrorState,
   Skeleton, Avatar, Badge, Fab, LargeTitleHeader ; un test par composant.
5. Écrire la galerie `/_dev/ui` et le flux Maestro.
6. Ajouter les règles ESLint d'ET-1.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/theme/*`, `apps/mobile/src/ui/**`, `apps/mobile/app/_dev/ui.tsx`,
  `apps/mobile/assets/fonts/*`, `apps/mobile/test/ui/*.test.tsx`,
  `apps/mobile/e2e/flows/SPEC-3002-galerie.yaml`.
- **Modifiés** — `apps/mobile/app/_layout.tsx`, `eslint.config.mjs` (règles mobiles).
- **Lus** — `packages/ui/src/tokens/*`, `design/app-mobile/assets/app.css`, `design/app-mobile/assets/icons.js`.

## 10. Interface et conformité visuelle

Mode `demo` : galerie `/_dev/ui`, sections « Jetons », « Boutons », « Cartes et puces »,
« Contrôles », « Listes », « Feuilles et retours », « États ». Le flux visuel capture trois
sections sur Android et iOS et les compare aux lignes de base versionnées
(`apps/mobile/e2e/visual/baselines/SPEC-3002-*.png`) ; un contrôle des jetons lit les styles
calculés (couleur de fond du bouton citron `#C6F432`, rayon des cartes 22) dans les tests Jest.
Les composants doivent être visuellement conformes aux éléments équivalents de
`design/app-mobile/exports/screens/` (revue des captures jointe aux preuves).

## 11. Critères d'acceptation

- **CA-1** — Tous les composants d'EF-2 existent, sont rendus dans la galerie et ont au moins un
  test Jest de rendu, d'état et d'accessibilité.
- **CA-2** — Toutes les paires texte/fond du thème respectent un contraste ≥ 4,5:1 (≥ 3:1 pour
  le texte large), test vert.
- **CA-3** — Les composants interactifs offrent une cible ≥ 44 pt (iOS) / 48 dp (Android).
- **CA-4** — Les captures de la galerie respectent les lignes de base (écart ≤ 12 %) sur Android.
- **CA-5** — Un littéral de couleur dans `src/features` fait échouer le lint.

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3002]` `apps/mobile/src/theme/theme.test.ts` (valeurs vs
  `tokens.json`, contrastes). Jest `[SPEC-3002]` `apps/mobile/test/ui/*.test.tsx` (un fichier par
  composant : rendu, variantes, double appui, rôle, état, cible minimale, texte agrandi).
  Couvre CA-1, CA-2, CA-3.
- **Intégration** — Vitest `[SPEC-3002]` `apps/mobile/test/integration/fonts.int.test.ts` :
  présence et lisibilité des fichiers de police déclarés. Couvre CA-1.
- **End-to-end** — Maestro `@SPEC-3002` `SPEC-3002-galerie.yaml` (vidéo) : ouverture de la
  galerie, défilement de toutes les sections, appui sur `Segmented` et `Switch`, apparition d'un
  `Toast`. Couvre CA-1, CA-3.
- **Visuel** — `@SPEC-3002 @visual` : trois captures comparées aux lignes de base. Couvre CA-4.
- **Non-régression** — `[SPEC-3001]`. CA-5 prouvé par un test du lint
  (`apps/mobile/test/lint-rules.test.ts`, Vitest `[SPEC-3002]`).

| Critère | Tests |
|---|---|
| CA-1 | ui/*.test.tsx, fonts.int, SPEC-3002-galerie.yaml |
| CA-2 | theme.test |
| CA-3 | ui/*.test.tsx (cible), galerie |
| CA-4 | flux visuel |
| CA-5 | lint-rules.test |

## 13. Preuves attendues

`evidence/SPEC-3002/` : `acceptance.md`, rapports Vitest et Jest, vidéo de la galerie, captures
Android et iOS, images de différence, tableau des contrastes.

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3002` vert ; aucune régression de
SPEC-3001.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0131 (principe de galerie), ADR-3003, ADR-3004.
- L'haptique suit le réglage système ; aucun réglage dans l'application.
- Mode sombre, tablette et paysage hors périmètre (maquette) ; orientation verrouillée en portrait.
