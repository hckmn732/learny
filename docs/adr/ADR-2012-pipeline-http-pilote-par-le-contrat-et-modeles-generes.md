# ADR-2012 — Pipeline HTTP piloté par le contrat et modèles générés

- **Statut** : Acceptée
- **Origine** : Déduite (canevas technique de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-2002, ADR-2004, SPEC-2002, SPEC-2003

## Contexte

Le backend TypeScript décrit chaque route comme une donnée (`defineRoute`) et applique un pipeline unique (`route-handler.ts`). Un prototype (docs/architecture/python-backend/spikes.md §F) montre que générer les modèles Pydantic depuis l'OpenAPI actuel produit 205 noms numérotés et des types date/UUID/e-mail qui changent la sérialisation.

## Décision

- `api/openapi.yaml` porte une extension `x-learny` par opération (auth, rateLimit, idempotent, freshAuth, legalAcceptance, validationStatus, successStatus) et des schémas nommés `<RouteId>Params|Query|Body|Output`.
- Python génère depuis ce fichier une table de routes et des modèles Pydantic (formats date-time/date/uuid/email/uri conservés en chaînes avec leur motif) ; ces modèles sont les DTO des cas d'usage, sans couche parallèle.
- Un pipeline unique reproduit les 12 étapes de `route-handler.ts` dans le même ordre ; les handlers sont minces et enregistrés par identifiant de route.
- FastAPI sert d'hôte ASGI et de routeur uniquement : pas d'analyse de corps ni d'OpenAPI générée par FastAPI ; le document servi est le fichier du contrat.
- Le contrôle de compatibilité d'ADR-2004 compare la table de routes Python et le fichier source au lieu d'un document produit par FastAPI.

## Conséquences

Le comportement HTTP est porté une seule fois, de façon centralisée ; aucune route ne peut diverger du contrat par construction.
