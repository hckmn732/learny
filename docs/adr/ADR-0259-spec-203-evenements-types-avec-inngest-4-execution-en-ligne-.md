# ADR-0259 — SPEC-203 : événements typés avec Inngest 4, exécution en ligne et frontières de paquets

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-203, ADR-0017, ADR-0122, ADR-0123

## Contexte

Le dépôt utilise Inngest 4 (SPEC-007) : EventSchemas().fromZod de la spécification n'existe plus, @inngest/test 1.0 ne modélise pas les reprises ni les sommeils, et @learny/services émettra des événements (SPEC-202) : @learny/jobs ne peut donc pas importer @learny/services (cycle de paquets, refusé par Turborepo).

## Décision

Le catalogue typé est le registre Zod EVENTS de @learny/contracts : l'émission (EventInput<N>) et les handlers (EventData<N>) sont typés par lui, et defineFunction revalide la donnée reçue (NonRetriableError). Les déclencheurs sont passés en chaîne ({ event: nom }). Le mode inline pilote InngestTestEngine à travers transformCtx : step.sleep, sleepUntil et waitForEvent sont résolus immédiatement, step.sendEvent revient dans le dispatcher, les résultats des étapes terminées sont rejoués (jamais ré-exécutés) et le moteur est relancé au plus 4 fois ; Inngest n'est chargé que par import dynamique. Le contexte des handlers (JobContext, de même forme que SystemContext) est construit dans @learny/jobs. Le tick horaire fige T dans une étape tick-instant avant les quatre étapes de la spécification, pour qu'un rejeu ne voie pas une autre minute. zonedParts et localTimeToInstant vivent dans packages/core/src/zoned-time.ts (et non time.ts, que SPEC-207 crée) pour éviter un conflit de fusion ; SPEC-207 peut les y réexporter.

## Conséquences

Un autre module ne doit pas dépendre de EventSchemas. Une fonction ajoutée au registre est exécutable telle quelle en mode inline. Le parent peut déplacer zoned-time.ts dans time.ts sans changer les signatures.
