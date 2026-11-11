# ADR-0060 — Rendu Markdown sécurisé

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-609

## Contexte

Cours en Markdown.

## Décision

`react-markdown` + `remark-gfm` + `rehype-sanitize` (liste blanche) ; pas de HTML brut ; formules non prises en charge en V1 (texte brut).

## Conséquences

Aucune conséquence particulière au-delà de la décision.
