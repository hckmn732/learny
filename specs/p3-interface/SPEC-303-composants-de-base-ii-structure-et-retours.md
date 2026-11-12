---
id: SPEC-303
title: Composants de base II : structure et retours
phase: P3
priority: V1
depends_on: [SPEC-302]
business_rules: [BR-NAV-04]
screens: []
adrs: [ADR-0059]
visual: tokens
---

# SPEC-303 — Composants de base II : structure et retours

## 1. Objectif

Compléter `@learny/ui` avec les composants de structure et de retour d'information — `Card`, `StatCard`, `ProgressBar`, `ProgressRing`, `Avatar`, `Popover`, `DropdownMenu`, `Dialog`, `AlertDialog`, `Toast`, `Tooltip`, `EmptyState`, `Skeleton`, `ErrorState`, `Breadcrumb`, `PageHeader`, `Icon` (registre lucide) — conformes aux maquettes, accessibles, et présentés dans la galerie (sections « Structure » et « Retours »).

## 2. Contexte

Ces composants composent les écrans maquettés (P6, P7) et les écrans sans maquette (SCR-16 à SCR-20), qui doivent reprendre exclusivement les motifs de `docs/product/screens.md` §3 : en-tête de page (sur-titre 14 px gris + titre 34 px Space Grotesk), rangée de cartes statistiques (première sombre `#111113` à chiffre `#C6F432`, suivantes blanches), listes en cartes blanches bordées `#E7E6E1` de rayon 24 px. Références : `design/maquettes/Lacunes.dc.html` (en-tête, cartes statistiques, barre de maîtrise), `design/maquettes/Main.dc.html` (anneau de rétention, avatar, menu Mon compte, panneau), `design/maquettes/Cours.dc.html` (fil d'Ariane), `design/maquettes/Inscription.dc.html` (pictogramme d'état vide), ADR-0059.

## 3. Dépendances

- **SPEC-302** : `Button`, `IconButton`, `Link`, `Badge`, conventions de composants, galerie.
- Bibliothèques : `@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-toast`, `lucide-react`.

## 4. Règles métier couvertes

- **BR-NAV-04** — fil d'Ariane : le composant `Breadcrumb` produit exactement le motif « Programme / Module n · titre / page » (`Cours.dc.html`) ; l'aide `buildFormationBreadcrumb({ formationId, module?: { id, position, title }, page })` renvoie les éléments `[{ label: 'Programme', href: '/formations/<fid>/programme' }, { label: 'Module <n> · <titre>', href: '/formations/<fid>/modules/<mid>' }, { label: <page> }]` utilisés par Module, Cours, Exercice et Quiz (SPEC-607, 609, 611, 613).

## 5. Exigences fonctionnelles

Valeurs en px maquette (classes de jetons de SPEC-301).

- **EF-1 — `Card`** : `<section>`/`<article>`/`<div>` selon `as` ; props `tone: 'default' | 'dark' | 'lime' | 'subtle'`, `padding: 'none' | 'sm' | 'md' | 'lg'` (0 / 16 / 22·24 / 24·28), `radius: 18 | 20 | 22 | 24` (défaut 24), `labelledBy?`. `default` fond `surface` bordure 1 px `border` ; `dark` fond `ink` texte `white` ; `lime` fond `lime` texte `ink` ; `subtle` fond `surface-subtle` sans bordure, rayon 18. Sous-composants `CardHeader` (titre h2 18 px 600 ou 22 px Space Grotesk 600 −0.01em selon `titleSize`, description 13-14 px `ink-muted`, zone d'actions à droite, retour à la ligne).
- **EF-2 — `StatCard`** : props `value: string`, `label: string`, `tone: 'dark' | 'light'`. Rayon 22, remplissage 20, écart 4, `flex: 1 1 220px` ; valeur Space Grotesk 34 px 600 ; libellé 13 px. `dark` : fond `ink`, valeur `lime`, libellé `on-dark-secondary`. `light` : fond `surface`, bordure `border`, valeur `ink`, libellé `ink-muted`. `StatRow` aligne les cartes (écart 12, retour à la ligne).
- **EF-3 — `ProgressBar`** : `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow`, `aria-label` ou `aria-labelledby` obligatoire (ou `decorative` → `aria-hidden`). Props `value` (0-100, borné), `tone: 'orange' | 'lime' | 'indigo' | 'teal'`, `size: 'md' | 'sm'`, `onDark?`. `md` : hauteur 8, rayon 4, piste `surface-muted` ; `sm` : hauteur 4, rayon 2, piste `border` (ou `dark-500` si `onDark`, cas du menu latéral). Largeur du remplissage en style dynamique (`width: <value>%`, seul style en ligne autorisé).
- **EF-4 — `ProgressRing`** : SVG `viewBox 0 0 112 112`, cercle r = 46, trait 12, piste `indigo-soft`, progression `indigo`, extrémités arrondies, rotation −90°, `stroke-dasharray = (2π·46·v/100) 289` ; taille par défaut 112 px maquette ; libellé central Space Grotesk 26 px 600 (« 86 % ») ; props `value`, `label` (texte accessible complet, ex. « Notions retenues à 1 mois : 86 % »), `size`, `tone: 'indigo' | 'teal'` (teal : piste `border`, progression `teal`, utilisé en 36 px r = 14 trait 5 par d'autres écrans via `size="xs"`). Le SVG est `aria-hidden`, le texte accessible est porté par un `role="img"` englobant.
- **EF-5 — `Avatar`** : cercle 34×34 (`md`) ou 28×28 (`sm`), fond `indigo`, texte `white` 13 px (11 px en `sm`) graisse 600, initiales calculées par `getInitials(firstName, lastName)` : première lettre du prénom + première lettre du nom, en majuscules, lettres accentuées conservées (« Élise Ortiz » → « ÉO ») ; prénom seul → 1 lettre ; aucun nom → « ? ». `aria-hidden` par défaut (le nom est porté par le contrôle parent).
- **EF-6 — `Popover`** (Radix) : contenu rayon 20, fond `surface`, bordure `border`, ombre `popover`, largeur par `width` (défaut 400 px maquette, `max-width: calc(100vw - 32px)`), `sideOffset` 12 (le panneau apparaît à 54 px du haut d'un déclencheur de 42 px), alignement `end` par défaut. Fermeture : Échap (focus rendu au déclencheur), clic extérieur, `onOpenChange`. `aria-labelledby` vers le titre interne.
- **EF-7 — `DropdownMenu`** (Radix, `role="menu"`) : contenu largeur 260, remplissage 8, rayon 18, fond `surface`, bordure `border`, ombre `menu`, écart 2 ; `DropdownMenuItem` hauteur min 42, remplissage 0 10, rayon 10, texte 14 graisse 600 `ink`, icône 18 trait 1.8 à 10 px, survol/focus fond `canvas` ; `DropdownMenuLabel` (bloc d'identité non interactif : remplissage 10 10 12, bordure basse `divider`, marge basse 4) ; `DropdownMenuSeparator` (1 px `divider`). Navigation clavier Radix (flèches, Début/Fin, saisie de lettres, Échap, focus rendu).
- **EF-8 — `Dialog`** (Radix) : voile `overlay` ; panneau centré, rayon 24, remplissage 28, fond `surface`, largeur max 560 (`size="md"`) ou 720 (`lg`), hauteur max `calc(100dvh - 48px)` avec défilement interne ; titre (`DialogTitle`) Space Grotesk 22 px 600 ; description 15 px `ink-secondary` ; bouton fermer `IconButton` `X` « Fermer » en haut à droite ; pied d'actions aligné à droite (écart 8, inversé en colonne < 900 px). Focus piégé, focus initial sur le premier élément interactif (ou `initialFocusRef`), Échap ferme, focus rendu au déclencheur, défilement du fond bloqué. Animation d'apparition 150 ms (opacité + translation 8 px), nulle sous mouvement réduit.
- **EF-9 — `AlertDialog`** (Radix) : même habillage sans bouton fermer ; props `title`, `description`, `confirmLabel`, `cancelLabel` (défaut « Annuler »), `onConfirm` (peut renvoyer une promesse : bouton en `loading`), `destructive?` (bouton de confirmation `dark` précédé de l'icône `TriangleAlert` et titre préfixé visuellement par une pastille `orange`). Focus initial sur « Annuler ».
- **EF-10 — `Toast`** (Radix Toast) : `ToastProvider` monté une fois dans le layout connecté ; fonction impérative `toast({ title, description?, tone: 'neutral' | 'success' | 'error', action?: { label, onClick }, durationMs? })`. Apparence : fond `ink`, texte `white` 14 px, rayon 14, remplissage 12 16, ombre `toast`, largeur max 420 ; pastille d'état 8 px (`lime` succès, `orange` erreur) ; zone en bas au centre, 24 px du bord, empilement de 3 au plus (le plus ancien est retiré). Durée 5 000 ms (8 000 ms si `action`), pause au survol et au focus. `success`/`neutral` : `type="foreground"` poli ; `error` : annonce assertive. Fermeture : bouton « Fermer », Échap, balayage.
- **EF-11 — `Tooltip`** (Radix) : fond `ink`, texte `white` 12 px 600, rayon 8, remplissage 6 10, flèche, délai d'ouverture 400 ms, fermeture 0 ms ; apparaît au focus clavier ; jamais seul porteur d'une information indispensable (le déclencheur a un nom accessible).
- **EF-12 — `EmptyState`** : colonne centrée, remplissage 32, écart 12 ; pictogramme 64×64 rayon 20 (`tone: 'lime' | 'indigo' | 'neutral'` : `lime-softer`/`lime-ink-strong`, `indigo-soft`/`indigo-ink`, `canvas`/`ink-secondary`), icône 28 trait 1.8 ; titre h2 Space Grotesk 22 px 600 ; texte 15 px interligne 1.55 `ink-muted`, largeur max 480 ; action facultative (`Button`). Variante `compact` (dans un panneau) : texte seul 14 px `ink-muted` centré, remplissage 28 16 (motif « Vous avez tout lu… »).
- **EF-13 — `Skeleton`** : bloc `surface-muted`, rayon hérité (`radius` prop), animation de pulsation d'opacité 1 → 0.55 → 1 en 1,5 s, désactivée sous mouvement réduit ; `aria-hidden` ; le conteneur chargeant porte `aria-busy="true"` et un texte masqué « Chargement… ». Gabarits prêts : `SkeletonText(lines)`, `SkeletonCard`, `SkeletonStatRow`.
- **EF-14 — `ErrorState`** : même mise en page qu'`EmptyState`, pictogramme `orange-soft`/`orange-ink` icône `TriangleAlert`, titre par défaut « Impossible de charger ces données », texte par défaut « Vérifiez votre connexion puis réessayez. », bouton `outline` « Réessayer » (`onRetry`), ligne facultative `requestId` : « Référence : <code> » en `font-mono` 12 px `ink-muted` avec bouton `ghost` `sm` « Copier » (copie dans le presse-papiers, toast « Référence copiée »). Le titre est annoncé (`role="alert"` sur le conteneur au premier rendu).
- **EF-15 — `Breadcrumb`** : `<nav aria-label="Fil d'Ariane">`, liste ordonnée en ligne, texte 14 px `ink-muted` ; liens `indigo-ink` ; séparateur « / » entouré d'espaces, `aria-hidden` ; dernier élément sans lien, `aria-current="page"`, couleur `ink-muted` (identique à la maquette). Libellés longs tronqués à 40 caractères avec `…` et `title` complet.
- **EF-16 — `PageHeader`** : conteneur `flex` à retour à la ligne, `align-items: flex-end`, `justify-content: space-between`, écart 16 ; bloc titre (écart 4) : `eyebrow` (p, 14 px `ink-muted`) puis `title` (h1, Space Grotesk 34 px 600, −0.02em) ; `breadcrumb?` affiché au-dessus du sur-titre ; `actions?` à droite.
- **EF-17 — `Icon` et registre** : `packages/ui/src/icons/registry.ts` exporte une table nommée des icônes lucide utilisées par la coquille et les composants : `home` → `House`, `calendar` → `Calendar`, `programme` → `List`, `notion-map` → `Waypoints`, `global-quiz` → `Copy`, `gaps` → `Target`, `switch-formation` → `ChevronsUpDown`, `sidebar-close` → `PanelLeftClose`, `sidebar-open` → `PanelLeftOpen`, `search` → `Search`, `bell` → `Bell`, `chevron-down` → `ChevronDown`, `settings` → `SlidersHorizontal`, `pause` → `Pause`, `sign-out` → `LogOut`, `clock` → `Clock`, `book` → `Book`, `check-circle` → `CircleCheck`, `alert` → `TriangleAlert`, `plus` → `Plus`, `close` → `X`, `loader` → `Loader2`, `copy` → `ClipboardCopy`. `Icon({ name, size = 18, strokeWidth = 1.8 })`, toujours `aria-hidden="true"`.
- **EF-18 — Galerie** : `/_dev/ui/structure` (Card ×4 tons, StatRow avec 1 sombre + 2 claires « 4 notions / à consolider dans les modules 2 et 3 », « 23 notions / maîtrisées dans les modules 1 à 3 », « 17:00 / prochaine révision, dans le quiz global », ProgressBar ×4 tons, ProgressRing 86 %, Avatar « AP », Breadcrumb « Programme / Module 3 · Comptabilité générale / Cours », PageHeader « SAP S/4HANA Finance » / « Mes lacunes », registre d'icônes) et `/_dev/ui/retours` (Popover, DropdownMenu, Dialog, AlertDialog destructif, Toast ×3 tons, Tooltip, EmptyState, EmptyState compact, Skeleton, ErrorState avec référence `req_demo_0001`). `data-testid="ui-<composant>-<variante>"`.

## 6. Exigences techniques

- **ET-1** — Même organisation que SPEC-302 (`packages/ui/src/components/<Nom>/`, `cva`, `cn`, `ref` transmise). Radix est encapsulé : aucun écran n'importe `@radix-ui/*` directement (règle ESLint `no-restricted-imports` hors `packages/ui`).
- **ET-2** — Portails Radix montés dans `document.body` ; `z-index` : en-tête 30, popovers et menus 40, menu latéral en surimpression 45, dialogues 50, toasts 60, lien d'évitement 100 (jetons `z-header`, `z-popover`, `z-drawer`, `z-dialog`, `z-toast`, `z-skip` ajoutés au thème).
- **ET-3** — `toast()` s'appuie sur un petit magasin en module (`useSyncExternalStore`), sans gestionnaire d'état global (ADR-0063).
- **ET-4** — `buildFormationBreadcrumb` est une fonction pure testée ; elle n'emploie aucun texte en dur hors `messages/fr.ts` (le libellé « Programme » est passé par l'appelant ou lu depuis un dictionnaire injecté).
- **ET-5** — Accessibilité : `Dialog`/`AlertDialog` ont `aria-labelledby` et `aria-describedby` ; `ProgressBar` sans nom refusé par TypeScript (union discriminée `label | labelledBy | decorative`).
- **ET-6** — Performance : chaque primitive Radix importée seulement par son composant (pas d'import global) ; animations en CSS (`@keyframes` dans `theme.css`), sans bibliothèque d'animation.

## 7. Comportements attendus et cas limites

- **CL-1** — Clavier : `DropdownMenu` s'ouvre avec Entrée/Espace/flèche bas, le focus va au premier élément ; Échap ferme et rend le focus au déclencheur ; Tab ferme le menu.
- **CL-2** — Focus : `Dialog` piège le focus (Tab depuis le dernier élément revient au premier) ; à la fermeture le focus revient au déclencheur, ou à `returnFocusRef` si le déclencheur a disparu.
- **CL-3** — Lecteur d'écran : `ProgressRing` est lu « Notions retenues à 1 mois : 86 % » une seule fois (SVG masqué) ; `Toast` d'erreur annoncé immédiatement ; `Skeleton` non lu, « Chargement… » lu une fois.
- **CL-4** — Textes longs : titre de `StatCard` sur deux lignes sans débordement ; `Breadcrumb` tronqué (EF-15) ; titre de `Dialog` sur plusieurs lignes, bouton fermer jamais recouvert.
- **CL-5** — Responsive < 900 px : `Dialog` occupe `calc(100vw - 32px)` ; actions empilées pleine largeur ; `Popover` limité à `100vw - 32px` ; `StatRow` passe en colonne sous 480 px.
- **CL-6** — `prefers-reduced-motion: reduce` : aucune animation (dialogue, toast, pulsation, rotation).
- **CL-7** — Valeurs limites : `ProgressBar value=-5` → 0, `value=140` → 100 ; `ProgressRing value=0` → seule la piste ; `getInitials('', '')` → « ? ».
- **CL-8** — Toasts multiples : au 4e toast, le plus ancien est fermé ; un toast d'action reste 8 s et n'est pas fermé pendant le survol.
- **CL-9** — Copie de la référence refusée par le navigateur (permissions) : message « Copie impossible : sélectionnez la référence manuellement. » et texte sélectionné.

## 8. Instructions d'implémentation

1. Ajouter les dépendances Radix (§3). Commit `build(SPEC-303): ajoute les primitives Radix de structure`.
2. Implémenter `Card`, `CardHeader`, `StatCard`, `StatRow`, `ProgressBar`, `ProgressRing`, `Avatar` + `getInitials`, `PageHeader`, `Breadcrumb` + `buildFormationBreadcrumb`, registre `Icon`. Commit `feat(SPEC-303): ajoute les composants de structure`.
3. Implémenter `Popover`, `DropdownMenu`, `Dialog`, `AlertDialog`, `Tooltip`, `Toast` (+ `toast()`, `ToastProvider`). Commit `feat(SPEC-303): ajoute panneaux, menus et dialogues`.
4. Implémenter `EmptyState`, `Skeleton` (+ gabarits), `ErrorState`. Ajouter les jetons `z-*` et `@keyframes` au générateur de thème (SPEC-301) et régénérer `theme.css`. Commit `feat(SPEC-303): ajoute les états vide, chargement et erreur`.
5. Pages de galerie `/_dev/ui/structure` et `/_dev/ui/retours` (EF-18). Commit `feat(SPEC-303): complète la galerie (structure, retours)`.
6. Tests (section 12). Commit `test(SPEC-303): couvre les composants de structure et de retour`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ui/src/components/{Card,StatCard,ProgressBar,ProgressRing,Avatar,Popover,DropdownMenu,Dialog,AlertDialog,Toast,Tooltip,EmptyState,Skeleton,ErrorState,Breadcrumb,PageHeader}/…`, `packages/ui/src/icons/registry.ts`, `packages/ui/src/icons/Icon.tsx`, `packages/ui/src/navigation/breadcrumb.ts`, `apps/web/app/%5Fdev/ui/structure/page.tsx`, `apps/web/app/%5Fdev/ui/retours/page.tsx`, `apps/web/app/%5Fdev/ui/retours/Demos.tsx`, `apps/web/e2e/specs/p3/spec-303-structure-retours.spec.ts`, `packages/ui/test/integration/overlays.test.tsx`.
- **Modifiés** : `packages/ui/src/index.ts`, `packages/ui/scripts/build-theme.ts` et `packages/ui/src/styles/theme.css` (jetons `z-*`, animations), `eslint.config.js` (`no-restricted-imports` Radix), `apps/web/messages/fr.ts`, navigation de la galerie.
- **Lus / réutilisés** : composants de SPEC-302, jetons de SPEC-301.

## 10. Interface et conformité visuelle

- Mode `tokens`. Pages `/_dev/ui/structure` et `/_dev/ui/retours`.
- `data-testid` vérifiés : `ui-card-default`, `ui-card-dark`, `ui-card-lime`, `ui-card-subtle`, `ui-stat-dark`, `ui-stat-light`, `ui-progress-orange`, `ui-progress-ring`, `ui-avatar`, `ui-breadcrumb`, `ui-page-header`, `ui-popover-trigger`, `ui-popover-content`, `ui-menu-trigger`, `ui-menu-content`, `ui-dialog-trigger`, `ui-dialog`, `ui-alert-dialog`, `ui-toast-success`, `ui-tooltip-trigger`, `ui-empty`, `ui-empty-compact`, `ui-skeleton`, `ui-error`.
- Contrôles : (1) `expectTokens` — `ui-stat-dark` fond `#111113`, valeur `#C6F432` en Space Grotesk 30.6px ; `ui-card-default` bordure `#E7E6E1`, rayon 21.6px ; `ui-progress-ring` cercles `#ECECFC`/`#5B5BD6` ; `ui-avatar` fond `#5B5BD6` ; `ui-menu-content` ombre `menu`, rayon 16.2px ; `ui-popover-content` ombre `popover`, rayon 18px ; `ui-breadcrumb` 12.6px `#62626B` ; (2) structure : ordre « Programme », « Module 3 · Comptabilité générale », « Cours » du fil d'Ariane, titre h1 « Mes lacunes » précédé du sur-titre ; (4) lignes de base `dev-ui-structure.png`, `dev-ui-retours.png` et `dev-ui-retours-menu-ouvert.png`.

## 11. Critères d'acceptation

- **CA-1** — `Breadcrumb` produit « Programme / Module 3 · Comptabilité générale / Cours » avec `nav[aria-label="Fil d'Ariane"]`, liens vers le programme et le module et `aria-current="page"` sur le dernier élément (BR-NAV-04).
- **CA-2** — `Dialog`, `AlertDialog`, `DropdownMenu` et `Popover` piègent ou gèrent le focus, se ferment avec Échap et rendent le focus au déclencheur.
- **CA-3** — `StatCard`, `Card`, `ProgressBar`, `ProgressRing`, `Avatar` ont les couleurs, rayons et typographies exactes de la section 5 (styles calculés).
- **CA-4** — `toast()` affiche au plus trois messages, annonce les erreurs de manière assertive et respecte la durée de 5 000 ms (vérifiée avec l'horloge simulée).
- **CA-5** — `EmptyState`, `Skeleton` et `ErrorState` exposent respectivement le titre, `aria-busy` + « Chargement… », et `role="alert"` + « Réessayer » ; la référence se copie.
- **CA-6** — Les galeries structure et retours n'ont aucune violation axe serious/critical (menus et dialogues ouverts compris) et correspondent à leurs lignes de base.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-303] <Composant>')`) : `getInitials` (cas « Alex Perrin » → « AP », accentués, vides) ; `buildFormationBreadcrumb` ; `Breadcrumb` (rôles, troncature) ; `ProgressBar` (bornes, ARIA) ; `ProgressRing` (dasharray 248.6 pour 86 %, ± 0,1) ; `StatCard` (classes par ton) ; `Dialog` (focus initial, Échap, retour du focus) ; `AlertDialog` (focus sur Annuler, `onConfirm` asynchrone → `loading`) ; `DropdownMenu` (flèches, Échap) ; `toast` (pile de 3, durée avec `vi.useFakeTimers`, `role` selon ton) ; `Skeleton` (`aria-hidden`) ; `ErrorState` (copie, refus de copie).
- **Intégration** (`packages/ui/test/integration/overlays.test.tsx`, `describe('[SPEC-303] superpositions')`) : rendu d'une page composée (PageHeader + StatRow + Card + Dialog ouvert + Toast) dans jsdom : ordre des `z-index`, un seul `aria-modal` actif, défilement du corps bloqué pendant le dialogue puis rétabli.
- **End-to-end** (`apps/web/e2e/specs/p3/spec-303-structure-retours.spec.ts`, vidéo, horloge figée) :
  - `menus et dialogues au clavier @SPEC-303` : `/_dev/ui/retours` — ouvre le menu au clavier, parcourt, Échap ; ouvre le dialogue, Tab en boucle, Échap ; ouvre l'AlertDialog destructif, confirme ; déclenche 4 toasts (seuls 3 visibles) ; axe avec menu ouvert et dialogue ouvert.
  - `styles de structure @SPEC-303` : `/_dev/ui/structure` — `expectTokens` de la section 10 ; vérifie le fil d'Ariane.
- **Visuel** (`@SPEC-303 @visual`) : `galeries structure et retours @SPEC-303 @visual` — `toHaveScreenshot` de `dev-ui-structure.png`, `dev-ui-retours.png`, `dev-ui-retours-menu-ouvert.png` (`maxDiffPixelRatio: 0.01`, animations désactivées).
- **Non-régression** : `@SPEC-301`, `@SPEC-302`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | unitaires `[SPEC-303] Breadcrumb`, `buildFormationBreadcrumb` ; e2e `styles de structure` |
| CA-2 | unitaires `Dialog`, `AlertDialog`, `DropdownMenu` ; intégration `[SPEC-303] superpositions` ; e2e `menus et dialogues au clavier` |
| CA-3 | unitaires `StatCard`, `ProgressRing` ; e2e `styles de structure` |
| CA-4 | unitaire `toast` ; e2e `menus et dialogues au clavier` |
| CA-5 | unitaires `Skeleton`, `ErrorState` |
| CA-6 | e2e (axe) ; visuel `@SPEC-303 @visual` |

## 13. Preuves attendues

`evidence/SPEC-303/` : vidéo du parcours clavier, captures des trois lignes de base, rapport axe (menu et dialogue ouverts), `checks.json`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : aucun import direct de `@radix-ui/*` hors `packages/ui` ; README du paquet complété.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0059 (Radix pour Dialog, Popover, DropdownMenu, Tooltip ; lucide), ADR-0063 (pas d'état global), ADR-0130, ADR-0131.
- Décision créée : **ADR-0131** (complément) — `Toast` repose aussi sur Radix (`@radix-ui/react-toast`), non listé par ADR-0059, pour bénéficier de la gestion de focus et des annonces ; correspondance icônes maquette → lucide fixée par le registre EF-17.
- Décision créée : **ADR-0138 — Mouvement réduit, focus et contrastes** (durées d'animation, désactivation sous `prefers-reduced-motion`), appliquée ici et généralisée par SPEC-309.
- Décision créée : **ADR-0270 — Composants de structure et de retour : superpositions, toasts et isolation modale** — menus non modaux, `aria-modal` explicite, verrou de défilement et `inert` du fond, voile sous le panneau (49/50), toasts Radix `background`/`foreground`, jetons `z-*` et utilitaires générés, baselines des nouvelles galeries.
- Hypothèse : le dernier élément du fil d'Ariane reste `ink-muted` comme dans `Cours.dc.html`.
