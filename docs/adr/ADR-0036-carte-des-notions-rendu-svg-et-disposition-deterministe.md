# ADR-0036 — Carte des notions : rendu SVG et disposition déterministe

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-616

## Contexte

La maquette utilise une simulation de forces maison.

## Décision

Rendu SVG dans un composant client ; simulation de forces implémentée dans `apps/web/components/notion-graph/layout.ts` (répulsion, ressorts, gravité, 420 itérations, graine fixe) sans dépendance ; positions initiales par module en cercle. Interactions impératives hors rendu React (pointer events). Données servies par `/api/v1/formations/:fid/notion-graph`.

## Conséquences

Au-delà de 400 nœuds, les étiquettes ne s'affichent qu'au zoom.
