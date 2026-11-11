# ADR-0111 — Flux de migrations Drizzle vers Supabase

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-101

## Contexte

Les migrations sont générées par `drizzle-kit` dans `packages/db/migrations/` puis appliquées par la Supabase CLI qui exige des fichiers `<version numérique>_<nom>.sql` dans `supabase/migrations/`. Une partie du SQL (fonctions, déclencheurs, politiques RLS, index d'expression, vues) n'est pas exprimable en Drizzle.

## Décision

1. Source de vérité : `packages/db/migrations/NNNN_<nom>.sql` (Drizzle). Le script `packages/db/scripts/sync-migrations.mjs` les recopie à l'identique en `supabase/migrations/2026111100NNNN_<nom>.sql` ; `pnpm db:check` (inclus dans `pnpm lint`) échoue en cas de divergence.
2. Le SQL non exprimable en Drizzle est écrit dans des migrations personnalisées (`drizzle-kit generate --custom --name=<nom>`), une par spécification et par sujet, nommées `<domaine>_<sujet>` (ex. `identity_triggers`, `rls_policies`).
3. Une migration fusionnée dans `main` n'est jamais modifiée ; toute correction est une nouvelle migration.
4. Les index d'expression utilisant `unaccent` passent par `public.immutable_unaccent(text)` (wrapper `IMMUTABLE` de `extensions.unaccent` avec dictionnaire explicite).

## Conséquences

L'ordre d'application est l'ordre des numéros Drizzle ; une spécification ajoute toujours ses migrations après les existantes.
