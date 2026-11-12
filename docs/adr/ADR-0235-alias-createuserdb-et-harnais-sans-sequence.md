# ADR-0235 — Alias createUserDb et harnais sans séquence

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-101

## Contexte

ET-1 demande d'exporter createUserDb alors que ET-5 ne définit que userDb(ctx). ET-1 liste aussi resetSequenceFreeIds sans préciser son comportement, alors que toutes les clés primaires du modèle de données sont des UUID générés par gen_random_uuid().

## Décision

userDb reste l'entrée canonique ; createUserDb est exporté comme alias strict de userDb pour satisfaire le contrat ET-1. resetSequenceFreeIds est exporté comme point d'extension asynchrone sans effet : aucune table publique n'utilise de séquence. Toute future table à identifiant sérialisé devra implémenter la remise à zéro dans ce module et le documenter par un ADR.

## Conséquences

Les deux noms sont équivalents et testables ; le harnais ne masque aucune remise à zéro implicite de données.
