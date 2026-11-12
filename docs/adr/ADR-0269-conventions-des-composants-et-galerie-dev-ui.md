# ADR-0269 — Conventions des composants et galerie /_dev/ui

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-302

## Contexte

SPEC-302 doit fixer des conventions durables pour @learny/ui : structure des composants, variantes, galerie de démonstration et comportement de validation des formulaires. Deux points demandent un arbitrage : la distinction entre SegmentedControl et Tabs, et le mode de validation de useZodForm (EF-14 demande mode onBlur + reValidateMode onChange, tandis que CL-8 exige la disparition de l'erreur à la frappe dès le premier blur).

## Décision

Chaque composant vit dans packages/ui/src/components/<Nom>/ avec <Nom>.tsx, <Nom>.test.tsx et index.ts, exporté par @learny/ui. Les variantes utilisent cva et la fusion de classes cn ; tout composant transmet ref, className, data-testid et les attributs aria reçus. La galerie est découpée en sections derrière ENABLE_SDD_PAGES ; les propriétés LucideIcon (fonctions) sont liées dans de petits composants clients pour rester compatible avec la frontière serveur/client de Next. SegmentedControl (boutons aria-pressed, filtre une même vue) reste distinct de Tabs (motif ARIA tablist/tab/tabpanel, change de panneau). useZodForm utilise mode onTouched et reValidateMode onChange : la première validation a lieu au blur puis chaque frappe revalide, ce qui satisfait CL-8 (reValidateMode seul ne s'applique qu'après soumission). Les lignes de base visuelles des galeries sont commitées et comparées avec maxDiffPixelRatio 0.01.

## Conséquences

Les écrans réutilisent ces composants sans redéfinir de styles ; toute nouvelle galerie suit les mêmes data-testid et cartes blanches. Les composants à icône reçoivent une icône Lucide dans un composant client. Les futures spécifications qui modifient la galerie doivent justifier la mise à jour des baselines.
