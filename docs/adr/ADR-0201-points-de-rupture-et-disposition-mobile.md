# ADR-0201 — Points de rupture et disposition mobile

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-802, BR-PLA-02, BR-NAV-03

## Contexte

BR-PLA-02 exige un usage de 360 à 1920 px et des cibles de 44 px ; BR-NAV-03 fixe le seuil du menu à 900 px. Les maquettes n'ont pas de requêtes média ; les autres seuils et la vérification ne sont pas définis.

## Décision

- Points de rupture uniques déclarés une seule fois dans `packages/ui/src/tokens/breakpoints.ts` et le thème Tailwind : `sm` = 48rem (768 px), `nav` = 56.25rem (900 px), `lg` = 64rem (1024 px), `xl` = 80rem (1280 px), `2xl` = 90rem (1440 px). Les valeurs sont en rem de 16 px : une requête média n'est pas affectée par `html { font-size: 90% }`. Aucun autre point de rupture n'est admis ; les variantes `md` et l'ancien nom `shell` ont été remplacés, et un test statique balaie `apps/web`, `packages/ui/src` et `packages/bricks/src`.
- Sous 900 px (`nav`) : menu en surimpression modale ; la préférence mémorisée ne s'applique qu'au-delà. Sous 768 px (`sm`) : panneaux (notifications, recherche, Mon compte, tuteur, détail de la carte) en plein écran avec bouton « Fermer », barre d'actions fixe en bas des écrans d'exercice, feuilles basses pour les détails, tableau des formations en cartes, vue Jour par défaut dans l'agenda.
- Contenu limité à 90rem de large au-delà de 1440 px.
- Cibles tactiles ≥ 44 × 44 **px CSS** partout. L'échelle de 90 % rend une unité Tailwind égale à 0,9 px : la zone est donc étendue par un pseudo-élément `::before` centré de `max(100%, 44px)`, jamais par une taille visible. Seules exemptions : liens en ligne dans le texte courant (`data-touch-exempt="inline"`) et nœuds SVG de la carte des notions (`data-touch-exempt="graph-node"`, alternatives accessibles).
- Composants rangés dans un dossier par composant sous `packages/ui/src/components/` : `ResponsivePanel`, `ScrollableTable`, `BottomActionBar`, `BottomSheet` ; le hook `useBreakpoint` vit dans `packages/ui/src/hooks/`.
- `useBreakpoint` est réservé au comportement — vue Jour par défaut de l'agenda, bascule d'un Popover vers `ResponsivePanel`, icône de recherche mobile — jamais à la disposition, portée par le CSS pour éviter tout CLS.
- Vérification : matrice automatisée de tous les écrans à 360, 390, 768, 1024, 1440 et 1920 px (pas de défilement horizontal, cibles) ; comparaison mobile aux références « menu masqué » 390×844 générées depuis les maquettes, écart ≤ 12 %, par région recadrée (les maquettes débordent horizontalement).

## Conséquences

Tout nouvel écran est ajouté à l'inventaire de la matrice responsive.
