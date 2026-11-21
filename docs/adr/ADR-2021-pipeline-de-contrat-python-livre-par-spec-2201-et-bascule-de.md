# ADR-2021 — Pipeline de contrat Python livre par SPEC-2201 et bascule dev-jobs laissee a SPEC-2207

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2201, ADR-2012, ADR-2020, SPEC-2207

## Contexte

ADR-2020 constate que la facade Python n a pas de pipeline de contrat et renvoie la livraison de generated/routes.py, generated/models.py et pipeline.py a une specification ulterieure, avec la bascule des 4 routes dev-jobs. SPEC-2201 est cette specification ulterieure : elle livre les artefacts generes et le pipeline complet, mais son perimetre (identity + formation, 45 operations de api/inventory.json) ne contient aucune des 4 routes dev-jobs, qui appartiennent toutes a SPEC-2207 dans l inventaire. Servir ces routes demanderait aussi de porter selectTickUsers/buildLocalTick, hors perimetre.

## Décision

SPEC-2201 livre le pipeline de contrat Python (tools/contract/generate-py-contract.mjs, apps/api-py/src/learny_api/generated/{routes,models}.py, pipeline.py, validate.py) et le branche sur FastAPI ; les 4 routes dev-jobs et les 32 routes speciales restent ts dans api/ownership.yaml et basculent avec SPEC-2207, conformement a l inventaire (champ spec). Le pipeline est desormais le prerequis satisfait de cette bascule.

## Conséquences

Toute operation dont api/inventory.json indique context identity ou formation et spec SPEC-2201 peut passer a py sans nouvel artefact. La porte de sortie de P21 (routes dev-jobs a py) reste partiellement atteinte jusqu a SPEC-2207 ; ADR-2020 reste la reference pour cette dette. Le controle de fraicheur pnpm py:contract:check est branche dans pnpm lint.
