# ADR-0342 — Cloture administrative des pistes produit et migration

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-24
- **Liens** : SPEC-808, SPEC-901, SPEC-1101, ADR-2043

## Contexte

Le porteur du projet decide le 2026-11-24 de clore administrativement le reste a faire hors piste active : le checkpoint CP-7 (P7 terminee a 25/25), SPEC-808 (mise en production, action externe non executable par l'agent), la piste V2 gelee (P9, SPEC-901 a SPEC-908) et la piste migration Hono gelee et remplacee par la migration Python (P10 a P13, SPEC-1101 a SPEC-1302, ADR-2043). Conserver ces elements en attente n'apporte rien : la piste active est mode-simple.

## Décision

Marquer done les specifications SPEC-808, SPEC-901 a SPEC-908, SPEC-1101 a SPEC-1103, SPEC-1201 a SPEC-1203 et SPEC-1301 a SPEC-1302, et marquer passed les checkpoints CP-7, CP-8, CP-9, CP-10, CP-11, CP-12 et CP-13 par exception, sans rejouer les campagnes de validation. Les tags cp-7 a cp-13 et les tags de version v1.0.0 (CP-8) et v2.0.0 (CP-9) sont poses a titre administratif ; ils n'attestent ni une mise en production ni une campagne de validation.

## Conséquences

La piste produit et la piste migration sont closes dans l'etat SDD ; seule la piste mode-simple reste active. Aucune assertion d'oracle, ligne de base visuelle ou specification gelee n'est modifiee ; les fichiers de specification restent inchanges.
