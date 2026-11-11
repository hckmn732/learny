# ADR-0131 — Conventions des composants et galerie UI

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-301 à SPEC-303)
- **Date** : 2026-11-11
- **Liens** : SPEC-301, SPEC-302, SPEC-303

## Contexte

Les composants du design system doivent partager variants, accessibilité et visualisation. Les maquettes emploient des contrôles qui ressemblent à des onglets mais n'ont pas tous la même sémantique.

## Décision

Chaque composant vit dans un dossier dédié, expose ses variants via `cva`, compose les classes par `cn`, transmet `data-testid`, `ref` et les attributs ARIA pertinents. `Tabs` utilise le motif ARIA tabs lorsqu'il change de panneau ; `SegmentedControl` utilise des boutons `aria-pressed` lorsqu'il filtre une même vue. Les primitives de superposition s'appuient sur Radix : Dialog, Popover, DropdownMenu, Tooltip et Toast (`@radix-ui/react-toast`). La galerie `/_dev/ui` classe les composants par fonction, montre leurs états et reste derrière `ENABLE_SDD_PAGES` hors production. Les icônes visibles passent par le registre lucide de SPEC-303, avec une correspondance stable aux maquettes.

## Conséquences

Un écran ne recrée pas localement un bouton, un champ, un onglet, un toast ou une icône. Les tests de galerie vérifient focus, clavier, états et jetons avant réutilisation dans les parcours produit.
