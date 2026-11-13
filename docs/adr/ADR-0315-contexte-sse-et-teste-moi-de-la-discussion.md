# ADR-0315 — Contexte, SSE et Teste-moi de la discussion

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : —

## Contexte

SPEC-610 demande un flux toUIMessageStreamResponse, mais packages/services ne peut pas importer un SDK de fournisseur (BR-IA-09). Le chapitre d'une discussion n'a pas de colonne dédiée et la lacune du module peut différer de celle du chapitre affiché.

## Décision

Le service produit le protocole SSE de messages UI (chunks data: JSON) sans importer ai ; la route pose les en-têtes text/event-stream. Le chapitre d'ouverture est conservé dans le contexte jsonb du message d'accueil, ce qui évite une migration non prévue. La lacune suivie est la plus faible du chapitre sélectionné, cohérente avec la carte tuteur et le jeu de démonstration. Le scénario de fixture est choisi par le code à partir de la suite ou du texte normalisé, jamais par un marqueur fourni par l'apprenant.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
