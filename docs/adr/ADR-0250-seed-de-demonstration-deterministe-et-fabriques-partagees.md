# ADR-0250 — Seed de démonstration déterministe et fabriques partagées

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-115

## Contexte

SPEC-115 doit reproduire les maquettes à l'instant ADR-0047 et servir de base aux fabriques et aux écrans. Les journaux de briques, de révisions et de lacunes sont append-only, et la seed doit rester idempotente sur une base partagée par plusieurs spécifications.

## Décision

Les identifiants du jeu de démonstration sont des UUID v5 dérivés du namespace lrn:demo lui-même dérivé du namespace DNS. La source des valeurs visibles est demo-fixtures.ts avec un champ source SCR/fichier. La seed insère dans l'ordre des FK, en une transaction, avec upsert ciblé sur les identifiants fixes pour les données mutables et DO NOTHING pour les tables append-only. La commande refuse APP_ENV production/preview et tout hôte non local/test avant connexion. Les fabriques de @learny/testing réutilisent les mêmes contraintes (propriétaire cohérent, IDs retournés) et restent exécutées sous withRollback.

## Conséquences

Deux exécutions produisent les mêmes identifiants et les mêmes comptes par table ; une correction de maquette se fait par la fixture source, jamais par une réécriture de journal. Les écrans futurs consomment les mêmes identifiants sans mot de passe en dur.
