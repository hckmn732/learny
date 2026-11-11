# ADR-0203 — Propriete de l'index SDD entre SPEC-003 et SPEC-006

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-003, SPEC-006

## Contexte

Le catalogue attribue la page /_dev/sdd aux SPEC-003 et SPEC-006, sans dependance directe entre elles. Une implementation dans n'importe quel ordre ne doit pas ecraser le travail de l'autre.

## Décision

SPEC-006 fournit la route et le garde d'acces des pages SDD ainsi que la presentation commune; SPEC-003 fournit le contenu de progression de l'index. Si SPEC-006 est executee avant SPEC-003, l'index affiche un etat minimal explicite puis SPEC-003 le complete. Si SPEC-003 est executee avant SPEC-006, SPEC-006 preserve le contenu et ajoute seulement le garde et la presentation. Le registre de demonstrations est ajoute sans supprimer les entrees existantes.

## Conséquences

Les tests des deux specifications couvrent les deux ordres d'integration et la protection en production.
