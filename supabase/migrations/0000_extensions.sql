-- Extensions de la base locale (SPEC-008, EF-4 ; ADR-0006).
-- Migration d'amorçage idempotente : ne pas modifier après fusion.
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
