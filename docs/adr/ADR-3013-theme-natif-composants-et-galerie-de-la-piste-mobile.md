# ADR-3013 — Thème natif, composants et galerie de la piste mobile

- **Statut** : Acceptée — précise ADR-3003, ADR-3004 et ADR-0131
- **Origine** : Déduite (pendant l'implémentation de SPEC-3002, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : ADR-0034, ADR-0131, ADR-3003, ADR-3004, ADR-3012, SPEC-3002

## Contexte

SPEC-3002 dérive le thème des jetons de `@learny/ui/tokens` et livre la bibliothèque de
composants natifs. Trois familles d'ambiguïtés ont été tranchées pendant l'implémentation :

1. **Échelles natives absentes du référentiel web.** `fontSizesPx`, `spacingPx`,
   `radiiPx` et `controlHeightsPx` sont calibrés sur les maquettes web (pixels CSS avant le zoom
   de 90 %) : ni 31 sp (headline Android), ni 30/32 dp (puce), ni 56 dp (ligne de liste), ni
   64 pt (grand avatar) n'y figurent. Les y ajouter toucherait le web (hors périmètre de la piste
   mobile, ADR-3001 § 4).
2. **Divergences maquette / spécification.** EF-1 impose « carte 22 » et « bouton pilule » là où
   `design/app-mobile/assets/app.css` dessine une carte Android de 18 et un bouton iOS de 14. La
   maquette peint aussi certains libellés en blanc sur orange (`.option.wrong .letter`) et en
   blanc sur vert (`.option.correct .letter`), deux paires sous le seuil AA de BR-PLA-03. Enfin
   `--lime-ink` vaut `#3D5200` dans la maquette et `#3F5A00` dans les jetons.
3. **Galerie et outillage de test.** La galerie est demandée en `/_dev/ui` ; Expo Router traite
   les dossiers préfixés par `_` comme privés mais les résout bien (la redirection de
   `/_dev/sdd/SPEC-3001` fonctionne depuis SPEC-3001). React Native Testing Library v14 rend de
   façon asynchrone et React 19 refuse les `act()` imbriqués des minuteries simulées.

## Décision

1. **Source unique des valeurs natives** : `apps/mobile/src/theme/tokens.ts` porte les échelles
   typographiques iOS et Android, les rayons, les espacements, les ombres, les durées et la
   géométrie des contrôles. Les **couleurs** restent celles de `@learny/ui/tokens`, sans copie.
   Aucune valeur n'est écrite ailleurs : ESLint refuse un littéral de couleur hors de
   `src/theme` (ET-1, CA-5), et un test Vitest vérifie l'appartenance des espacements, rayons et
   tailles publiées aux échelles du design system.
2. **EF-1 prime sur la maquette** quand les deux diffèrent : carte 22 sur les deux plateformes,
   bouton pilule, feuille 24 (iOS) / 28 (Android). Les valeurs de la maquette non couvertes par
   EF-1 sont conservées (puce 30/32, ligne 56, grand avatar 64).
3. **Contrastes** : les paires non conformes de la maquette sont remplacées par encre sur orange
   et encre sur vert (6,8:1 au lieu de 2,8:1), et `--lime-ink` cède devant le jeton `#3F5A00`.
   Le thème expose 24 paires vérifiées, dont deux réservées au texte large (≥ 3:1).
4. **Galerie** : le fichier demandé est `apps/mobile/app/_dev/ui.tsx` ; l'entrée se fait par un
   bandeau `sdd-ui-link` en tête de la page de démonstration de SPEC-3001, visible sans
   défilement. La route est refusée (`Redirect` vers `/`) quand `EXPO_PUBLIC_ENABLE_SDD_PAGES`
   n'est pas actif.
5. **Variantes de plateforme** : le contrôle segmenté, l'interrupteur et la ligne de liste ont un
   fichier `.ios.tsx` et un `.android.tsx` (la maquette montre deux contrôles différents) ; la
   logique commune vit dans `*.shared.tsx` / `*.types.ts`. Le bouton d'action flottant n'existe
   qu'en `.android.tsx` ; `Fab.tsx` rend `null` sur iOS et sert de contrat de types à TypeScript,
   qui ne résout pas les extensions de plateforme.
6. **Outillage de test** : les preuves Jest sont regroupées par famille de composants
   (`primitives`, `buttons`, `data-display`, `controls`, `overlays`, `sheet`), chaque composant
   gardant au moins un test de rendu, d'état et d'accessibilité. La feuille a sa propre suite :
   sa modale native et son `SafeAreaProvider` ne partagent pas un rendu avec les autres
   surcouches. Les durées de toast passent par `toastDuration()` (fonction pure) plutôt que par
   des minuteries simulées, que RNTL v14 et React 19 ne supportent pas. Le test CA-5 écrit une
   sonde réelle, la fait analyser par la configuration ESLint du dépôt puis la supprime : le
   service de typage refuse un chemin virtuel.
7. **Polices** : Inter 400/500/600/700 et Space Grotesk 500/600/700, sous licence OFL, sont
   embarquées ; une famille porte sa graisse, donc aucun style ne pose `fontWeight`. Le
   `SplashScreen` reste affiché jusqu'au chargement, et un échec de chargement laisse démarrer
   l'application avec les polices système (ET-3).

## Conséquences

- Toute nouvelle valeur native s'ajoute au tableau du thème et au test de contraste ; une
  spécification d'écran ne peut pas écrire de couleur, de taille ni de rayon.
- Les écarts à la maquette (carte Android 22, bouton pilule, blanc sur orange/vert, `--lime-ink`)
  sont consignés dans `evidence/SPEC-3002/acceptance.md` et visibles dans la galerie.
- iOS n'est pas exécuté sur cette plateforme (pas de macOS, ADR-3004 § 6) : la validation est
  Android, les variantes iOS sont couvertes par les tests Jest et le job manuel de la CI.