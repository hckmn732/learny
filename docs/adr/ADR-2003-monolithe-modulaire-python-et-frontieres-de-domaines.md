# ADR-2003 — Monolithe modulaire Python et frontières de domaines

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-2002, SPEC-2003, SPEC-2201

## Contexte

Le backend TypeScript est réparti en paquets techniques (`services`, `db`, `jobs`, `llm`, `tutor`…). La migration doit organiser le code Python par domaines métier sans multiplier les déploiements.

## Décision

- Un seul workspace uv : `apps/api-py` (application FastAPI), `apps/worker-py` (worker et planificateur, ADR-2006) et `packages-py/learny` (paquet `learny`).
- Le paquet `learny` contient un sous-paquet par contexte : `identity`, `formation`, `learning`, `content`, `tutor`, `assessments`, `engagement`, `billing`, `privacy`, plus `shared` (horloge, erreurs, UoW, outbox, configuration).
- Chaque contexte suit `domain → application → infrastructure` : le domaine n'importe ni FastAPI, ni SQLAlchemy, ni SDK fournisseur ; l'application porte cas d'usage, contrôles d'accès, transactions et ports ; l'infrastructure implémente les ports. Les adaptateurs HTTP/SSE/webhook vivent dans `apps/api-py` et appellent uniquement la couche application.
- Un contexte n'accède jamais aux tables ou modèles ORM d'un autre ; il passe par une commande/requête applicative ou un événement versionné.
- import-linter vérifie ces contrats en CI.

## Conséquences

Pas de microservices. Une seule image Docker sert l'API et le worker avec deux commandes de démarrage.
