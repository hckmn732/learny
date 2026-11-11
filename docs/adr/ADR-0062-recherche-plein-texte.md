# ADR-0062 — Recherche plein texte

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-112, SPEC-212

## Contexte

Recherche globale.

## Décision

Postgres FTS (`simple` + `unaccent`) et trigrammes pour la tolérance aux fautes ; fonction SQL `search_user_content` ; pas de moteur externe.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
