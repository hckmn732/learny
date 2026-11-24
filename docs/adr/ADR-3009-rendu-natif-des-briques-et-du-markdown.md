# ADR-3009 — Rendu natif des briques et du Markdown

- **Statut** : Acceptée — complète ADR-0150 et ADR-3004
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0027, ADR-0150, ADR-1004, ADR-3002, ADR-3004, SPEC-3301

## Contexte

Les vues des briques du web (`packages/bricks/src/types/*/view.tsx`, entrée `@learny/bricks/view`)
produisent du DOM (React DOM, `@learny/ui`, `react-markdown`). L'entrée principale
`@learny/bricks` est pure (schémas, charges publiques, `gradeBrick`, vues de correction) et
exécutable sous React Native. Le contenu des cours et de nombreuses briques est du Markdown
(BR-COU-01). Le mobile V1 joue les briques du quiz de validation, du quiz global et de
l'échauffement, et affiche le cours (ADR-3002).

## Décision

1. Le mobile importe **uniquement** l'entrée `@learny/bricks` (jamais `@learny/bricks/view`) et
   écrit ses propres rendus natifs dans `apps/mobile/src/bricks/<type>/`, enregistrés dans un
   registre `nativeBrickViews` typé par `BrickType`.
2. Types rendus nativement en V1 : `text`, `resource-excerpt`, `choice-question`,
   `open-question`, `cloze`, `matching`, `ordering`, `categorization`, `recall-card`. Les types
   `instruction`, `scripted-dialogue`, `timer` et `scoring` (exercice, examen blanc, hors
   périmètre mobile) affichent une carte « Cette activité se fait sur le web » avec « Continuer
   sur le web » ; un test vérifie que le registre couvre les treize types.
3. Le Markdown est analysé par `mdast-util-from-markdown` (avec `mdast-util-gfm-table` pour les
   tableaux) et rendu par un composant maison `Markdown` : paragraphes, titres, gras, italique,
   listes, citations, code en ligne et blocs, liens (ouverts dans le navigateur intégré),
   tableaux simples (défilement horizontal). Le HTML brut est ignoré (même politique que
   `rehype-sanitize` sur le web). Aucune WebView.
4. Les gestes des jeux (association, remise en ordre, classement) existent en deux modes
   équivalents : glisser-déposer (Gesture Handler) **et** sélection par appuis successifs,
   seule voie exigée par l'accessibilité et utilisée par les tests e2e.

## Conséquences

- Deux nouvelles dépendances du mobile : `mdast-util-from-markdown`, `mdast-util-gfm-table`.
- Toute évolution d'une charge publique (`toPublic`) doit être reportée dans le rendu natif ; le
  test de couverture du registre et les exemples `brickExamples` le garantissent.
