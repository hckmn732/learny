# SPEC-301 — critères d'acceptation

- **Date de validation** : 2026-11-12 (horloge des tests figée au 2026-11-11T12:20:00Z, ADR-0047)
- **Branche** : `spec/SPEC-301-jetons-de-design-et-theme`
- **Preuves** : `checks.json`, `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `video/`, `screenshots/`, `tokens-report.json`, `theme-size.json`.

- ✅ **CA-1** — `html` a une taille calculée de 14,4 px et un titre de 34 px maquette mesure 30,6 px ; aucune règle `zoom`.
  Preuve : e2e `galerie des jetons conforme @SPEC-301` (`html` 14,4 px, h1 30,6 px ; 4/4 tests e2e réussis, 7 vidéos) ; intégration `[SPEC-301] thème Tailwind` (absence de `zoom:`, présence de `font-size: 90%`) ; capture `screenshots/02-galerie-des-jetons-conforme-desktop-spec-301-gallery.png`.

- ✅ **CA-2** — Les 60 jetons de couleur de EF-2 existent avec leurs valeurs exactes dans `@learny/ui/tokens` et dans `theme.css` (`--color-<nom>`).
  Preuve : unitaire `[SPEC-301] jetons` (60 couleurs, valeurs `canvas`, `ink`, `lime`, `indigo`, `border`, `border-strong` ; 8 tests unitaires réussis) ; intégration `theme-build` (fichier commité identique à la sortie du générateur, styles `--color-lime`, `--radius-24`, `--text-34`) ; `tokens-report.json` (60 couleurs de jeton comparées) ; `theme-size.json` (5 144 octets, 1 701 octets gzip < 12 288).

- ✅ **CA-3** — Le test de conformité ET-6 passe : toute couleur et taille de `design/references/tokens.json` correspond à un jeton (hors palette de données listée) et réciproquement.
  Preuve : intégration `[SPEC-301] conformité aux maquettes` (4/4 tests d'intégration réussis) ; `tokens-report.json` (15 couleurs de référence, 73 couleurs observées dans les maquettes, 60 jetons, 10 tailles, 2 familles) ; ADR-0268 documente l'exclusion des valeurs initiales du navigateur (`#000000`, `rgba(0,0,0,0)`, `13.3333px`).

- ✅ **CA-4** — Une classe hors jeton (`bg-red-500`) ne produit aucune règle CSS et un littéral hexadécimal hors `tokens/` est refusé par ESLint.
  Preuve : intégration `theme-build` (compilation Tailwind de `bg-lime p-14 rounded-24 text-34 bg-red-500 text-sm` : présence des utilitaires de jetons, absence de `red-500` et de `.text-sm`) ; unitaire `[SPEC-301] règle ESLint no-restricted-syntax` (RuleTester : `'#111113'` refusé) ; `checks.json` lint réussi sur tout le dépôt.

- ✅ **CA-5** — `/_dev/ui/jetons` affiche les six sections avec les styles calculés conformes (`expectTokens`), sans violation axe serious/critical ; 404 quand `ENABLE_SDD_PAGES` est faux.
  Preuve : e2e `galerie des jetons conforme @SPEC-301` (six sections dans l'ordre, 60 pastilles, `expectTokens` sur 10 pastilles et le corps, axe sans violation) ; e2e `galerie fermée sans drapeau @SPEC-301` (404 pour `/_dev/ui`, `/_dev/ui/jetons`, `/_dev/sdd/SPEC-301`) ; visuel desktop et mobile `@SPEC-301 @visual` ; captures `screenshots/` ; lignes de base `apps/web/e2e/__screenshots__/p3/spec-301-tokens.spec.ts/dev-ui-jetons-{desktop,mobile}-linux.png`.

- ✅ **CA-6** — Inter et Space Grotesk sont chargées par `next/font` (familles calculées `Inter`/`Space Grotesk` sur `body` et h1, aucune requête vers `fonts.googleapis.com` au rendu).
  Preuve : e2e `galerie des jetons conforme @SPEC-301` (`font-family` calculée Inter sur `body`, Space Grotesk sur h1, aucune requête `fonts.googleapis.com`/`fonts.gstatic.com`) ; `apps/web/lib/fonts.ts` avec `subsets: ['latin', 'latin-ext']`, `display: 'swap'`, `adjustFontFallback: true` ; build Next réussi (polices auto-hébergées sous `/_next/static/media`).

## Non-régression et lignes de base

Les classes d'espacement Tailwind des écrans antérieurs utilisent désormais l'unité de 1 px maquette (EF-5, ADR-0268) et le `body` global est passé de blanc à `canvas` (EF-10). Les lignes de base visuelles des spécifications P0 à P2 ont donc été régénérées : 74 captures desktop/mobile, plus les deux nouvelles captures `dev-ui-jetons-desktop-linux.png` et `dev-ui-jetons-mobile-linux.png`. Les tests `@SPEC-001` à `@SPEC-212` concernés ont été rejoués en mode `--update-snapshots` (41 réussis, puis 21 + 3 + 2 après correction des rayons `rounded-24`, de la taille de police au chargement et des régions défilables focusables). Les valeurs de rayon attendues passent de 24 px arbitraires à 21,6 px calculés (24 px maquette × 0,9) et `PROVISIONAL_TOKENS.background` vaut `#F4F4F1`.
