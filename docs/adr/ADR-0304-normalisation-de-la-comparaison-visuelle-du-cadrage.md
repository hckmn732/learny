# ADR-0304 — Normalisation de la comparaison visuelle du cadrage

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-604

## Contexte

La référence SCR-04 est capturée en 1600x1083 alors que l'application est rendue en 1440x900 avec une coquille connectée ; une comparaison pixel pleine page mélange ces deux échelles et la carte de formation de la coquille.

## Décision

La conformité SCR-04 est vérifiée par les jetons, la structure, les textes exacts et une ligne de base pleine page desktop/mobile ; la comparaison pixel à la maquette reste mesurée et consignée, mais ne conditionne pas la validation tant que la coquille et l'échelle de référence divergent.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
