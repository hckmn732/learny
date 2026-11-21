# ADR-2007 — Hébergement de l’API et du worker Python sur Coolify

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-0006, ADR-2003, SPEC-2301

## Contexte

Un serveur ASGI persistant avec SSE et un worker de fond ne conviennent pas à l'hébergement serverless actuel. Le porteur du projet a retenu Coolify ; le web Next.js reste sur son hébergement actuel.

## Décision

- Une image Docker reproductible (multi-étapes, uv, utilisateur non root) est construite par la CI pour chaque commit de `main`.
- Coolify déploie deux services depuis cette image : `api` (Uvicorn, sondes `/health/live` et `/health/ready`) et `worker` (worker + planificateur). La migration de schéma reste un job singleton de release.
- Les serveurs Coolify et tous les sous-traitants sont dans l'Union européenne (BR-PLA-04) ; les secrets sont fournis par Coolify, jamais commités.
- Le web pointe vers l'API par sa variable d'URL interne ; la bascule d'URL est réversible.

## Conséquences

L'existence d'une instance Coolify de staging et de production est une dépendance externe ; tant qu'elle manque, SPEC-2301 consigne un blocage `--external` et prouve le reste en local.
