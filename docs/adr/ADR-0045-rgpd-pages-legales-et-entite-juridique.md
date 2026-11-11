# ADR-0045 — RGPD, pages légales et entité juridique

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-806

## Contexte

L'identité légale de l'éditeur n'est pas connue du référentiel.

## Décision

Les pages légales sont des gabarits Markdown complets dont l'identité de l'éditeur provient de la configuration (`LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME`…). En l'absence de valeurs, l'application affiche « [à compléter] » et la checklist de mise en production le signale comme blocage externe documenté (pas d'invention). Cookies strictement nécessaires uniquement, pas de bandeau. Registre des traitements et liste des sous-traitants dans `docs/legal/`.

## Conséquences

La mise en production publique dépend de ces valeurs (consigné dans progress/blockers.md si absentes).
