# ADR-0122 — Émission transactionnelle des événements par boîte d'envoi

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-203, SPEC-202, SPEC-211

## Contexte

Le flux « Mutation » (`docs/architecture/overview.md` §4) émet un événement après la transaction. Un envoi direct à Inngest après le commit perd l'événement si Inngest est indisponible ; un envoi avant le commit déclenche des traitements sur des données annulées. Par ailleurs la CI n'exécute pas d'Inngest Dev Server pendant les tests e2e.

## Décision

- Boîte d'envoi transactionnelle : table `event_outbox` (`event_id` unique, `name`, `data`, `user_id`, `sent_at`, `attempts`, `last_error`, `failed`), alimentée dans la transaction métier par la fonction SQL `security definer` `enqueue_event` (aucun accès direct des utilisateurs).
- Après commit : envoi immédiat à Inngest avec l'identifiant `event_id` (déduplication) ; en cas d'échec, renvoi à chaque tick horaire ; `failed = true` après 10 tentatives, avec signalement d'erreur.
- Identifiant par défaut : `<nom>:<32 premiers caractères du SHA-256 du JSON canonique>` ; identifiant métier explicite quand l'unicité est sémantique.
- Validation Zod du contenu avant écriture.
- `JOBS_MODE=inline` (tests, CI, démonstration ; interdit en production) : les fonctions abonnées sont exécutées dans le processus avec `@inngest/test` au lieu d'être envoyées à Inngest.
- Nettoyage : lignes envoyées supprimées après 7 jours (traitement nocturne).

## Conséquences

Livraison « au moins une fois » : les consommateurs restent idempotents. Nouvelle table hors `docs/architecture/data-model.md`, à y ajouter.
