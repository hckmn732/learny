---
id: SPEC-302
title: Composants de base I : actions et saisie
phase: P3
priority: V1
depends_on: [SPEC-301]
business_rules: []
screens: []
adrs: [ADR-0059, ADR-0064]
visual: tokens
---

# SPEC-302 — Composants de base I : actions et saisie

## 1. Objectif

Livrer dans `@learny/ui` les composants d'action et de saisie réutilisés par tous les écrans — `Button`, `IconButton`, `Link`, `TextField`, `Textarea`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `Tabs`, `Chip`, `Badge`, `CountBadge`, `FormField` — fidèles aux maquettes, accessibles, et présentés dans la galerie `/_dev/ui` (sections « Actions » et « Saisie »).

## 2. Contexte

Les écrans n'ont pas le droit de définir leurs propres boutons, champs ou onglets (`docs/engineering/conventions.md` §4). Les styles sont repris des maquettes : boutons (`Main.dc.html`, `Lacunes.dc.html`, `Parametres.dc.html`, `Inscription.dc.html`), interrupteurs (`Parametres.dc.html`, fonction `sw`), puces de choix (`Inscription.dc.html`, fonction `chip`), filtres en pilule (`Lacunes.dc.html`), contrôles segmentés (filtre du panneau de notifications, onglets « Mes formations » de `Main.dc.html`, onglets de `Parametres.dc.html`, « Affichage » de `Agenda.dc.html`). Les formulaires suivent ADR-0064 (`react-hook-form` + Zod, erreur sous le champ en `role="alert"`).

## 3. Dépendances

- **SPEC-301** : jetons, `theme.css`, `cn`, galerie `/_dev/ui`.
- Bibliothèques (dernières versions stables) : `@radix-ui/react-tabs`, `@radix-ui/react-switch`, `@radix-ui/react-slot`, `class-variance-authority`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `zod` (déjà présent). Aucune variable d'environnement.

## 4. Règles métier couvertes

Aucune règle `BR-…` n'est attribuée à cette spécification par le catalogue. Elle sert BR-PLA-03 (accessibilité) indirectement via les rôles ARIA, vérifiés en détail par SPEC-309.

## 5. Exigences fonctionnelles

Valeurs en px maquette (converties en rem par les classes Tailwind de SPEC-301 : `min-h-44` = 2.75rem, etc.).

- **EF-1 — `Button`** : props `variant: 'lime' | 'dark' | 'outline' | 'ghost' | 'danger' | 'outline-on-dark'` (défaut `dark`), `size: 'sm' | 'md' | 'lg' | 'xl'` (défaut `md`), `fullWidth?: boolean`, `loading?: boolean`, `leadingIcon?`, `trailingIcon?: LucideIcon`, `asChild?: boolean` (Radix Slot, pour rendre un `<a>`/`next/link`), et attributs natifs de `<button>` (`type` vaut `button` par défaut).
  - Variantes : `lime` fond `lime`, texte `ink`, graisse 700 ; `dark` fond `ink`, texte `white`, 700 ; `outline` fond `surface`, bordure 1 px `border-strong`, texte `ink`, 600 ; `ghost` fond transparent, texte `ink-muted`, 600 ; `danger` fond transparent, texte `danger`, 600 ; `outline-on-dark` fond transparent, bordure 1 px `dark-500`, texte `white`, 600.
  - Tailles : `sm` hauteur min 40, remplissage horizontal 14, rayon 10, texte 13 ; `md` 44 / 16 / 12 / 14 ; `lg` 48 / 20 / 14 / 15 ; `xl` 50 / 20 / 14 / 15 (bouton de soumission pleine largeur des formulaires d'authentification). Icônes 16 px, trait 2.2, écart 8.
  - États : survol `lime` → `brightness-95`, `dark` → fond `dark-700`, `outline` → bordure `ink`, `ghost`/`danger` → fond `canvas` ; `disabled` → opacité 0.55, `cursor-not-allowed` ; `loading` → `aria-busy="true"`, `disabled`, icône `Loader2` animée (rotation désactivée sous `prefers-reduced-motion`), libellé conservé.
- **EF-2 — `IconButton`** : props `label: string` (obligatoire, devient `aria-label`), `icon: LucideIcon`, `tone: 'light' | 'dark'` (défaut `light`), `size: 'md' | 'sm' | 'xs'`, `badge?: ReactNode`. `light` : fond `surface`, bordure 1 px `border`, texte `ink` ; `dark` : fond transparent, bordure 1 px `dark-600`, texte `on-dark-muted`. Tailles : `md` 42×42 rayon 12 icône 18 ; `sm` 32×32 rayon 9 icône 16 ; `xs` 28×28 rayon 8 icône 14. Le badge est positionné en haut à droite (utilisé par la cloche, SPEC-305/306).
- **EF-3 — `Link`** : enveloppe `next/link` ; variantes `inline` (couleur `indigo-ink`, survol `indigo-ink-hover`, soulignement au survol), `strong` (idem, graisse 600 ou 700 selon `weight`), `subtle` (`ink-muted`). Un lien externe (`href` commençant par `http`) reçoit `target="_blank" rel="noopener noreferrer"` et le texte masqué « (nouvel onglet) ».
- **EF-4 — `TextField`** : props `label`, `hint?`, `error?`, `variant: 'form' | 'search'`, `leadingIcon?`, et attributs natifs d'`<input>`. `form` : hauteur min 48, remplissage 0 14, bordure 1 px `border-strong`, rayon 12, fond `surface`, texte 15 `ink`, espace réservé `ink-muted`. `search` : hauteur min 42, remplissage `0 14 0 42`, bordure 1 px `border`, rayon 12, texte 14, icône 18 `ink-muted` positionnée à 14 px du bord gauche, centrée verticalement. Libellé 13 px graisse 700 au-dessus (écart 6) ; `hint` 12 px `ink-muted` ; `error` 13 px graisse 600 `orange-ink` avec `role="alert"`, champ `aria-invalid="true"`, bordure `orange-ink`, `aria-describedby` reliant indice et erreur. Libellé visuellement masqué possible (`hideLabel`), jamais absent.
- **EF-5 — `Textarea`** : même habillage que `TextField form`, hauteur min 96, remplissage 12 14, interligne 1.5, redimensionnement vertical ; compteur facultatif `maxLength` affiché « n / max » 12 px `ink-muted`, annoncé `aria-live="polite"` à 90 % du maximum.
- **EF-6 — `Select`** : `<select>` natif, même habillage que `TextField form` (fond `surface`, remplissage 0 12, flèche native), options fournies en `options: { value: string; label: string; disabled?: boolean }[]` (aucun enfant inconnu dans le `<select>`).
- **EF-7 — `Checkbox`** : `<input type="checkbox">` natif 18×18, `accent-color: ink`, libellé cliquable à droite (texte 13 px, interligne 1.5, couleur `ink-secondary`, écart 10), états `checked`, `indeterminate`, `disabled`, `error`.
- **EF-8 — `Switch`** : primitive Radix (`role="switch"`, `aria-checked`), props `checked`, `onCheckedChange`, `label` (ou `aria-labelledby`), `description?`, `locked?: boolean`. Piste 46×28, remplissage 3, rayon `full`, fond `ink` si actif sinon `border-strong` ; bouton 22×22 rond, `lime` si actif sinon `surface`, ombre `knob`, translation 18 px (transition 150 ms, nulle sous mouvement réduit). `locked` : `aria-disabled="true"`, opacité 0.55, curseur par défaut, la valeur ne change pas (cas « Application » verrouillé de SPEC-708).
- **EF-9 — `SegmentedControl`** : groupe de boutons bascule exclusifs (`role="group"` + `aria-label`, chaque option `aria-pressed`), props `options: { value; label; count?: number; icon? }[]`, `value`, `onValueChange`, `variant: 'soft' | 'solid'`, `size: 'sm' | 'md'`, `fullWidth?`.
  - `soft` (filtre des notifications, onglets « Mes formations ») : conteneur fond `canvas`, rayon 12, remplissage 4, écart 4 ; option hauteur min 32 (`sm`) ou 36 (`md`), remplissage 0 12, rayon 9, texte 13 ; sélectionnée : fond `surface`, texte `ink`, graisse 700, ombre `segment` ; non sélectionnée : transparent, `ink-muted`, 500. Compteur 12 px graisse 700 à 6 px du libellé.
  - `solid` (« Affichage » de l'agenda, « Par module / Par maîtrise » de la carte) : conteneur fond `surface`, bordure 1 px `border`, rayon 12, remplissage 4, écart 4 ; option hauteur min 34 (`sm`) ou 40 (`md`), remplissage 0 12/14, rayon 9/10, texte 13/14 ; sélectionnée : fond `ink`, texte `white`, 600 ; non sélectionnée : transparent, `ink-muted`, 500.
  - Clavier : Tab entre dans le groupe sur l'option sélectionnée (tabindex itinérant), flèches gauche/droite déplacent le focus et la sélection (boucle), Début/Fin vont aux extrémités.
- **EF-10 — `Tabs`** : primitive Radix Tabs (`role="tablist"`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`), composants `Tabs`, `TabsList` (props `variant: 'soft' | 'solid'`, `aria-label` obligatoire), `TabsTrigger`, `TabsContent`. Mêmes visuels que EF-9 : `soft` = onglets « Mes formations » (rayon conteneur 12, onglet hauteur 36, rayon 9, texte 13, sélectionné graisse 600 + ombre `segment`) ; `solid` = onglets de `Parametres.dc.html` (conteneur rayon 14, onglet hauteur 40, remplissage 0 14, rayon 10, texte 14, sélectionné fond `ink` texte `white` 600). Activation automatique au focus (flèches), synchronisation facultative avec l'URL via `value`/`onValueChange` (utilisé par SPEC-707 pour `#profil` …).
- **EF-11 — `Chip`** : bouton bascule non exclusif (`aria-pressed`), props `pressed`, `onPressedChange`, `shape: 'rounded' | 'pill'`, `size: 'sm' | 'md'`, `count?: number`, `ariaLabel?` (ex. « Lundi » pour « L »). `rounded` (choix du rythme, `Inscription.dc.html`) : hauteur min 40, largeur min 44, remplissage 0 14, rayon 12, texte 14 ; actif : fond `ink`, bordure `ink`, texte `white`, 700 ; inactif : fond `surface`, bordure `border-strong`, texte `ink`, 500. `pill` `md` (filtres de `Lacunes.dc.html`) : hauteur min 40, rayon `full`, texte 14, actif fond `ink` sans bordure 700, inactif bordure `border-strong` 500 ; compteur : pilule 12 px graisse 700, largeur min 20, remplissage 1 6, fond `lime`/texte `ink` si actif, `canvas`/`ink-secondary` sinon. `pill` `sm` (filtres de `Carte.dc.html`) : hauteur min 36, remplissage 0 12, texte 13, inactif texte `ink-muted`.
- **EF-12 — `Badge`** (pastille de statut, non interactive) : props `tone: 'neutral' | 'lime' | 'lime-soft' | 'indigo' | 'green' | 'orange' | 'violet' | 'on-dark' | 'default-model'`, `size: 'sm' | 'md'`. `md` : remplissage 4 10, rayon `full`, texte 12, graisse 700. Couleurs : `neutral` `canvas`/`ink-secondary` (graisse 600) ; `lime` `lime`/`ink` ; `lime-soft` `lime-softer`/`lime-ink-strong` ; `indigo` `indigo-soft`/`indigo-ink-strong` ; `green` `green-soft`/`green-ink` ; `orange` `orange-soft`/`orange-ink` ; `violet` `violet-soft`/`violet-ink` ; `on-dark` `dark-700`/`lime` (graisse 600) ; `default-model` `surface-muted`/`ink-secondary`. `sm` : remplissage 2 8, graisse 600.
- **EF-13 — `CountBadge`** (compteur du menu latéral) : remplissage 1 8, rayon `full`, texte 12, graisse 700 ; `tone: 'lime' | 'orange-on-dark'` (`lime`/`ink` ; `orange-dark`/`orange-on-dark`) ; `value` > 99 affiché « 99+ ».
- **EF-14 — `FormField` et `Form`** : `Form` = `FormProvider` de `react-hook-form` + `<form noValidate>` ; `useZodForm(schema, options)` = `useForm({ resolver: zodResolver(schema), mode: 'onBlur', reValidateMode: 'onChange' })`. `FormField name render` relie `id`, `label`, `aria-invalid`, `aria-describedby` et affiche l'erreur Zod (message en français fourni par le schéma). `FormError` (erreur globale) : paragraphe `role="alert"`, remplissage 10 12, rayon 12, fond `orange-soft`, texte 13 `orange-ink` 600. À la soumission invalide, le focus va au premier champ en erreur.
- **EF-15 — Galerie** : `/_dev/ui/actions` (Button : 6 variantes × 4 tailles × états normal/survol forcé/désactivé/chargement ; IconButton ; Link ; Chip ; Badge ; CountBadge) et `/_dev/ui/saisie` (TextField form/search/erreur, Textarea avec compteur, Select, Checkbox, Switch actif/inactif/verrouillé, SegmentedControl soft/solid, Tabs soft/solid avec panneaux, formulaire d'exemple `react-hook-form` : e-mail obligatoire « Saisissez une adresse e-mail valide. », mot de passe ≥ 12 « Le mot de passe doit faire 12 caractères au moins. »). Chaque exemple porte `data-testid="ui-<composant>-<variante>"`.

## 6. Exigences techniques

- **ET-1** — Fichiers `packages/ui/src/components/<Nom>/<Nom>.tsx`, `<Nom>.test.tsx`, `index.ts` ; exports nommés depuis `@learny/ui`. Variantes avec `cva`, fusion de classes avec `cn`. Composants clients marqués `'use client'` seulement s'ils ont de l'état ou des gestionnaires (Switch, SegmentedControl, Tabs, Textarea à compteur, FormField).
- **ET-2** — Tous les composants transmettent `ref` (`forwardRef` ou prop `ref` de React 19), `className` (fusionnée en dernier), `data-testid` et les attributs `aria-*` reçus.
- **ET-3** — Signatures publiques (TypeScript) :
  - `Button(props: ButtonProps)` avec `ButtonProps = ComponentPropsWithRef<'button'> & VariantProps<typeof buttonVariants> & { loading?: boolean; leadingIcon?: LucideIcon; trailingIcon?: LucideIcon; asChild?: boolean; fullWidth?: boolean }`.
  - `SegmentedControl<T extends string>(props: { options: SegmentOption<T>[]; value: T; onValueChange(value: T): void; 'aria-label': string; variant?: 'soft' | 'solid'; size?: 'sm' | 'md'; fullWidth?: boolean })`.
  - `useZodForm<S extends z.ZodTypeAny>(schema: S, options?: UseFormProps<z.infer<S>>)`.
- **ET-4** — Aucune couleur, taille ou rayon hors classes de jetons ; pas de style en ligne (règle ESLint de SPEC-301).
- **ET-5** — Icônes : `lucide-react`, import nommé (arbre secoué), taille et trait passés en props (`size={16} strokeWidth={2.2}` pour les boutons).
- **ET-6** — Accessibilité : cible minimale 40 px maquette pour les contrôles (`sm`) ; les contrôles de 32 px (`SegmentedControl soft sm`) sont autorisés car ils satisfont WCAG 2.5.8 (≥ 24 px CSS) ; libellés obligatoires vérifiés par TypeScript (`label` requis) et par un test.
- **ET-7** — Performance : aucune dépendance supplémentaire hors liste ; JS ajouté au bundle client de la galerie < 35 Ko gzip pour l'ensemble de ces composants.

## 7. Comportements attendus et cas limites

- **CL-1** — Double clic sur un `Button` `loading` : le second clic est ignoré (bouton désactivé pendant le chargement).
- **CL-2** — Libellé très long (80 caractères) dans `Button`, `Chip`, `SegmentedControl` : retour à la ligne autorisé pour `Button` (`text-balance`, hauteur croissante), troncature avec `…` et `title` pour les options de `SegmentedControl` en `fullWidth`.
- **CL-3** — Clavier : `Switch` bascule avec Espace et Entrée ; `Chip` avec Espace/Entrée ; `Tabs` et `SegmentedControl` avec les flèches (boucle), Début, Fin ; l'ordre de tabulation suit l'ordre visuel.
- **CL-4** — Lecteur d'écran : `Switch` annonce « <libellé>, interrupteur, activé/désactivé » ; `SegmentedControl` annonce « bouton bascule, enfoncé » ; un `IconButton` sans `label` ne compile pas.
- **CL-5** — Focus visible : anneau `focus-ring` (3 px `indigo`, décalage 2 px) sur tous les contrôles, y compris sur fond sombre (`outline-on-dark`, `IconButton tone="dark"`).
- **CL-6** — `prefers-reduced-motion: reduce` : pas de transition du bouton d'interrupteur ni de rotation de `Loader2` (remplacée par un point fixe et le texte masqué « Chargement… »).
- **CL-7** — Responsive < 900 px : `SegmentedControl fullWidth` répartit les options à parts égales ; à 360 px les options trop longues passent sur plusieurs lignes sans débordement horizontal ; `Button fullWidth` occupe 100 %.
- **CL-8** — Erreur de formulaire : l'erreur Zod s'affiche au blur ; corrigée, elle disparaît à la frappe ; la soumission invalide met le focus sur le premier champ en erreur et l'annonce via `role="alert"`.
- **CL-9** — `Select` avec option désactivée (ex. « DeepSeek · ma clé (non qualifié) ») : visible mais non sélectionnable.

## 8. Instructions d'implémentation

1. Ajouter les dépendances (ET-1, §3) à `packages/ui`. Commit `build(SPEC-302): ajoute Radix, cva et lucide`.
2. Implémenter `Button`, `IconButton`, `Link` avec `cva` (tables de variantes EF-1 à EF-3). Commit `feat(SPEC-302): ajoute les composants d'action`.
3. Implémenter `TextField`, `Textarea`, `Select`, `Checkbox`, `FormField`, `Form`, `FormError`, `useZodForm`. Commit `feat(SPEC-302): ajoute les champs et formulaires`.
4. Implémenter `Switch` (Radix), `SegmentedControl` (tabindex itinérant maison), `Tabs` (Radix), `Chip`, `Badge`, `CountBadge`. Commit `feat(SPEC-302): ajoute bascules, onglets et pastilles`.
5. Créer `apps/web/app/%5Fdev/ui/actions/page.tsx` et `saisie/page.tsx` (EF-15) ; ajouter les entrées à la navigation de la galerie. Commit `feat(SPEC-302): complète la galerie (actions, saisie)`.
6. Tests (section 12). Commit `test(SPEC-302): couvre les composants d'action et de saisie`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ui/src/components/{Button,IconButton,Link,TextField,Textarea,Select,Checkbox,Switch,SegmentedControl,Tabs,Chip,Badge,CountBadge,Form}/…` (composant, test, index), `packages/ui/src/forms/use-zod-form.ts`, `apps/web/app/%5Fdev/ui/actions/page.tsx`, `apps/web/app/%5Fdev/ui/saisie/page.tsx`, `apps/web/app/%5Fdev/ui/saisie/ExampleForm.tsx`, `apps/web/e2e/specs/p3/spec-302-actions-saisie.spec.ts`, `packages/ui/test/integration/components-render.test.tsx`.
- **Modifiés** : `packages/ui/src/index.ts` (exports), `packages/ui/package.json`, `apps/web/app/%5Fdev/ui/layout.tsx` (navigation), `apps/web/messages/fr.ts` (libellés de la galerie et messages d'erreur de l'exemple).
- **Lus / réutilisés** : jetons et `cn` (SPEC-301), `@learny/testing` (`expectTokens`, axe).

## 10. Interface et conformité visuelle

- Mode `tokens`. Pages `/_dev/ui/actions` et `/_dev/ui/saisie` ; en-tête de page (sur-titre « Galerie du design system », titre « Actions » / « Saisie ») puis une `Card` blanche par composant (titre h2 18 px 600) contenant ses variantes étiquetées.
- `data-testid` vérifiés : `ui-button-lime-md`, `ui-button-dark-md`, `ui-button-outline-md`, `ui-button-ghost-md`, `ui-button-danger-md`, `ui-button-outline-on-dark-md`, `ui-icon-button-light`, `ui-icon-button-dark`, `ui-textfield-form`, `ui-textfield-search`, `ui-textfield-error`, `ui-switch-on`, `ui-switch-off`, `ui-switch-locked`, `ui-segmented-soft`, `ui-segmented-solid`, `ui-tabs-soft`, `ui-tabs-solid`, `ui-chip-rounded`, `ui-chip-pill`, `ui-badge-<tone>`, `ui-count-badge-lime`, `ui-count-badge-orange-on-dark`, `ui-example-form`.
- Contrôles : (1) `expectTokens` — `ui-button-lime-md` fond `#C6F432`, texte `#111113`, graisse 700, rayon 10.8px calculés (12 × 0,9), hauteur min 39.6px ; `ui-button-outline-md` bordure `#DAD9D3` ; `ui-switch-on` piste `#111113`, bouton `#C6F432` ; `ui-segmented-soft` conteneur `#F4F4F1`, option sélectionnée fond `#FFFFFF` et ombre `segment` ; `ui-tabs-solid` onglet sélectionné fond `#111113` ; `ui-textfield-form` bordure `#DAD9D3`, hauteur 43.2px ; (2) structure : présence et ordre des cartes ; (4) lignes de base `dev-ui-actions.png` et `dev-ui-saisie.png` (`maxDiffPixelRatio: 0.01`).

## 11. Critères d'acceptation

- **CA-1** — Les six variantes et quatre tailles de `Button` ont exactement les couleurs, rayons, hauteurs et graisses de EF-1 (styles calculés).
- **CA-2** — `Switch` expose `role="switch"` et `aria-checked`, bascule à Espace, reste inchangé et `aria-disabled` quand `locked`.
- **CA-3** — `Tabs` respecte le motif ARIA (tablist/tab/tabpanel, `aria-selected`, flèches qui bouclent, un seul onglet dans l'ordre de tabulation) ; `SegmentedControl` expose `aria-pressed` et le tabindex itinérant.
- **CA-4** — Le formulaire d'exemple affiche les erreurs Zod sous les champs en `role="alert"`, avec `aria-invalid` et `aria-describedby`, et place le focus sur le premier champ en erreur à la soumission.
- **CA-5** — Les galeries `/_dev/ui/actions` et `/_dev/ui/saisie` n'ont aucune violation axe serious/critical et correspondent à leurs lignes de base.
- **CA-6** — Aucun composant n'utilise de couleur, taille ou rayon hors jetons (lint vert, recherche de littéraux hexadécimaux nulle dans `packages/ui/src/components`).

## 12. Plan de tests

- **Unitaires** (Testing Library + `user-event`, un `describe('[SPEC-302] <Composant>')` par fichier) : `Button` (classes par variante/taille, `type="button"` par défaut, `loading` → `aria-busy` et désactivé, `asChild` rend un `<a>`) ; `IconButton` (`aria-label`, badge) ; `Link` (externe → `target` et `rel`) ; `TextField` (association libellé, erreur → `role="alert"`, `aria-invalid`, `aria-describedby`) ; `Textarea` (compteur, annonce à 90 %) ; `Select` (options, désactivée) ; `Checkbox` ; `Switch` (clic, Espace, `locked`) ; `SegmentedControl` (flèches, Début/Fin, `aria-pressed`, tabindex) ; `Tabs` (flèches, panneaux) ; `Chip` (`aria-pressed`, compteur) ; `CountBadge` (« 99+ ») ; `useZodForm` (erreurs, focus).
- **Intégration** (`packages/ui/test/integration/components-render.test.tsx`, `describe('[SPEC-302] rendu serveur')`) : rendu `renderToString` de chaque composant sans erreur ni avertissement d'hydratation ; snapshot des classes générées pour chaque variante (garde-fou contre une dérive des jetons).
- **End-to-end** (`apps/web/e2e/specs/p3/spec-302-actions-saisie.spec.ts`, vidéo) :
  - `parcours clavier des contrôles @SPEC-302` : sur `/_dev/ui/saisie`, Tab jusqu'aux onglets `solid`, flèche droite ×3 (boucle vérifiée), Tab jusqu'au `Switch`, Espace (état vérifié), Tab vers le `SegmentedControl` soft, flèches, puis formulaire d'exemple soumis vide → erreurs et focus sur l'e-mail ; axe sans violation.
  - `styles calculés des actions @SPEC-302` : `expectTokens` sur les `data-testid` de la section 10.
- **Visuel** (`@SPEC-302 @visual`) : `galeries actions et saisie @SPEC-302 @visual` — `toHaveScreenshot('dev-ui-actions.png')` et `toHaveScreenshot('dev-ui-saisie.png')`, pleine page, `maxDiffPixelRatio: 0.01`, horloge figée.
- **Non-régression** : `@SPEC-301`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | unitaire `[SPEC-302] Button` ; e2e `styles calculés des actions` |
| CA-2 | unitaire `[SPEC-302] Switch` ; e2e `parcours clavier des contrôles` |
| CA-3 | unitaires `[SPEC-302] Tabs`, `[SPEC-302] SegmentedControl` ; e2e `parcours clavier des contrôles` |
| CA-4 | unitaire `[SPEC-302] useZodForm` ; e2e `parcours clavier des contrôles` |
| CA-5 | e2e (axe) ; visuel `@SPEC-302 @visual` |
| CA-6 | intégration `[SPEC-302] rendu serveur` (snapshot de classes) ; lint |

## 13. Preuves attendues

`evidence/SPEC-302/` : vidéo du parcours clavier, captures `dev-ui-actions.png`, `dev-ui-saisie.png`, rapport axe, `checks.json`, taille du bundle de la galerie.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), plus : tous les composants exportés par `@learny/ui` avec un `README.md` du paquet à jour (tableau des props) ; lignes de base commitées.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0059 (Radix pour Tabs et Switch, lucide), ADR-0064 (`react-hook-form` + Zod, erreur `role="alert"`), ADR-0034, ADR-0130 (classes de jetons).
- Décision créée : **ADR-0131 — Conventions des composants et galerie /_dev/ui** : `cva` + `cn`, un dossier par composant, `data-testid` transmis, galerie par sections derrière `ENABLE_SDD_PAGES`, `SegmentedControl` (boutons `aria-pressed`) distinct de `Tabs` (motif ARIA tabs) selon que le contrôle filtre une même vue ou change de panneau.
- Hypothèses : le bouton destructeur plein n'existe pas dans les maquettes ; la confirmation d'une action destructrice utilise `dark` dans `AlertDialog` (SPEC-303). Les hauteurs 42 px des maquettes (bandeau de l'accueil) sont servies par `md` (44 px), plus favorable aux cibles tactiles (BR-PLA-02).
