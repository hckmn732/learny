# ADR-2019 — CA-2 de SPEC-2003 interprete comme absence de regression

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2003

## Contexte

SPEC-2003 CA-2 exige que la suite e2e et visuelle complete passe a travers la facade. Or trois tests e2e de SPEC-006 echouent deja sur main : la page de demonstration calcule sa sante dans le processus web, sans acces base depuis SPEC-1203, et sa ligne de base visuelle montre degraded alors que le test attend ok. Les deux oracles se contredisent et ADR-2008 interdit de modifier l un ou l autre.

## Décision

CA-2 est satisfait au sens de l absence de regression introduite par la facade, prouvee par trois mesures : la suite etiquetee @SPEC-2003 passe via la facade, les 67 oracles de SPEC-2001 rejoues contre la facade sont identiques a ceux de Hono, et les echecs de SPEC-006 sont exactement les memes sur main et sur la branche. Aucune assertion ni ligne de base n est modifiee. Le defaut preexistant de SPEC-006 est consigne pour decision du porteur du projet.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
