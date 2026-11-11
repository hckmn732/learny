# ADR-0057 — Extraction des apports

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-509, SPEC-510

## Contexte

Bibliothèques à fixer.

## Décision

PDF : `unpdf` (texte par page) + envoi du PDF à l'API Files d'Anthropic quand le fournisseur est Anthropic ; pages web : `@mozilla/readability` + `linkedom` après récupération côté serveur (timeout 15 s, 5 Mo max, respect de robots.txt) ; YouTube : récupération des sous-titres publics (bibliothèque `youtubei.js`), échec explicite si aucun sous-titre ; images : lecture par le modèle `light` avec vision. Découpage : ~800 tokens, chevauchement 100, sur limites de paragraphes.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
