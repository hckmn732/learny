---
id: SPEC-301
title: Jetons de design et thème
phase: P3
priority: V1
depends_on: [SPEC-006, SPEC-005]
business_rules: [BR-NAV-06]
screens: []
adrs: [ADR-0034, ADR-0059]
visual: tokens
---

# SPEC-301 — Jetons de design et thème

## 1. Objectif

Livrer le paquet `@learny/ui` avec son sous-module `@learny/ui/tokens` : la source unique et typée des jetons de design (couleurs, polices, tailles de texte, graisses, interlignages, espacements, rayons, ombres, hauteurs de contrôles, mise en page) repris **exactement** des maquettes `design/maquettes/*.dc.html`, convertis en rem (px/16) avec la racine `html { font-size: 90% }` (ADR-0034, BR-NAV-06), exposés comme thème Tailwind CSS 4 et vérifiés automatiquement contre `design/references/tokens.json` (SPEC-005). Ouvrir la galerie `/_dev/ui` avec sa section « Jetons ».

## 2. Contexte

Toutes les spécifications d'interface (P3 à P8) consomment ces jetons ; aucune couleur, taille ou rayon ne peut exister hors jetons (`docs/engineering/conventions.md` §4). Les maquettes sont rendues à 90 % par `design/maquettes/support.js` (`html{zoom:0.9}`) ; l'application obtient la même échelle sans `zoom` grâce à `html { font-size: 90% }` et à des jetons exprimés en rem (1 rem = 14,4 px au rendu, soit 16 px « maquette » × 0,9).

Documents à lire : `docs/adr/ADR-0034-echelle-d-affichage-et-conformite-visuelle.md`, `docs/adr/ADR-0059-design-system.md`, `docs/engineering/conventions.md` §4, `docs/engineering/testing.md` §6, `docs/product/screens.md` §2-3, `design/maquettes/Main.dc.html` (coquille), `design/maquettes/Inscription.dc.html` (anneau de focus, champs), `design/maquettes/Parametres.dc.html` (interrupteurs, onglets), `design/maquettes/Lacunes.dc.html` (cartes statistiques, filtres).

## 3. Dépendances

- **SPEC-006** : structure `apps/web` (layout racine `lang="fr"`, `app/globals.css`, messages `fr.ts`, drapeau `ENABLE_SDD_PAGES` et convention de dossier `%5Fdev` pour les routes `/_dev/*`, un dossier `_dev` étant privé dans l'App Router).
- **SPEC-005** : `design/references/tokens.json` (jetons extraits des maquettes) et `design/references/manifest.json`.
- **SPEC-001 / SPEC-004** (transitives) : Tailwind CSS 4, Vitest, Playwright, `@learny/testing` (`expectTokens`, horloge figée).
- Bibliothèques : `tailwindcss@4` et `@tailwindcss/postcss` (déjà installés par SPEC-001), `next/font/google` (Inter, Space Grotesk). Aucune variable d'environnement nouvelle.
- Indisponibilité : si Google Fonts est inaccessible au build (réseau CI), `next/font` échoue ; dans ce cas utiliser `next/font/local` avec les fichiers WOFF2 d'Inter et Space Grotesk ajoutés dans `apps/web/app/fonts/` (licence OFL) — même noms de variables CSS, aucune autre différence.

## 4. Règles métier couvertes

- **BR-NAV-06** — échelle 90 % : `apps/web/app/globals.css` déclare `html { font-size: 90%; }` ; tous les jetons de taille sont en rem = px maquette / 16 ; aucune propriété `zoom` n'est utilisée ; le test e2e vérifie que `getComputedStyle(document.documentElement).fontSize === '14.4px'` et qu'un élément de 34 px maquette mesure 30,6 px.

## 5. Exigences fonctionnelles

- **EF-1** — Le paquet `packages/ui` (`@learny/ui`) existe avec les points d'entrée `@learny/ui` (composants, vide à ce stade hormis `cn`), `@learny/ui/tokens` (objets TypeScript) et `@learny/ui/theme.css` (thème Tailwind 4).
- **EF-2** — Couleurs (noms exacts, valeurs exactes, en majuscules) :

| Jeton | Valeur | Usage principal (maquettes) |
|---|---|---|
| `canvas` | `#F4F4F1` | fond de page, piste des contrôles segmentés « soft », survol des éléments de menu |
| `surface` | `#FFFFFF` | cartes, panneaux, champs |
| `surface-subtle` | `#F8F8F6` | blocs internes (lignes de réglages, cartes sélectionnées) |
| `surface-muted` | `#F0EFEA` | piste des barres de progression, squelettes |
| `surface-weekend` | `#FAFAF8` | jours de week-end (agenda), en-têtes de tableau |
| `surface-today` | `#FAFAF6` | colonne du jour (agenda) |
| `ink` | `#111113` | texte principal, surfaces sombres, bouton noir |
| `ink-secondary` | `#3F3F46` | texte secondaire (corps des notifications) |
| `ink-muted` | `#62626B` | sur-titres, métadonnées, libellés atténués |
| `border` | `#E7E6E1` | bordure standard des cartes et champs d'en-tête |
| `border-strong` | `#DAD9D3` | bordure des boutons contour et des champs de formulaire |
| `divider` | `#EEEDE8` | séparateurs internes |
| `border-dashed` | `#C9C8C1` | zones d'ajout en pointillés |
| `border-dotted` | `#A8A7A0` | marges de rattrapage, ajout de ligne |
| `lime` | `#C6F432` | accent principal (bouton citron, série, badges) |
| `lime-soft` | `#EEF8CF` | pastille de type « quiz global » |
| `lime-softer` | `#F1FBD3` | pastille « Gratuit », icône de confirmation |
| `lime-ink` | `#3F5A00` | texte sur `lime-soft` |
| `lime-ink-strong` | `#3D5200` | texte secondaire sur `lime` ou `lime-softer` |
| `lime-border` | `#9FC51F` | bordure du module en cours |
| `indigo` | `#5B5BD6` | avatar, anneau de focus, point non lu, rétention |
| `indigo-light` | `#8B8BF0` | pastille « cours » sur fond sombre |
| `indigo-soft` | `#ECECFC` | fond des pastilles indigo, sigle de formation |
| `indigo-soft-alt` | `#E3E3FA` | alternance des barres de calendrier |
| `indigo-ink` | `#3A3AA8` | liens, texte sur `indigo-soft` |
| `indigo-ink-strong` | `#2E2E8F` | texte des pastilles indigo |
| `indigo-ink-hover` | `#26267A` | lien survolé |
| `unread` | `#F5F5FD` | fond d'une notification non lue |
| `orange` | `#F97316` | pastille de la cloche, alertes, barres de lacune |
| `orange-soft` | `#FFEDE0` | fond des alertes et pastilles orange |
| `orange-ink` | `#8F3305` | texte sur `orange-soft`, erreurs |
| `orange-ink-strong` | `#A13A06` | variante de texte orange |
| `orange-ink-alt` | `#C2410C` | icône de type « lacune » (paramètres) |
| `orange-on-dark` | `#FDBA74` | badge « Mes lacunes » sur fond sombre |
| `orange-dark` | `#3A2A20` | fond du badge « Mes lacunes » |
| `teal` | `#14A38B` | réussite, solidité du mot de passe |
| `green` | `#0F9F7F` | accent de formation vert |
| `green-mint` | `#34D399` | notion maîtrisée (carte) |
| `green-soft` | `#E1F4EF` | fond des pastilles vertes |
| `green-ink` | `#0B5C4D` | texte sur `green-soft`, confirmations |
| `green-ink-alt` | `#0F6B5A` | variante de texte vert |
| `violet` | `#B79CFA` | pastille « quiz global » sur fond sombre |
| `violet-soft` | `#F0E9FE` | fond des pastilles violettes |
| `violet-ink` | `#5B21B6` | texte sur `violet-soft` |
| `danger` | `#B42318` | action destructrice (« Supprimer mon compte ») |
| `dark-850` | `#18181B` | section « Formation en cours » du menu |
| `dark-800` | `#1C1C20` | bloc Série, lignes sur carte sombre |
| `dark-750` | `#232328` | élément de menu actif (zone générale), carte formation |
| `dark-700` | `#2A2A30` | élément actif dans la section formation, pastilles sur sombre |
| `dark-line` | `#26262B` | séparateur et bordure du menu |
| `dark-600` | `#2E2E34` | bordure des boutons du menu, case de série vide |
| `dark-500` | `#3A3A40` | piste de progression sur sombre, bordure contour sur sombre |
| `dark-400` | `#52525B` | notion « pas encore vue » |
| `on-dark-muted` | `#A1A1AA` | texte atténué sur sombre |
| `on-dark-secondary` | `#D4D4D8` | texte secondaire sur sombre |
| `on-dark-faint` | `#E4E4E7` | nœud de module (carte, mode maîtrise) |
| `white` | `#FFFFFF` | texte sur sombre |
| `header-glass` | `rgba(244, 244, 241, 0.92)` | fond translucide de l'en-tête |
| `overlay` | `rgba(17, 17, 19, 0.45)` | voile des dialogues et du menu en surimpression |
| `tooltip-glass` | `rgba(28, 28, 32, 0.88)` | infobulles de la carte |

Les couleurs de données de la carte des notions (`#2DD4BF`, `#FBBF24`, `#F472B6`, `#60A5FA`, `#F87171`) ne sont **pas** des jetons d'interface : elles sont déclarées par SPEC-616 dans `@learny/ui/tokens` sous `dataPalette` et exclues des contrôles de couleurs d'interface.

- **EF-3** — Polices : `sans` = Inter (400, 500, 600, 700) avec repli `system-ui, sans-serif` ; `display` = Space Grotesk (500, 600, 700) avec repli `sans-serif` ; `mono` = `ui-monospace, monospace`. Chargées par `next/font` dans `apps/web/lib/fonts.ts`, variables CSS `--font-inter` et `--font-space-grotesk`, `display: 'swap'`, sous-ensemble `latin` et `latin-ext`.
- **EF-4** — Tailles de texte (px maquette → rem) : 10 → 0.625, 11 → 0.6875, 11.5 → 0.71875, 12 → 0.75, 13 → 0.8125, 14 → 0.875, 15 → 0.9375, 16 → 1, 17 → 1.0625, 18 → 1.125, 19 → 1.1875, 20 → 1.25, 21 → 1.3125, 22 → 1.375, 24 → 1.5, 26 → 1.625, 28 → 1.75, 30 → 1.875, 32 → 2, 34 → 2.125, 40 → 2.5, 44 → 2.75. Graisses : 400, 500, 600, 700. Interlignages : 1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.7. Espacements de lettres : `eyebrow` 0.08em, `kicker` 0.1em, `label` 0.06em, `title` −0.02em, `heading` −0.01em.
- **EF-5** — Espacements : unité Tailwind `--spacing: 0.0625rem` (1 px maquette), si bien que `p-14` = 14 px maquette = 0.875rem ; les valeurs employées par les maquettes sont 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 42, 48, 56.
- **EF-6** — Rayons (px → rem) : 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28 (tous px/16) et `full` = 999px. Noms Tailwind `rounded-<px>` (ex. `rounded-24` = 1.5rem), plus `rounded-full`.
- **EF-7** — Ombres : `popover` = `0 1.125rem 3rem rgba(17, 17, 19, 0.16)` (18/48 px) ; `menu` = `0 1rem 2.5rem rgba(17, 17, 19, 0.14)` (16/40 px) ; `segment` = `0 0.0625rem 0.1875rem rgba(17, 17, 19, 0.12)` (1/3 px) ; `knob` = `0 0.0625rem 0.125rem rgba(17, 17, 19, 0.2)` (1/2 px) ; `float` = `0 0.75rem 2rem rgba(17, 17, 19, 0.12)` (12/32 px) ; `drawer` = `-1.5rem 0 3.75rem rgba(17, 17, 19, 0.12)` (−24/60 px) ; `toast` = `0 1rem 2.5rem rgba(17, 17, 19, 0.28)` ; `ring-white` = `0 0 0 0.125rem #FFFFFF` (anneau de pastille).
- **EF-8** — Hauteurs de contrôles (px → rem) : 28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52 ; mise en page : `sidebar-width` 248 px (15.5rem), `content-max` 1160 px (72.5rem), `page-pad-x` 40 px, `page-pad-top` 28 px, `page-pad-bottom` 56 px, `header-pad-y` 12 px, `popover-width` 400 px (25rem), `menu-width` 260 px (16.25rem), point de rupture `shell` = 900 px (exprimé **en px CSS** dans les requêtes média, car un rem de requête média vaut toujours 16 px).
- **EF-9** — Anneau de focus (jeton `focus-ring`) : `outline: 3px solid #5B5BD6; outline-offset: 2px` (valeurs de `Inscription.dc.html`, exprimées en px CSS car un contour ne doit pas rétrécir).
- **EF-10** — Base globale (`apps/web/app/globals.css`) : `html { font-size: 90%; }`, `body { margin: 0; background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }`, `a { color: var(--color-indigo-ink) } a:hover { color: var(--color-indigo-ink-hover) }`, `:focus-visible` = anneau EF-9, `font-variant-numeric: tabular-nums` disponible par l'utilitaire `tabular-nums`.
- **EF-11** — Galerie `/_dev/ui` (index) et `/_dev/ui/jetons` : nuancier (chaque couleur : pastille 64×64 px maquette, nom, valeur), échelle typographique (chaque taille avec un pangramme français « Portez ce vieux whisky au juge blond qui fume »), rayons, ombres, espacements, contrôles de hauteur. Pages rendues seulement si `ENABLE_SDD_PAGES=true`, sinon 404. `/_dev/sdd/SPEC-301` redirige (307) vers `/_dev/ui/jetons`.

## 6. Exigences techniques

- **ET-1** — Arborescence : `packages/ui/src/tokens/colors.ts`, `typography.ts`, `spacing.ts`, `radii.ts`, `shadows.ts`, `layout.ts`, `index.ts` ; chaque fichier exporte un objet `as const` (ex. `export const colors = { canvas: '#F4F4F1', … } as const; export type ColorToken = keyof typeof colors;`). `px(n: number): string` renvoie `${n / 16}rem` (pas d'arrondi : `px(11.5) === '0.71875rem'`).
- **ET-2** — Thème Tailwind 4 : `packages/ui/src/styles/theme.css` est **généré** par `packages/ui/scripts/build-theme.ts` (`pnpm --filter @learny/ui tokens:css`) à partir des objets TypeScript ; il contient un bloc `@theme { … }` qui commence par réinitialiser les espaces de noms par défaut (`--color-*: initial; --text-*: initial; --radius-*: initial; --shadow-*: initial; --font-*: initial;`) afin qu'aucune couleur, taille, rayon ou ombre hors jetons ne soit utilisable, puis déclare `--color-<nom>`, `--text-<px>` (ex. `--text-14: 0.875rem`), `--font-weight-*`, `--leading-*`, `--tracking-eyebrow` …, `--radius-<px>`, `--radius-full: 999px`, `--shadow-<nom>`, `--spacing: 0.0625rem`, `--font-sans: var(--font-inter), system-ui, sans-serif`, `--font-display: var(--font-space-grotesk), sans-serif`, `--font-mono: ui-monospace, monospace`, `--breakpoint-shell: 900px`. Un test unitaire vérifie que le fichier commité est identique à la sortie du générateur.
- **ET-3** — `apps/web/app/globals.css` : `@import 'tailwindcss'; @import '@learny/ui/theme.css'; @source '../../../packages/ui/src';` puis la base EF-10. Le layout racine applique `className={`${inter.variable} ${spaceGrotesk.variable}`}` sur `<html lang="fr">`.
- **ET-4** — `cn(...classes)` = `twMerge(clsx(...))` exporté par `@learny/ui` (dépendances `clsx`, `tailwind-merge` configuré avec les échelles personnalisées : `extendTailwindMerge({ extend: { theme: { color: [...noms], text: [...tailles], radius: [...rayons], shadow: [...ombres] } } })`).
- **ET-5** — `packages/ui/src/tokens/tokens.export.ts` produit un JSON normalisé `{ colors: Record<string,string>, fontSizesPx: number[], radiiPx: number[], shadows: Record<string,string>, fontFamilies: string[] }` utilisé par les tests et par `expectTokens` (SPEC-004).
- **ET-6** — Test de conformité aux maquettes : lit `design/references/tokens.json` sans présumer de sa forme exacte (parcours récursif) : toutes les chaînes hexadécimales `#RRGGBB` (normalisées en majuscules) et `rgba(...)` (espaces retirés) forment l'ensemble E, toutes les valeurs `"<n>px"` associées à une clé contenant `font` ou `size` forment F. Assertions : (a) chaque couleur de jeton ∈ E, sauf `unread` (`#F5F5FD`, définie dans `design/maquettes/support.js` et non dans les fichiers `.dc.html`) qui est vérifiée contre `support.js` ; (b) chaque couleur de E ∈ jetons ∪ `dataPalette` (SPEC-616 pourra l'alimenter ; à ce stade la liste d'exclusion explicite `['#2DD4BF','#FBBF24','#F472B6','#60A5FA','#F87171']`) ; (c) chaque taille de F ∈ EF-4 ; (d) les familles `Inter` et `Space Grotesk` ∈ familles extraites. Si `tokens.json` est absent, le test échoue avec le message « design/references/tokens.json manquant : exécuter SPEC-005 ».
- **ET-7** — Aucun jeton ne doit être dupliqué ailleurs : règle ESLint `no-restricted-syntax` ajoutée à `apps/web` et `packages/ui` qui interdit les littéraux `/#[0-9A-Fa-f]{3,8}\b/` dans les fichiers `.ts/.tsx` hors `packages/ui/src/tokens/**` et hors tests (`*.test.*`, `e2e/**`).
- **ET-8** — Performance : polices auto-hébergées par `next/font` (aucune requête à Google au rendu), `preload` activé pour Inter seulement ; CSS du thème < 12 Ko gzip.
- **ET-9** — Accessibilité : les paires texte/fond sont listées et vérifiées par SPEC-309 ; cette spécification fournit les valeurs.

## 7. Comportements attendus et cas limites

- **CL-1** — Préférence de taille du navigateur à 20 px : la racine vaut 18 px (90 %), tout le texte et les espacements grandissent proportionnellement (aucune taille en px hormis bordures, contours et requêtes média) ; aucune coupure de texte dans la galerie à 200 % (WCAG 1.4.4).
- **CL-2** — Valeur fractionnaire (11,5 px) : `px(11.5)` = `0.71875rem`, jamais arrondie.
- **CL-3** — Classe hors jeton (ex. `bg-red-500`, `text-sm`) : aucune règle CSS n'est générée (espaces de noms réinitialisés) ; un test de build vérifie l'absence de `--color-red-500` dans le CSS produit.
- **CL-4** — Police indisponible (échec de chargement) : repli `system-ui` / `sans-serif` sans décalage de mise en page excessif (`adjustFontFallback` de `next/font` activé, CLS < 0,1).
- **CL-5** — `ENABLE_SDD_PAGES` absent ou `false` : `/_dev/ui` et `/_dev/ui/jetons` répondent 404 (testé).
- **CL-6** — Écran < 900 px : la galerie s'affiche en une colonne, nuancier en grille `repeat(auto-fill, minmax(10rem, 1fr))`, sans défilement horizontal à 360 px.
- **CL-7** — `prefers-color-scheme: dark` : aucun thème sombre en V1 ; `color-scheme: light` est déclaré sur `html` pour éviter l'inversion des contrôles natifs.
- **CL-8** — `tokens.json` contient une couleur absente des jetons (nouvelle maquette) : le test (b) échoue en listant la couleur et les fichiers ; la correction consiste à ajouter le jeton (jamais à affaiblir le test).

## 8. Instructions d'implémentation

1. Créer `packages/ui` (package.json `@learny/ui`, `"type": "module"`, exports `"."`, `"./tokens"`, `"./theme.css"`, scripts `test`, `lint`, `typecheck`, `tokens:css`), `tsconfig.json` étendant la configuration commune, `README.md`. Commit `build(SPEC-301): crée le paquet @learny/ui`.
2. Écrire les fichiers de jetons ET-1 avec les valeurs de la section 5 (copier les tableaux ; ordre identique), `px()`, `tokens.export.ts`. Commit `feat(SPEC-301): ajoute les jetons de design`.
3. Écrire `scripts/build-theme.ts` (lit les objets, émet `src/styles/theme.css` trié de façon stable), générer le fichier, l'ajouter. Commit `feat(SPEC-301): génère le thème Tailwind 4`.
4. Créer `apps/web/lib/fonts.ts` (Inter : poids 400-700 ; Space Grotesk : 500-700 ; variables EF-3), brancher `globals.css` (ET-3, EF-10) et le layout racine. Commit `feat(SPEC-301): branche polices et base globale`.
5. Ajouter `cn` (ET-4) et la règle ESLint ET-7. Commit `build(SPEC-301): interdit les couleurs hors jetons`.
6. Créer la galerie : `apps/web/app/%5Fdev/ui/layout.tsx` (garde `ENABLE_SDD_PAGES` → `notFound()`, colonne de navigation des sections : Jetons, Actions, Saisie, Structure, Retours, Accessibilité ; les sections futures apparaissent quand leur page existe), `page.tsx` (index), `jetons/page.tsx`, redirection `apps/web/app/%5Fdev/sdd/SPEC-301/page.tsx` → `redirect('/_dev/ui/jetons')` si la page dynamique de SPEC-006 ne gère pas déjà les redirections. Commit `feat(SPEC-301): ouvre la galerie /_dev/ui`.
7. Écrire les tests (section 12), exécuter `pnpm test:unit -t SPEC-301`, `pnpm test:int -t SPEC-301`, `pnpm test:e2e --grep @SPEC-301`. Commit `test(SPEC-301): couvre jetons, thème et galerie`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/README.md`, `packages/ui/src/index.ts`, `packages/ui/src/cn.ts`, `packages/ui/src/tokens/{colors,typography,spacing,radii,shadows,layout,index,tokens.export}.ts`, `packages/ui/src/styles/theme.css`, `packages/ui/scripts/build-theme.ts`, `packages/ui/src/tokens/tokens.test.ts`, `packages/ui/test/integration/tokens-vs-mockups.test.ts`, `packages/ui/test/integration/theme-build.test.ts`, `apps/web/lib/fonts.ts`, `apps/web/app/%5Fdev/ui/{layout,page}.tsx`, `apps/web/app/%5Fdev/ui/jetons/page.tsx`, `apps/web/components/dev-ui/TokenSwatch.tsx`, `apps/web/e2e/specs/p3/spec-301-tokens.spec.ts`.
- **Modifiés** : `apps/web/app/globals.css` (imports et base), `apps/web/app/layout.tsx` (variables de police, `color-scheme`), `apps/web/package.json` (dépendance `@learny/ui`), `eslint.config.js` (règle ET-7), `pnpm-workspace.yaml` si nécessaire.
- **Lus / réutilisés** : `design/references/tokens.json`, `@learny/testing` (`expectTokens`, `CLOCK_FIXED_AT`), garde `ENABLE_SDD_PAGES` de SPEC-006.

## 10. Interface et conformité visuelle

- Mode `tokens` (pas de maquette propre). Page `/_dev/ui/jetons`, structure : en-tête de page (sur-titre « Galerie du design system » 14 px `ink-muted`, titre h1 « Jetons » Space Grotesk 34 px 600, −0.02em) ; sections `data-testid="tokens-colors"`, `tokens-typography`, `tokens-radii`, `tokens-shadows`, `tokens-spacing`, `tokens-controls`, dans cet ordre ; chaque pastille `data-testid="swatch-<nom>"` affiche le nom et la valeur en `font-mono`.
- Contrôles automatisés : (1) `expectTokens` sur chaque pastille (couleur de fond calculée = valeur du jeton), sur le titre (famille Space Grotesk, 30.6px calculés), sur `html` (14.4px) ; (2) structure : présence et ordre des six sections ; (3) pas de comparaison maquette (écran sans maquette) ; (4) ligne de base `toHaveScreenshot('dev-ui-jetons.png', { fullPage: true, maxDiffPixelRatio: 0.01 })`.
- Accessibilité : chaque pastille a un texte visible (pas d'information par la couleur seule) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — `html` a une taille calculée de 14,4 px et un titre de 34 px maquette mesure 30,6 px au rendu ; aucune règle `zoom` dans le CSS livré.
- **CA-2** — Les 60 jetons de couleur de EF-2 existent avec leurs valeurs exactes dans `@learny/ui/tokens` et dans `theme.css` (`--color-<nom>`).
- **CA-3** — Le test de conformité ET-6 passe : toute couleur et taille de `design/references/tokens.json` correspond à un jeton (hors palette de données listée) et réciproquement.
- **CA-4** — Une classe hors jeton (`bg-red-500`) ne produit aucune règle CSS et un littéral hexadécimal hors `tokens/` est refusé par ESLint.
- **CA-5** — `/_dev/ui/jetons` affiche les six sections avec les styles calculés conformes (`expectTokens`), sans violation axe serious/critical ; 404 quand `ENABLE_SDD_PAGES` est faux.
- **CA-6** — Inter et Space Grotesk sont chargées par `next/font` (familles calculées `Inter`/`Space Grotesk` sur `body` et h1, aucune requête vers `fonts.googleapis.com` au rendu).

## 12. Plan de tests

- **Unitaires** (`packages/ui/src/tokens/tokens.test.ts`, `describe('[SPEC-301] jetons')`) : `px(14) === '0.875rem'`, `px(11.5) === '0.71875rem'` ; toutes les couleurs correspondent à `/^#[0-9A-F]{6}$/` ou `rgba(...)` ; nombre de jetons de couleur = 60 ; valeurs clés (`canvas`, `ink`, `lime`, `indigo`, `border`, `border-strong`) ; tailles EF-4 toutes présentes ; ombres `popover` et `menu` exactes ; `cn('p-12','p-14') === 'p-14'` et `cn('bg-ink','bg-lime') === 'bg-lime'`.
- **Intégration** (`describe('[SPEC-301] …')`) : `theme-build.test.ts` — la sortie du générateur est identique au `theme.css` commité ; compilation Tailwind d'un fichier d'essai contenant `bg-lime p-14 rounded-24 text-34 bg-red-500 text-sm` → CSS contenant `background-color: var(--color-lime)`, `padding: calc(var(--spacing) * 14)`, et ne contenant ni `red-500` ni `text-sm` ; `tokens-vs-mockups.test.ts` — ET-6 (a) à (d).
- **End-to-end** (`apps/web/e2e/specs/p3/spec-301-tokens.spec.ts`, vidéo, horloge figée `2026-11-11T12:20:00Z`) :
  - `galerie des jetons conforme @SPEC-301` : ouvre `/_dev/ui/jetons`, vérifie `html` 14.4px, parcourt les sections (défilement filmé), `expectTokens` sur 10 pastilles représentatives et sur le h1, aucune requête réseau vers `fonts.googleapis.com`/`fonts.gstatic.com`, axe via le helper de `@learny/testing`.
  - `galerie fermée sans drapeau @SPEC-301` : serveur de test avec `ENABLE_SDD_PAGES=false` (projet Playwright dédié ou requête `request.get`) → 404.
- **Visuel** (`@SPEC-301 @visual`) : `galerie des jetons ligne de base @SPEC-301 @visual` — contrôles 1, 2 et 4 de testing.md §6 (pas de comparaison maquette) ; `toHaveScreenshot('dev-ui-jetons.png', { fullPage: true, maxDiffPixelRatio: 0.01 })`.
- **Non-régression** : `@SPEC-001`, `@SPEC-005`, `@SPEC-006` (layout racine, pages /_dev).
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | e2e `galerie des jetons conforme @SPEC-301` ; intégration `theme-build` (absence de `zoom`) |
| CA-2 | unitaire `[SPEC-301] jetons` ; intégration `theme-build` |
| CA-3 | intégration `tokens-vs-mockups` |
| CA-4 | intégration `theme-build` (classe hors jeton) ; test ESLint dans `tokens.test.ts` (RuleTester) |
| CA-5 | e2e `galerie des jetons conforme`, `galerie fermée sans drapeau`, visuel `@SPEC-301 @visual` |
| CA-6 | e2e `galerie des jetons conforme @SPEC-301` |

## 13. Preuves attendues

`evidence/SPEC-301/` : vidéo du parcours de la galerie, capture `screenshots/dev-ui-jetons.png`, rapport du test ET-6 (liste des couleurs comparées), `checks.json` (lint, typecheck, axe), mesure de la taille gzip de `theme.css`.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7, plus : `theme.css` régénéré sans écart ; ligne de base `dev-ui-jetons.png` commitée ; aucune couleur hexadécimale hors `packages/ui/src/tokens/` dans `apps/web` et `packages/ui` (hors tests).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0034 (échelle 90 %, rem), ADR-0059 (`packages/ui`, polices via `next/font`), ADR-0049 (pages de développement derrière `ENABLE_SDD_PAGES`), ADR-0047 (horloge figée des e2e).
- Décision créée : **ADR-0130 — Jetons de design : nommage, unité d'espacement et thème Tailwind fermé** (noms de la section 5, `--spacing: 0.0625rem`, réinitialisation des espaces de noms Tailwind, point de rupture en px, focus en px).
- Décision créée : **ADR-0131 — Conventions des composants et galerie /_dev/ui** (structure de la galerie, utilisée ici pour son ouverture).
- Hypothèse : `design/references/tokens.json` peut avoir n'importe quelle forme JSON ; le test l'explore récursivement (ET-6). Hypothèse : SPEC-006 sert les routes `/_dev/*` depuis un dossier `%5Fdev`.
