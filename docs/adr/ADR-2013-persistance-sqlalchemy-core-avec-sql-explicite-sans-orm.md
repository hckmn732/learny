# ADR-2013 — Persistance SQLAlchemy Core avec SQL explicite, sans ORM

- **Statut** : Acceptée
- **Origine** : Déduite (canevas technique de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-2002, ADR-2010, SPEC-2101

## Contexte

ADR-2002 retient SQLAlchemy 2 et psycopg 3. Le TypeScript mélange constructeur Drizzle et SQL brut (environ 100 fichiers) et s'appuie sur des fonctions, déclencheurs et verrous consultatifs PostgreSQL.

## Décision

- SQLAlchemy 2 **Core** asynchrone sur psycopg 3, instructions préparées désactivées (`prepare_threshold=None`, compatible pooler transactionnel), validé par prototype.
- Pas de classes ORM ni de dépôts génériques : un module de requêtes par contexte, SQL écrit explicitement (`text()`), porté à l'identique depuis le TypeScript, paramètres liés.
- Transactions via `deps.db.user_tx(actor)` (claims + rôle `authenticated`) et `deps.db.service_tx()` réservé à une liste fermée d'appelants.
- Le schéma reste géré par `packages/db/migrations` ; pas d'Alembic.

## Conséquences

Le portage des requêtes est mécanique et vérifiable ; ADR-2002 est précisé sur ce point (Core seulement).
