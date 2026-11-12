# ADR-0270 — Composants de structure et de retour : superpositions, toasts et isolation modale

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-303, ADR-0059, ADR-0131, ADR-0138, ADR-0268, ADR-0269

## Contexte

SPEC-303 ajoute les composants de structure et de retour de @learny/ui. Plusieurs points d'implémentation ne sont pas tranchés par la spécification ni par ADR-0059 : la primitive des toasts, le comportement des menus vis-à-vis de l'arbre d'accessibilité, la manière d'isoler le fond d'un dialogue modal et la priorité de l'axe sur les animations d'entrée.

## Décision

Radix fournit Popover, DropdownMenu, Dialog, AlertDialog, Tooltip et Toast (@radix-ui/react-toast), encapsulés dans packages/ui. Les menus sont non modaux (modal=false) afin de conserver les repères de page (main, h1) dans l'arbre d'accessibilité pendant un test axe menu ouvert. Les dialogues et alertes utilisent aria-modal=true explicite (Radix 1.3 s'appuie sinon sur aria-hidden), verrouillent le défilement du corps et posent inert sur les autres enfants de body pendant l'ouverture ; l'effet est restauré à la fermeture. Le voile est sous le panneau (z-index 49 contre 50) pour que les couleurs calculées du panneau restent celles du produit. Les toasts utilisent type=background (poli) pour succès et neutre, type=foreground (assertif) pour erreur, car Radix mappe foreground sur aria-live=assertive. Les animations d'entrée (150 ms) sont désactivées sous prefers-reduced-motion; les tests axe attendent un état sans animation. Les jetons z-header, z-popover, z-drawer, z-dialog, z-toast et z-skip sont ajoutés au générateur de thème et exposés en utilitaires z-*. Les baselines visuelles créées sont uniquement celles des nouvelles galeries /_dev/ui/structure et /_dev/ui/retours.

## Conséquences

Les écrans réutilisent ces primitives sans importer Radix. Toute nouvelle superposition doit respecter l'isolation modale et l'ordre z-*. Les tests axe des dialogues doivent se dérouler sans animation en cours (émulation de mouvement réduit ou attente des animations).
