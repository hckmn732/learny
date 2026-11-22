# ADR-2024 — Reprise de formation laissee en TypeScript

- **Statut** : Remplacée par ADR-2034 (portée par SPEC-2207)
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : —

## Contexte

formations.resume appelle replanFormationAfterResume, qui rejoue planSchedule (packages/learning-engine/src/planner/plan.ts, 1142 lignes) puis reconcilePlanSlots. Ce planificateur appartient a la specification SPEC-2202 (contexte learning) et n a pas encore d equivalent Python ; le portage partiel utilise par la reprise ne serait pas iso-comportemental (creneaux recrees differemment, ADR-1001).

## Décision

L operation formations.resume reste ts dans api/ownership.yaml. Les 25 autres operations formation passent a py. La reprise continue d etre servie par Hono a travers la facade, donc les e2e SPEC-618 passent sans modification ; la parite contractuelle n est pas affectee (aucun scenario enregistre sur une route POST). La specification SPEC-2202 portera le planificateur et la reprise sera basculee avec la mutation de la table de propriete, sans changement de contrat.

## Conséquences

CA-1 de SPEC-2201 est satisfait pour 25 operations formation sur 26, avec ce differe documente, comme ADR-2022 pour auth.* et ADR-2023 pour home.get. Une seule ecrivaine par table : Hono reste l unique ecrivain de la reprise et des creneaux qu elle recree.
