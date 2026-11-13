# ADR-0307 — Carte des notions : apports rattachés aux notions de leur chapitre

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-616, BR-CAR-04, ADR-0036

## Contexte

Le modèle de données ne relie pas un apport (resources) à une notion ; seul resources.chapter_id existe, alors que le panneau détail doit afficher « Dans vos apports ».

## Décision

Un apport prêt, non supprimé et appartenant à l'apprenant alimente toutes les notions de son chapitre. Les liens personnels et les apports d'un autre membre restent filtrés par RLS ; aucune relation privée n'est inventée. La disposition reste celle d'ADR-0036.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
