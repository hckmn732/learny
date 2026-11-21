# ADR-2014 — Livraisons de jobs, coexistence asynchrone et bascule groupée des consommateurs

- **Statut** : Acceptée
- **Origine** : Déduite (canevas technique de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-2005, ADR-2006, SPEC-2102, SPEC-2207

## Contexte

Inngest offre fan-out, reprises, sommeil jusqu'à une date, concurrence par clé et idempotence. Pendant la migration, des événements écrits par Python peuvent devoir être consommés par des fonctions TypeScript. Un prototype (spikes.md §C) valide un modèle à baux `FOR UPDATE SKIP LOCKED`.

## Décision

- Migration additive : table `job_deliveries` (événement × consommateur, statut, tentatives, `run_after`, bail) et colonne `event_outbox.dispatched_at` ; le TypeScript les ignore.
- Le répartiteur Python crée une livraison par consommateur Python abonné ; le runner les réclame avec bail, réessaie avec backoff, passe en échec définitif au-delà du maximum.
- `step.sleepUntil` devient `run_at` du consommateur ; la seule exception est le résumé quotidien, qui émet un événement interne `job/daily-digest` par utilisateur.
- La concurrence par clé de limite 1 devient une garde de transition d'état dans le cas d'usage ; les limites supérieures (débit) sont abandonnées.
- Tous les consommateurs et crons basculent ensemble dans **SPEC-2207**, après le portage de tous les contextes ; avant cela, en mode `inline` (tests), Python relaie vers Hono les événements dont le consommateur est encore TypeScript (pont supprimé en SPEC-2207).
- En production, les jobs basculent avant les routes HTTP (SPEC-2301), si bien qu'aucun pont n'est nécessaire.

## Conséquences

Ajout d'une spécification SPEC-2207 ; SPEC-2102 ne bascule que la démonstration `dev-jobs`.
