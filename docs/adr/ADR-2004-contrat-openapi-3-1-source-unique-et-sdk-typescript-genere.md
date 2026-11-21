# ADR-2004 — Contrat OpenAPI 3.1 source unique et SDK TypeScript généré

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-1001, ADR-2003, SPEC-2002

## Contexte

Le contrat est aujourd'hui défini en Zod (`packages/contracts`, 217 opérations) et exporté vers `apps/api/openapi.json`. Le rapport de migration affichait 219 routes : l'écart de 2 vient de l'heuristique de `countRegistryRoutes` qui compte les deux appels `defineRoute(` internes aux fabriques `demo()` et `action()` de `dev-sdd-migration.ts`. Les deux runtimes (TypeScript puis Python) doivent respecter le même contrat pendant la coexistence.

## Décision

- `api/openapi.yaml` (OpenAPI 3.1) devient la source unique du contrat. Il est produit une fois depuis le registre Zod actuel puis versionné ; toute évolution se fait dans ce fichier.
- Le SDK TypeScript utilisé par le web est généré depuis ce fichier ; un test CI vérifie que le registre Zod et le fichier ne divergent pas tant que le runtime TypeScript existe.
- FastAPI expose un document généré à partir des modèles Pydantic ; un test de compatibilité compare chaque opération (méthode, chemin, paramètres, corps, statuts, codes d'erreur, sécurité) au fichier source : toute différence non listée dans `api/contract-exceptions.yaml` (avec ADR) fait échouer la CI.
- Le nombre de référence est **217 opérations** ; les comptages d'inventaire utilisent le registre réel, pas l'heuristique textuelle.

## Conséquences

Le format d'erreur, la pagination, l'idempotence et les événements SSE sont décrits dans le contrat et testés côté Python comme côté client.
