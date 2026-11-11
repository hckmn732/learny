# ADR-0148 — Sélection de l'échauffement

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-410, SPEC-714

## Contexte

BR-AUT-03 parle des « notions vues la veille » et des « prérequis du chapitre » sans préciser la veille d'un lundi ni l'ordre de sélection.

## Décision

1. « La veille » = la date locale la plus récente, strictement antérieure au jour de la séance et au plus 7 jours avant, où l'apprenant a vu au moins une notion.
2. Prérequis = origines directes (un seul niveau) des liens `prerequisite` (du programme et personnels) dont la cible appartient au chapitre à venir ; les notions du chapitre à venir et les notions jamais vues sont exclues.
3. Sélection de N notions : la meilleure candidate « prérequis » puis la meilleure « veille » (si les deux ensembles sont non vides et N ≥ 2), puis complément par rétrievabilité croissante, maîtrise croissante, identifiant.

## Conséquences

Une notion marquée « À revoir » reçoit une revue `again` (ADR-0141) et redevient due le jour même, donc présente au quiz global du soir.
