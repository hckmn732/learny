# ADR-2006 — Worker Python maison sur outbox PostgreSQL en remplacement d’Inngest

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-0017, ADR-2003, ADR-2005, SPEC-2102

## Contexte

Les jobs durables et automatismes s'exécutent aujourd'hui sur Inngest (ADR-0017) avec une outbox transactionnelle. Le porteur du projet a choisi un worker Python maison consommant l'outbox Postgres plutôt que le SDK Inngest Python ou Temporal.

## Décision

- Les événements sont écrits dans l'outbox dans la même transaction que l'état métier (identifiant, type, version de schéma, clé d'idempotence, charge utile, date de disponibilité, tentatives).
- `apps/worker-py` réclame les événements par lots avec `SELECT … FOR UPDATE SKIP LOCKED`, appelle directement le cas d'usage applicatif (jamais l'API par HTTP), enregistre le résultat et réessaie avec backoff exponentiel borné ; au-delà du maximum, l'événement passe en lettre morte observable.
- Livraison au moins une fois : chaque consommateur est idempotent via une table de déduplication (événement, consommateur).
- Tâches planifiées : un planificateur singleton protégé par verrou consultatif PostgreSQL, horloge injectable, exécutions enregistrées.
- Pendant la coexistence, chaque type d'événement et chaque tâche a un seul consommateur (`api/ownership.yaml`, ADR-2005) ; Inngest reste propriétaire des entrées non migrées.
- ADR-0017 est remplacé à la fin de SPEC-2302 : Inngest, ses variables et sa synchronisation de déploiement sont retirés.

## Conséquences

Plus de dépendance à un orchestrateur tiers ; la reprise, l'observabilité et les tests de crash deviennent notre responsabilité et sont couverts par SPEC-2102.
