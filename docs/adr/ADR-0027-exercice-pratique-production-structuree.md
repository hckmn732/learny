# ADR-0027 — Exercice pratique : production structurée

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-501, SPEC-613

## Contexte

La maquette d'exercice montre une saisie en tableau avec contrôle d'équilibre ; le catalogue ne prévoit que texte/fichier/lien.

## Décision

La brique `instruction` accepte `production.kind ∈ {text, file, link, table}`. Pour `table` : colonnes `{key, label, type: text|number|select, options?}`, lignes min/max, et contrôles facultatifs `{type:'sum_equal', numberColumn, groupColumn, left:[valeurs], right:[valeurs]}` évalués en direct par le code. Barème sur 10 par critères ; 2 indices max (−1 point chacun).

## Conséquences

Le tuteur reste seul juge des critères qualitatifs.
