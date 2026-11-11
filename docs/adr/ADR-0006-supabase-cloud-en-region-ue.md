# ADR-0006 — Supabase Cloud en région UE

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-008, SPEC-101

## Contexte

Base relationnelle, recherche vectorielle, authentification et fichiers chez un seul fournisseur, données en UE, auto-hébergement possible plus tard.

## Décision

Supabase : Postgres (extensions pgvector, unaccent, pg_trgm, pgcrypto), Auth, Storage. Production : projet en région `eu-central-1` (Francfort). Local et CI : Supabase CLI (Docker). Accès applicatif via Drizzle ORM.

## Conséquences

Migration vers un Supabase auto-hébergé possible (Docker Compose officiel).
