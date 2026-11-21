# ADR-2017 — Contrat OpenAPI enrichi sans modifier le JSON servi

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2002

## Contexte

SPEC-2002 demande que apps/api/openapi.json egale api/openapi.yaml converti en JSON prive de x-learny. Le plan enrichit aussi le document avec des schemas nommes references par $ref, ce qui change la forme du JSON servi et donc une assertion de contrat existante.

## Décision

apps/api/openapi.json reste strictement inchange : le contrat servi ne bouge pas (invariant ADR-1001/ADR-2008). api/openapi.yaml porte les extensions x-learny et les schemas nommes, et l egalite semantique entre les deux documents est prouvee par tools/contract/compat.mjs (resolution des $ref, x-learny ignore), verifiee en test unitaire et en integration contre l API vivante.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
