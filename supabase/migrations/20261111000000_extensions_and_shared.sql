-- Extensions Postgres et fonctions partagées (SPEC-101 ET-4, ADR-0006, ADR-0111).
-- Migration personnalisée : le SQL des extensions et des fonctions n'est pas exprimable en Drizzle.
-- Ne jamais modifier cette migration après fusion : ajouter une nouvelle migration.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Maintient updated_at à chaque update ; utilisé par toutes les tables mutables (CL-6).
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Wrapper IMMUTABLE de unaccent, obligatoire pour les index d'expression (FTS SPEC-103, SPEC-112).
create or replace function public.immutable_unaccent(text) returns text
  language sql immutable parallel safe strict
  set search_path = ''
  as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;
