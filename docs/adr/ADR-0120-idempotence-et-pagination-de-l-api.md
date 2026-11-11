# ADR-0120 — Idempotence et pagination de l'API

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-201, SPEC-208

## Contexte

`docs/architecture/api.md` impose l'en-tête `Idempotency-Key` sur les POST qui créent et une pagination `cursor`/`limit`, sans préciser le traitement d'une clé réutilisée, d'un traitement concurrent, d'une erreur serveur ni le format du curseur.

## Décision

- Clé : `^[A-Za-z0-9_-]{8,128}$`, portée par `(user_id, key)` ; seules les routes authentifiées sont idempotentes.
- Empreinte : SHA-256 de `méthode + chemin du gabarit + JSON canonique des paramètres + JSON canonique du corps`, stockée dans la nouvelle colonne `idempotency_keys.request_hash` ; fin de traitement dans `completed_at`.
- Réservation par `insert … on conflict do nothing` (`status_code = 0` = en cours). Conflit : autre route ou autre empreinte → 422 `IDEMPOTENCY_KEY_REUSED` ; en cours → 409 `IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 1` ; terminé → rejeu à l'identique avec `Idempotent-Replayed: true`.
- Réponses 2xx et 4xx enregistrées ; 5xx ou exception → ligne supprimée (nouvel essai possible).
- Durée de validité 24 h (ligne plus ancienne = absente) ; purge horaire par SPEC-208.
- Curseur : base64url de `{ "k": <clé de tri>, "id": <uuid> }`, tri `(k desc, id desc)`, lecture `limit + 1` ; curseur illisible → 400 `VALIDATION_FAILED`.

## Conséquences

Migration additive sur `idempotency_keys` (SPEC-201). Les clients doivent réutiliser la même clé lors d'un nouvel essai réseau, ce que fait le client typé.
