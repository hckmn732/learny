# ADR-0130 — Jetons de design et thème Tailwind fermé

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-301 à SPEC-303)
- **Date** : 2026-11-11
- **Liens** : SPEC-301, SPEC-302, SPEC-303

## Contexte

Les maquettes possèdent une échelle de 90 % et des valeurs visuelles précises. Une palette Tailwind ouverte permettrait des couleurs et espacements hors design system, difficiles à contrôler automatiquement.

## Décision

Les jetons nommés par rôle et composant dans SPEC-301 sont la seule source des couleurs, polices, rayons et espaces. La base d'espacement Tailwind est `--spacing: 0.0625rem`, soit un pixel CSS avant l'échelle typographique ; les espaces de noms de thème Tailwind non utilisés sont réinitialisés afin de refuser les valeurs arbitraires. Les points de rupture sont exprimés en pixels, parce que le viewport de référence est mesuré en pixels ; les dimensions typographiques et de composants sont en rem selon ADR-0034. Le contour de focus reste défini en pixels pour conserver une épaisseur perceptible malgré le zoom typographique. Une extraction de jetons depuis les maquettes et les tests `expectTokens` vérifient les valeurs effectives.

## Conséquences

Les écrans et composants importent les jetons de `@learny/ui` ; un ajout de valeur doit passer par le registre et ses tests. Les classes Tailwind non autorisées échouent au contrôle de style.
