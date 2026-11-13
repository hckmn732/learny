# ADR-0298 — Qualification des modèles personnels : batterie, capacités et exécution

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-506, SPEC-501, SPEC-505, ADR-0013, ADR-0048

## Contexte

SPEC-506 impose une batterie en quatre étapes et treize briques, mais ne précise pas où vit
l'adaptateur des briques (le paquet `llm` ne peut pas importer `bricks`), comment le rapport
survit à plusieurs modèles d'une même clé, ni comment concilier l'idempotence demandée avec une
route synchrone. Le catalogue de fournisseurs ne déclare pas non plus la capacité d'entrée d'image
exigée par la tâche `light`.

## Décision

1. `packages/llm/src/qualification/run.ts` exécute la batterie ; `@learny/services` injecte un
   adaptateur construit sur `BRICK_TYPES`, `brickRegistry` et `validateBrick`. Les schémas des
   treize types restent donc la seule source de validation, sans franchir la frontière de paquets.
2. Le rapport complet est stocké par modèle dans `ai_credentials.qualification.models[modelId]`.
   `status` vaut `qualified` dès qu'un modèle de la clé est qualifié et `qualified_at` n'est écrit
   qu'à la fin d'une batterie réussie. Les lignes antérieures à SPEC-506, sans rapport par modèle,
   conservent leur statut global pour ne pas casser les seeds et démonstrations existants.
3. La qualification reste une exécution synchrone bornée (4 étapes, 13 briques, délais de
   `TASK_CONFIG.light`). Une carte en mémoire rend deux appels concurrents du même processus
   idempotents ; un marqueur `qualification.run` sous verrou de ligne renvoie `409
   QUALIFICATION_IN_PROGRESS` à un autre processus. Aucun job Inngest n'est introduit.
4. Le service vérifie la propriété de la clé via le client utilisateur et RLS, puis exécute la
   batterie avec `serviceDb` et l'`userId` explicite : c'est l'opération système autorisée par
   ET-4, et la clé n'est déchiffrée qu'à l'intérieur de `@learny/llm`.
5. Les capacités prouvées sont `tools`, `structured` et `passage_refs` (batterie complète) ;
   `web_search` découle d'un appel d'outil réussi (repli Tavily de SPEC-512). `vision` est déclarée
   par le catalogue fournisseur (`anthropic`, `openai`) et conditionne l'affectation à `light`.

## Conséquences

L'affectation à une tâche exige le rapport du modèle précis et toutes ses capacités ; une brique
invalide bloque donc ce modèle sans effacer le détail des douze autres. Les modèles textuels d'un
fournisseur dont le catalogue ne déclare pas l'image restent refusés pour `light`, ce qui est
conservateur et révisable avec le catalogue. Aucune clé, aucun chiffré et aucun contenu de prompt
n'entre dans le rapport ou les journaux.
